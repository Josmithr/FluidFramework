import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
	cpSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "mocha";
import { analyzeAPIs, DiagnosticCode, ReleaseLevel } from "../index.js";
import { decodeDependencyModel } from "../model-generation/dependencyModel.js";
import { decodeDependencyModels } from "../model.js";
import { assertSnapshot } from "./snapshotUtils.js";
import { compareReviewBaseline } from "../report-generation/reviewBaseline.js";
import type { DependencyApi } from "../analysis-types/dependencyModel.js";

describe("Dependency suite models", () => {
	let directory: string;
	beforeEach(() => {
		directory = mkdtempSync(path.join(tmpdir(), "api-analyzer-suite-"));
		mkdirSync(path.join(directory, "node_modules", "dependency"), { recursive: true });
		cpSync(
			new URL("../../src/test/fixtures/suite/unused.d.ts", import.meta.url),
			path.join(directory, "index.d.ts"),
		);
		cpSync(
			new URL("../../src/test/fixtures/suite/dependency.d.ts", import.meta.url),
			path.join(directory, "node_modules", "dependency", "index.d.ts"),
		);
		writeFileSync(
			path.join(directory, "package.json"),
			JSON.stringify({ name: "consumer", dependencies: { dependency: "1.0.0" } }),
		);
		writeFileSync(
			path.join(directory, "tsconfig.json"),
			JSON.stringify({ compilerOptions: { strict: true }, files: ["index.d.ts"] }),
		);
		writeFileSync(
			path.join(directory, "node_modules", "dependency", "package.json"),
			JSON.stringify({ name: "dependency", version: "1.0.0", types: "index.d.ts" }),
		);
		writeFileSync(
			path.join(directory, "node_modules", "dependency", "tsconfig.json"),
			JSON.stringify({ compilerOptions: { strict: true }, files: ["index.d.ts"] }),
		);
	});
	afterEach(() => rmSync(directory, { recursive: true, force: true }));

	it("rejects re-export release changes without replacing source documentation", async () => {
		// Build the dependency model first so consumers validate against the source API's metadata.
		const root = path.join(directory, "node_modules", "dependency");
		const sourceFixture = new URL(
			"../../src/test/fixtures/suite/reexport-source.d.ts",
			import.meta.url,
		);
		const forwardInput = readFileSync(
			new URL("../../src/test/fixtures/suite/reexport-forward.d.ts", import.meta.url),
			"utf8",
		);
		cpSync(sourceFixture, path.join(root, "index.d.ts"));
		const configuration = {
			project: "tsconfig.json",
			entrypoints: [{ name: ".", path: "index.d.ts" }],
		};
		const source = await analyzeAPIs({ ...configuration, packageName: "dependency" }, root);
		assert(source.ok, JSON.stringify(source));
		writeFileSync(path.join(root, "api-model.json"), source.value.generateModel());

		// Exercise named, type-only, and star exports: tags cannot make the source more or less public.
		// A matching beta tag or no tag is allowed; an additional conflicting tag must still fail.
		for (const [tag, statement] of [
			["@public", 'export { foo as renamed } from "dependency";'],
			["@alpha", 'export type { foo } from "dependency";'],
			["@internal", 'export * from "dependency";'],
			["@beta", 'export type { foo as renamed } from "dependency";'],
			["", 'export * from "dependency";'],
			["@public @beta", 'export { foo } from "dependency";'],
		] as const) {
			writeFileSync(
				path.join(directory, "index.d.ts"),
				forwardInput
					.replace("@beta", tag)
					.replace('export { foo as renamed } from "dependency";', statement),
			);

			// Release agreement is mandatory even when missing-tag and TSDoc-syntax checks are disabled.
			const result = await analyzeAPIs(
				{
					...configuration,
					packageName: "consumer",
					rules: { requireReleaseLevel: false, validateTsdocSyntax: false },
					suite: { packages: ["dependency"], modelFile: "api-model.json" },
				},
				directory,
			);
			assert.equal(result.ok, tag === "@beta" || tag === "", tag);
			if (result.ok) {
				// Accepted forwarding retains beta output and does not substitute the re-export's prose.
				// The fixture's unresolved Missing link must also be ignored for analysis to succeed.
				const report = result.value.generateReport(".", {
					name: "beta",
					releaseLevels: [ReleaseLevel.Beta],
				});
				assert(report.ok);
				assert(report.value.includes("@beta"));
				assert(!result.value.generateModel().includes("Ignored documentation"));
			} else {
				// Attribute the failure to re-export validation, not an unrelated input error.
				assert.match(JSON.stringify(result), /re-export/i);
			}
		}

		// The local overloads have different source levels, so neither beta nor public matches them all.
		// Leaving the forwarding statement untagged preserves each overload's original level.
		cpSync(sourceFixture, path.join(directory, "source.d.ts"));
		for (const tag of ["@beta", "@public", ""]) {
			writeFileSync(
				path.join(directory, "forward.d.ts"),
				forwardInput
					.replace("@beta", tag)
					.replace("foo as renamed", "local")
					.replace('"dependency"', '"./source.js"'),
			);

			// An untagged final alias must not hide a conflict on an intermediate export statement.
			writeFileSync(
				path.join(directory, "index.d.ts"),
				forwardInput
					.replace("@beta", "")
					.replace("foo as renamed", "local as renamed")
					.replace('"dependency"', '"./forward.js"'),
			);
			const result = await analyzeAPIs(
				{ ...configuration, packageName: "consumer" },
				directory,
			);
			assert.equal(result.ok, tag === "", JSON.stringify(result));
			if (!result.ok) {
				// Identify the conflicting intermediate file so the author knows where to correct the tag.
				assert.equal(
					result.diagnostics[0]?.code,
					DiagnosticCode.ClassificationReleaseConflict,
				);
				assert.match(result.diagnostics[0]?.message ?? "", /forward\.d\.ts/);
			}
		}
	});

	it("retains recursive and empty module namespaces after compiler disposal", async () => {
		cpSync(
			new URL(
				"../../src/test/fixtures/repository/empty/packages/empty/src/index.ts",
				import.meta.url,
			),
			path.join(directory, "empty.d.ts"),
		);
		cpSync(
			new URL(
				"../../src/test/fixtures/suite/module-namespace-recursive.d.ts",
				import.meta.url,
			),
			path.join(directory, "index.d.ts"),
		);
		const result = await analyzeAPIs(
			{
				packageName: "consumer",
				project: "tsconfig.json",
				entrypoints: [{ name: ".", path: "index.d.ts" }],
			},
			directory,
		);
		assert(result.ok, JSON.stringify(result));
		const report = result.value.generateReport(".", {
			name: "public",
			releaseLevels: [ReleaseLevel.Public],
		});
		assert(report.ok);
		assert(report.value.includes("export namespace Empty"));
		assert(report.value.includes("export import Self = Self;"));
		const decoded = decodeDependencyModel(result.value.generateModel(), "consumer");
		assert(decoded.ok, JSON.stringify(decoded));
		assert.deepEqual(
			decoded.value.exports.find((entry) => entry.path.join(".") === "Self.Self")
				?.referencePath,
			["Self"],
		);
	});

	for (const compilerPackage of ["typescript6", "typescript"]) {
		it(`preserves documented module namespaces with ${compilerPackage} inputs`, async () => {
			const root = path.join(directory, "node_modules", "dependency");
			const require = createRequire(import.meta.url);
			const compiler = path.join(
				path.dirname(require.resolve(`${compilerPackage}/package.json`)),
				"bin/tsc",
			);
			for (const [cwd, fixture] of [
				[root, "module-namespace-dependency"],
				[directory, "module-namespace"],
			]) {
				assert(cwd !== undefined && fixture !== undefined);
				cpSync(
					new URL(`../../src/test/fixtures/suite/${fixture}.ts`, import.meta.url),
					path.join(cwd, "index.ts"),
				);
				writeFileSync(
					path.join(cwd, "package.json"),
					JSON.stringify({
						name: cwd === root ? "dependency" : "consumer",
						type: "module",
						types: "index.d.ts",
						...(cwd === root ? {} : { dependencies: { dependency: "1.0.0" } }),
					}),
				);
				execFileSync(
					process.execPath,
					[
						compiler,
						"index.ts",
						"--ignoreConfig",
						"--declaration",
						"--emitDeclarationOnly",
						"--strict",
						"--module",
						"NodeNext",
					],
					{ cwd, stdio: "inherit" },
				);
				rmSync(path.join(cwd, "index.ts"));
			}
			const configuration = {
				project: "tsconfig.json",
				entrypoints: [{ name: ".", path: "index.d.ts" }],
			};
			const source = await analyzeAPIs({ ...configuration, packageName: "dependency" }, root);
			assert(source.ok, JSON.stringify(source));
			writeFileSync(path.join(root, "api-model.json"), source.value.generateModel());
			const result = await analyzeAPIs(
				{
					...configuration,
					packageName: "consumer",
					suite: { packages: ["dependency"], modelFile: "api-model.json" },
				},
				directory,
			);
			assert(result.ok, JSON.stringify(result));
			const report = result.value.generateReport(".", {
				name: "beta",
				releaseLevels: [ReleaseLevel.Beta],
			});
			assert(report.ok, JSON.stringify(report));
			assertSnapshot(report.value, "report.module-namespace-suite.md");
			const model = decodeDependencyModel(result.value.generateModel(), "consumer");
			assert(model.ok, JSON.stringify(model));
			assert.equal(
				model.value.apis.find((api) => api.name === "Tools")?.documentation.links.length,
				2,
			);
			assert.equal(
				model.value.exports.find((entry) => entry.path.join(".") === "Tools")?.items[0],
				model.value.exports.find((entry) => entry.path.join(".") === "Renamed")?.items[0],
			);
			assert.equal(
				model.value.exports.find((entry) => entry.path.join(".") === "Types.foo")?.typeOnly,
				true,
			);
			writeFileSync(path.join(directory, "api-model.json"), result.value.generateModel());
			const downstream = path.join(directory, "downstream");
			mkdirSync(path.join(downstream, "node_modules"), { recursive: true });
			symlinkSync(directory, path.join(downstream, "node_modules", "consumer"), "dir");
			writeFileSync(
				path.join(downstream, "package.json"),
				JSON.stringify({
					name: "downstream",
					type: "module",
					dependencies: { consumer: "1.0.0" },
				}),
			);
			writeFileSync(
				path.join(downstream, "tsconfig.json"),
				JSON.stringify({ compilerOptions: { strict: true }, files: ["index.d.ts"] }),
			);
			cpSync(
				new URL(
					"../../src/test/fixtures/suite/module-namespace-forward.d.ts",
					import.meta.url,
				),
				path.join(downstream, "index.d.ts"),
			);
			const forwarded = await analyzeAPIs(
				{
					...configuration,
					packageName: "downstream",
					suite: { packages: ["consumer", "dependency"], modelFile: "api-model.json" },
				},
				downstream,
			);
			assert(forwarded.ok, JSON.stringify(forwarded));
			const forwardedModel = decodeDependencyModel(
				forwarded.value.generateModel(),
				"downstream",
			);
			assert(forwardedModel.ok, JSON.stringify(forwardedModel));
			assert.equal(
				forwardedModel.value.apis.find((api) => api.name === "use")?.documentation.links
					.length,
				1,
			);
			const forwardedReport = forwarded.value.generateReport(".", {
				name: "beta",
				releaseLevels: [ReleaseLevel.Beta],
			});
			assert(
				forwardedReport.ok && forwardedReport.value.includes("// Re-exported from `consumer`"),
			);
			const input = readFileSync(path.join(directory, "index.d.ts"), "utf8");
			writeFileSync(
				path.join(directory, "index.d.ts"),
				input.replace("@beta", "@beta @sealed"),
			);
			const tagged = await analyzeAPIs(
				{
					...configuration,
					packageName: "consumer",
					suite: { packages: ["dependency"], modelFile: "api-model.json" },
				},
				directory,
			);
			assert(tagged.ok, JSON.stringify(tagged));
			const selected = tagged.value.generateReport(
				".",
				{ name: "beta", releaseLevels: [ReleaseLevel.Beta], requireTags: ["@sealed"] },
				{ additionalTags: [] },
			);
			assert(selected.ok);
			assert.equal(selected.value, report.value);
			for (const tag of ["", "@public", "@alpha", "@internal"]) {
				writeFileSync(path.join(directory, "index.d.ts"), input.replace("@beta", tag));
				const invalid = await analyzeAPIs(
					{
						...configuration,
						packageName: "consumer",
						rules: { requireReleaseLevel: false },
						suite: { packages: ["dependency"], modelFile: "api-model.json" },
					},
					directory,
				);
				assert(!invalid.ok, tag);
				assert.equal(
					invalid.diagnostics[0]?.code,
					tag === ""
						? DiagnosticCode.ClassificationReleaseMissing
						: DiagnosticCode.ClassificationContainerMismatch,
				);
			}
			writeFileSync(path.join(directory, "index.d.ts"), input);
			const empty = result.value.generateReport(".", {
				name: "public",
				releaseLevels: [ReleaseLevel.Public],
			});
			assert(empty.ok && empty.value.includes("No selected exports"));
			rmSync(path.join(directory, "index.d.ts"));
			assert.deepEqual(
				result.value.generateReport(".", { name: "beta", releaseLevels: [ReleaseLevel.Beta] }),
				report,
			);
		});

		it(`filters report imports after selection with ${compilerPackage} inputs`, async () => {
			const root = path.join(directory, "node_modules", "dependency");
			writeFileSync(
				path.join(root, "package.json"),
				JSON.stringify({
					name: "dependency",
					version: "1.0.0",
					type: "module",
					types: "index.d.ts",
				}),
			);
			writeFileSync(
				path.join(directory, "package.json"),
				JSON.stringify({
					name: "consumer",
					type: "module",
					dependencies: { dependency: "1.0.0" },
				}),
			);
			cpSync(
				new URL("../../src/test/fixtures/suite/report-imports-dependency.ts", import.meta.url),
				path.join(root, "index.ts"),
			);
			cpSync(
				new URL("../../src/test/fixtures/suite/report-imports.ts", import.meta.url),
				path.join(directory, "index.ts"),
			);
			const require = createRequire(import.meta.url);
			const compiler = path.join(
				path.dirname(require.resolve(`${compilerPackage}/package.json`)),
				"bin/tsc",
			);
			const emit = (cwd: string): void => {
				execFileSync(
					process.execPath,
					[
						compiler,
						"index.ts",
						"--ignoreConfig",
						"--declaration",
						"--emitDeclarationOnly",
						"--strict",
						"--module",
						"NodeNext",
					],
					{ cwd, stdio: "inherit" },
				);
			};
			emit(root);
			emit(directory);
			const configuration = {
				packageName: "consumer",
				project: "tsconfig.json",
				entrypoints: [{ name: ".", path: "index.d.ts" }],
			};
			const result = await analyzeAPIs(configuration, directory);
			assert(result.ok, JSON.stringify(result));
			const model = result.value.generateModel();
			for (const [name, level] of [
				["public", ReleaseLevel.Public],
				["beta", ReleaseLevel.Beta],
			] as const) {
				const selection = { name, releaseLevels: [level] };
				const report = result.value.generateReport(".", selection);
				assert(report.ok, JSON.stringify(report));
				assertSnapshot(report.value, `report.imports.${name}.md`);
				const omitted = result.value.generateReport(".", selection, { includeImports: false });
				assert(omitted.ok);
				assert.equal(omitted.value, report.value.replace(/(?:^import[^\n]+;\n)+\n/m, ""));
				assert.deepEqual(result.value.generateReport(".", selection), report);
			}
			assert.equal(result.value.generateModel(), model);
			const dependency = await analyzeAPIs(
				{ ...configuration, packageName: "dependency" },
				root,
			);
			assert(dependency.ok, JSON.stringify(dependency));
			writeFileSync(path.join(root, "api-model.json"), dependency.value.generateModel());
			writeFileSync(
				path.join(directory, "index.d.ts"),
				'// Re-exported suite declarations need no import bindings.\nimport type { Input } from "dependency";\nexport type { Input };\n/**\n * Refers to the rendered suite declaration.\n * @public\n */\nexport type Copy = Input;\n',
			);
			const reexport = await analyzeAPIs(
				{ ...configuration, suite: { packages: ["dependency"], modelFile: "api-model.json" } },
				directory,
			);
			assert(reexport.ok, JSON.stringify(reexport));
			const reexportReport = reexport.value.generateReport(".", {
				name: "public",
				releaseLevels: [ReleaseLevel.Public],
			});
			assert(reexportReport.ok);
			assertSnapshot(reexportReport.value, "report.imports.reexport.md");
		});
	}

	it("forbids module-based references while preserving named package exports", async () => {
		const root = path.join(directory, "node_modules", "dependency");
		writeFileSync(
			path.join(root, "index.d.ts"),
			"/**\n * Target documentation.\n * @public\n */\nexport declare function target(): void;\n",
		);
		const common = {
			project: "tsconfig.json",
			entrypoints: [{ name: ".", path: "index.d.ts" }],
		};
		const dependency = await analyzeAPIs(
			{
				...common,
				packageName: "dependency",
				entrypoints: [...common.entrypoints, { name: "./widgets", path: "index.d.ts" }],
			},
			root,
		);
		assert.equal(dependency.ok, true, JSON.stringify(dependency));
		writeFileSync(path.join(root, "api-model.json"), dependency.value.generateModel());
		const configuration = {
			...common,
			packageName: "consumer",
			suite: { packages: ["dependency"], modelFile: "api-model.json" },
		};
		for (const reference of [
			"consumer#",
			"dependency#",
			"dependency/widgets#",
			"./widgets#",
			"./widgets#target",
			"../widgets#target",
			"dependency#Target.[./keys#token]",
			"dependency#target",
			"dependency/widgets#target",
		]) {
			const permitted =
				reference === "dependency#target" || reference === "dependency/widgets#target";
			for (const comment of [
				`/**\n * See {@link ${reference}}.\n * @public\n */\nexport declare function receiver(): void;`,
				`/**\n * {@inheritDoc ${reference}}\n * @public\n */\nexport declare function receiver(): void;`,
				`/**\n * See {@link ${reference}}.\n * @packageDocumentation\n */\nexport {};`,
			]) {
				writeFileSync(path.join(directory, "index.d.ts"), comment);
				const result = await analyzeAPIs(configuration, directory);
				assert.equal(result.ok, permitted, JSON.stringify({ reference, result }));
				if (!result.ok) {
					assert.equal(result.diagnostics[0]?.code, DiagnosticCode.DocumentationUnsupported);
					assert.match(
						result.diagnostics[0]?.message ?? "",
						/Module-based documentation references are forbidden/,
					);
					assert.equal("value" in result, false);
				}
			}
		}
	});

	it("keeps outside-suite and standard-library member graphs opaque", async () => {
		writeFileSync(
			path.join(directory, "node_modules", "dependency", "index.d.ts"),
			`export interface External<Value> {
				value: Value;
				name: string;
			}`,
		);
		writeFileSync(
			path.join(directory, "index.d.ts"),
			`import type { External } from "dependency";
			/**
			 * Preview data.
			 * @beta
			 */
			export interface Preview { text: string; }
			/**
			 * Local view of a foreign base.
			 * @beta
			 */
			export interface ExternalView extends External<Preview> {
				/**
				 * Local override.
				 */
				name: "local";
			}
			/**
			 * Foreign alias.
			 * @beta
			 */
			export type ExternalAlias = External<Preview>;
			/**
			 * Named standard-library collection.
			 * @public
			 */
			export interface NamedLabels extends ReadonlyArray<string> {
				name: string;
			}`,
		);
		const result = await analyzeAPIs(
			{
				packageName: "consumer",
				project: "tsconfig.json",
				entrypoints: [{ name: ".", path: "index.d.ts" }],
				referencePolicies: { releaseCompatibility: true },
			},
			directory,
		);
		assert.equal(result.ok, true, JSON.stringify(result));
		const report = result.value.generateReport(".", {
			name: "all",
			releaseLevels: [ReleaseLevel.Public, ReleaseLevel.Beta],
		});
		assert.equal(report.ok, true, JSON.stringify(report));
		assert.match(report.value, /ExternalView extends External<Preview>/);
		assert.match(report.value, /name: "local"/);
		assert.match(report.value, /NamedLabels extends ReadonlyArray<string>/);
		assert.doesNotMatch(report.value, /value:|map\(/);
		const model = decodeDependencyModel(result.value.generateModel(), "consumer");
		assert.equal(model.ok, true, JSON.stringify(model));
		assert(model.value.apis.every((item) => item.origin.packageName === "consumer"));
		const configuration = {
			packageName: "consumer",
			project: "tsconfig.json",
			entrypoints: [{ name: ".", path: "index.d.ts" }],
			referencePolicies: { releaseCompatibility: true },
		};
		const consumerFile = path.join(directory, "index.d.ts");
		const original = readFileSync(consumerFile, "utf8");
		for (const invalid of [
			original.replace(
				"* Local view of a foreign base.\n\t\t\t * @beta",
				"* Local view of a foreign base.\n\t\t\t * @public",
			),
			original.replace("* Local override.", "* Local override.\n\t\t\t\t * @public"),
		]) {
			writeFileSync(consumerFile, invalid);
			const checked = await analyzeAPIs(configuration, directory);
			assert.equal(checked.ok, false);
			assert(
				checked.diagnostics.some(
					(diagnostic) =>
						diagnostic.code === DiagnosticCode.ReferencePolicy ||
						diagnostic.code === DiagnosticCode.ClassificationContainerMismatch,
				),
			);
		}
		writeFileSync(consumerFile, original);
		const root = path.join(directory, "node_modules", "dependency");
		const dependencyFile = path.join(root, "index.d.ts");
		writeFileSync(
			dependencyFile,
			`/**\n * External contract.\n * @public\n */\n${readFileSync(dependencyFile, "utf8")}`,
		);
		const dependency = await analyzeAPIs(
			{ ...configuration, packageName: "dependency" },
			root,
		);
		assert.equal(dependency.ok, true, JSON.stringify(dependency));
		writeFileSync(path.join(root, "api-model.json"), dependency.value.generateModel());
		const selected = await analyzeAPIs(
			{ ...configuration, suite: { packages: ["dep*"], modelFile: "api-model.json" } },
			directory,
		);
		assert.equal(selected.ok, true, JSON.stringify(selected));
		const selectedReport = selected.value.generateReport(".", {
			name: "all",
			releaseLevels: [ReleaseLevel.Public, ReleaseLevel.Beta],
		});
		assert.equal(selectedReport.ok, true, JSON.stringify(selectedReport));
		assert.match(selectedReport.value, /value: Preview/);
		assert(
			selectedReport.value.includes(
				"    // Inherited from `External` in package `dependency`\n    value: Preview;",
			),
		);
		assert.equal(selectedReport.value.match(/Inherited from/g)?.length, 1);
	});

	it("annotates original declaring containers for inherited members", async () => {
		for (const kind of ["class", "interface"] as const) {
			writeFileSync(
				path.join(directory, "index.d.ts"),
				`// Exercises transitive member inheritance independently of inherited documentation.
				/** Original declaring type. @public */
				declare ${kind} Root<Value> {
					/** Value documentation reused by a local override. */
					readonly value: Value;
					readonly inheritedValue: Value;
					/** Optional callable property. @deprecated Use convert. */
					callback?: (value: Value) => Value;
					/** Converts a value. */
					convert(value: Value): Value;
					/** Converts multiple values. */
					convert(value: readonly Value[]): readonly Value[];
				}
				/** Intermediate type without new declarations. @public */
				declare ${kind} Middle<Value> extends Root<Value> {}
				/** Public receiving type. @public */
				declare ${kind} Leaf extends Middle<string> {
					/** {@inheritDoc Root.value} */
					readonly value: string;
				}
				export { Leaf };`,
			);
			const analysis = await analyzeAPIs(
				{
					packageName: "consumer",
					project: "tsconfig.json",
					entrypoints: [{ name: ".", path: "index.d.ts" }],
				},
				directory,
			);
			assert.equal(analysis.ok, true, JSON.stringify(analysis));
			const model = analysis.value.generateModel();
			const selection = { name: "public", releaseLevels: [ReleaseLevel.Public] };
			const report = analysis.value.generateReport(".", selection);
			assert.equal(report.ok, true, JSON.stringify(report));
			assert(report.value.includes("    readonly value: string;"));
			assert(
				report.value.includes(
					"    // Inherited from `Root`\n    readonly inheritedValue: string;",
				),
			);
			assert(
				report.value.includes(
					"    // @deprecated\n    // Inherited from `Root`\n    callback?:",
				),
			);
			assert(
				report.value.includes("    // Inherited from `Root`\n    convert(value: string)"),
			);
			assert(
				report.value.includes(
					"    // Inherited from `Root`\n    convert(value: readonly string[])",
				),
			);
			assert.equal(report.value.match(/Inherited from/g)?.length, 4);
			assert.doesNotMatch(report.value, /Inherited from `Middle`|in package/);
			const withoutTags = analysis.value.generateReport(".", selection, {
				additionalTags: [],
				includeReleaseTags: false,
				includeUndocumentedNotice: false,
			});
			assert.equal(withoutTags.ok, true, JSON.stringify(withoutTags));
			assert.equal(withoutTags.value.match(/Inherited from `Root`/g)?.length, 4);
			assert.doesNotMatch(withoutTags.value, /@public|@deprecated|\(undocumented\)/);
			assert.deepEqual(analysis.value.generateReport(".", selection), report);
			assert.equal(analysis.value.generateModel(), model);
			const decoded = decodeDependencyModel(model, "consumer");
			assert.equal(decoded.ok, true, JSON.stringify(decoded));
			const leaf = decoded.value.graph.declarations.find(
				(declaration) => declaration.name === "Leaf",
			);
			assert(leaf !== undefined);
			const value = leaf.members.find((member) => member.name === "inheritedValue");
			assert.equal(value?.type, "string");
			assert(value?.declaringContainer !== undefined);
			assert.equal(
				decoded.value.graph.declarations.find(
					(declaration) => declaration.id === value.declaringContainer,
				)?.name,
				"Root",
			);
			assert.equal(
				leaf.heritage[0]?.members.find((member) => member.name === "inheritedValue")?.type,
				"string",
			);
			assert.equal(
				leaf.members.find((member) => member.name === "convert")?.signatures[0]?.normalized
					.callSignatureText,
				"(value: string): string;",
			);

			// Matching version markers are not sufficient: current graph structure and identities must also validate.
			for (const invalid of [
				{ ...decoded.value, version: 99 },
				{ ...decoded.value, exports: [] },
				{ ...decoded.value, identityVersion: 99 },
				{ ...decoded.value, compilerVersion: "unsupported" },
				{ ...decoded.value, graph: undefined },
				{ ...decoded.value, graph: { ...decoded.value.graph, declarations: [] } },
				{
					...decoded.value,
					graph: {
						...decoded.value.graph,
						declarations: [...decoded.value.graph.declarations, leaf],
					},
				},
				{
					...decoded.value,
					graph: {
						...decoded.value.graph,
						declarations: decoded.value.graph.declarations.map((declaration) =>
							declaration.id === leaf.id
								? { ...declaration, baseDeclarations: ["missing"] }
								: declaration,
						),
					},
				},
				{
					...decoded.value,
					graph: {
						...decoded.value.graph,
						declarations: decoded.value.graph.declarations.map((declaration) =>
							declaration.id === leaf.id
								? {
										...declaration,
										members: declaration.members.map((member) => ({
											...member,
											documentationId: "missing",
										})),
									}
								: declaration,
						),
					},
				},
			]) {
				const rejected = decodeDependencyModel(JSON.stringify(invalid), "consumer");
				assert.equal(rejected.ok, false);
				assert.equal(rejected.diagnostics[0]?.code, DiagnosticCode.DependencyModel);
			}

			// Remove the declaration input before rendering; decoded data must not depend on a source checkout.
			rmSync(path.join(directory, "index.d.ts"));
			const output = execFileSync(
				process.execPath,
				[
					"--input-type=module",
					"--eval",
					`
				import assert from 'node:assert/strict';
				import { readFileSync } from 'node:fs';
				import { registerHooks } from 'node:module';
				registerHooks({ resolve(specifier, context, next) {
					assert(!specifier.startsWith('typescript') && !specifier.includes('/analysis/'), specifier);
					return next(specifier, context);
				}});
				const { decodeDependencyModel } = await import(${JSON.stringify(new URL("../model.js", import.meta.url).href)});
				const result = decodeDependencyModel(readFileSync(0, 'utf8'), 'consumer');
				assert(result.ok, JSON.stringify(result));
				const binding = result.value.graph.surfaces[0].exports.find(entry => entry.name === 'Leaf');
				const declaration = result.value.graph.declarations.find(entry => entry.id === binding.target);
				const property = declaration.members.find(entry => entry.name === 'value');
				const documentation = result.value.apis.find(entry => entry.id === property.documentationId);
				assert(documentation.documentation.documentation.includes('Value documentation reused'));
				assert(Object.isFrozen(declaration.members));
				console.log('# ' + binding.name + '\\n' + declaration.members.map(member => member.name + ': ' + member.type).join('\\n'));
			`,
				],
				{ cwd: directory, input: model, encoding: "utf8" },
			);
			assert.match(output, /# Leaf/);
			assert.match(output, /inheritedValue: string/);
		}
	});

	it("keeps package documentation local and rejects stale or malformed package records", async () => {
		const root = path.join(directory, "node_modules", "dependency");
		const original = readFileSync(
			new URL("../../src/test/fixtures/suite/package-overview.d.ts", import.meta.url),
			"utf8",
		);
		const dependencyFile = path.join(root, "package-overview.d.ts");
		writeFileSync(dependencyFile, original);
		writeFileSync(
			path.join(root, "tsconfig.json"),
			JSON.stringify({
				compilerOptions: { strict: true },
				files: ["index.d.ts", "package-overview.d.ts"],
			}),
		);
		const common = {
			project: "tsconfig.json",
			entrypoints: [{ name: ".", path: "index.d.ts" }],
		};
		const dependency = await analyzeAPIs(
			{ ...common, packageName: "dependency", rules: { requirePackageDocumentation: true } },
			root,
		);
		assert.equal(dependency.ok, true, JSON.stringify(dependency));
		writeFileSync(path.join(root, "api-model.json"), dependency.value.generateModel());
		const decoded = decodeDependencyModel(dependency.value.generateModel(), "dependency");
		assert.equal(decoded.ok, true, JSON.stringify(decoded));
		const packageComment = decoded.value.packageDocumentation;
		assert(packageComment !== undefined);
		const consumerFile = path.join(directory, "index.d.ts");
		writeFileSync(
			consumerFile,
			`import "dependency/package-overview";\n${readFileSync(consumerFile, "utf8")}`,
		);
		const configuration = {
			...common,
			packageName: "consumer",
			suite: { packages: ["dependency"], modelFile: "api-model.json" },
		};
		const consumer = await analyzeAPIs(configuration, directory);
		assert.equal(consumer.ok, true, JSON.stringify(consumer));
		const consumerModel = decodeDependencyModel(consumer.value.generateModel(), "consumer");
		assert.equal(consumerModel.ok, true, JSON.stringify(consumerModel));
		assert.equal(consumerModel.value.packageDocumentation, undefined);
		const required = await analyzeAPIs(
			{ ...configuration, rules: { requirePackageDocumentation: true } },
			directory,
		);
		assert.equal(required.ok, false);
		assert.equal(required.diagnostics[0]?.code, DiagnosticCode.PackageDocumentationMissing);
		for (const corrupted of [
			{ ...packageComment, origin: { ...packageComment.origin, packageName: "other" } },
			{ ...packageComment, origin: { ...packageComment.origin, file: "not-an-input.d.ts" } },
			{ ...packageComment, documentation: "/** No package tag. */" },
			{ ...packageComment, documentation: "/** See {@link source}. @packageDocumentation */" },
		]) {
			const invalid = decodeDependencyModel(
				JSON.stringify({ ...decoded.value, packageDocumentation: corrupted }),
				"dependency",
			);
			assert.equal(invalid.ok, false);
			assert.equal(invalid.diagnostics[0]?.code, DiagnosticCode.DependencyModel);
		}
		for (const field of ["comment", "metadata"] as const) {
			const invalid = decodeDependencyModel(
				JSON.stringify({
					...decoded.value,
					apis: decoded.value.apis.map((api) =>
						api.name === "source"
							? {
									...api,
									...(field === "comment"
										? {
												documentation: {
													...api.documentation,
													documentation: api.documentation.documentation?.replace(
														"*/",
														" * @packageDocumentation\n */",
													),
												},
											}
										: {
												metadata: {
													...api.metadata,
													modifierTags: [
														...api.metadata.modifierTags,
														"@packageDocumentation",
													],
												},
											}),
								}
							: api,
					),
				}),
				"dependency",
			);
			assert.equal(invalid.ok, false, field);
			assert.equal(invalid.diagnostics[0]?.code, DiagnosticCode.DependencyModel);
		}
		writeFileSync(
			dependencyFile,
			original.replace("Package-wide overview.", "Updated package overview."),
		);
		const stale = await analyzeAPIs(configuration, directory);
		assert.equal(stale.ok, false);
		assert.equal(stale.diagnostics[0]?.code, DiagnosticCode.DependencyModel);
	});

	it("resolves package links through dependency models and validates stored targets", async () => {
		const root = path.join(directory, "node_modules", "dependency");
		const common = {
			project: "tsconfig.json",
			entrypoints: [{ name: ".", path: "index.d.ts" }],
		};
		const dependency = await analyzeAPIs({ ...common, packageName: "dependency" }, root);
		assert.equal(dependency.ok, true, JSON.stringify(dependency));
		writeFileSync(path.join(root, "api-model.json"), dependency.value.generateModel());
		const file = path.join(directory, "index.d.ts");
		const text =
			"/**\n * See {@link dependency#source} and {@link alias}.\n * @packageDocumentation\n */\nimport { target as alias } from 'dependency';\nexport {};";
		writeFileSync(file, text);
		const configuration = {
			...common,
			packageName: "consumer",
			suite: { packages: ["dependency"], modelFile: "api-model.json" },
		};
		const result = await analyzeAPIs(configuration, directory);
		assert.equal(result.ok, true, JSON.stringify(result));
		const model = decodeDependencyModel(result.value.generateModel(), "consumer");
		assert.equal(model.ok, true, JSON.stringify(model));
		const documentation = model.value.packageDocumentation;
		assert(documentation !== undefined);
		assert.equal(documentation.links.length, 2);
		assert(
			documentation.links.every((link) =>
				model.value.external.some((external) => external.id === link.targetSignature),
			),
		);
		for (const links of [
			[],
			documentation.links.map((link) => ({ ...link, targetSignature: "missing" })),
			documentation.links.map((link) => ({ ...link, linkIndex: 9 })),
		]) {
			const invalid = decodeDependencyModel(
				JSON.stringify({ ...model.value, packageDocumentation: { ...documentation, links } }),
				"consumer",
			);
			assert.equal(invalid.ok, false);
		}
		writeFileSync(file, text.replace("dependency#source", "dependency#internalSource"));
		const internal = await analyzeAPIs(configuration, directory);
		assert.equal(internal.ok, false);
		assert.equal(internal.diagnostics[0]?.code, DiagnosticCode.DocumentationLinkPolicy);

		const intermediate = path.join(directory, "node_modules", "consumer");
		mkdirSync(intermediate);
		writeFileSync(
			path.join(intermediate, "package.json"),
			JSON.stringify({
				name: "consumer",
				types: "index.d.ts",
				dependencies: { dependency: "1.0.0" },
			}),
		);
		writeFileSync(path.join(intermediate, "index.d.ts"), text);
		const modelFile = path.join(intermediate, "api-model.json");
		writeFileSync(modelFile, result.value.generateModel());
		writeFileSync(
			path.join(directory, "package.json"),
			JSON.stringify({
				name: "downstream",
				dependencies: { consumer: "1.0.0", dependency: "1.0.0" },
			}),
		);
		writeFileSync(file, "export {};");
		const downstream = {
			...common,
			packageName: "downstream",
			suite: { packages: ["consumer", "dependency"], modelFile: "api-model.json" },
		};
		const accepted = await analyzeAPIs(downstream, directory);
		assert.equal(accepted.ok, true, JSON.stringify(accepted));
		writeFileSync(
			modelFile,
			JSON.stringify({
				...model.value,
				packageDocumentation: {
					...documentation,
					links: documentation.links.map((link) => ({ ...link, target: "wrong-declaration" })),
				},
			}),
		);
		const inconsistent = await analyzeAPIs(downstream, directory);
		assert.equal(inconsistent.ok, false);
		assert.equal(inconsistent.diagnostics[0]?.code, DiagnosticCode.DependencyModel);
	});

	it("preserves compound declaration targets and callable selectors in models", async () => {
		const root = path.join(directory, "node_modules", "dependency");
		cpSync(
			new URL("../../src/test/fixtures/native/compound-merges.ts", import.meta.url),
			path.join(root, "index.d.ts"),
		);
		const common = {
			project: "tsconfig.json",
			entrypoints: [{ name: ".", path: "index.d.ts" }],
		};
		const dependency = await analyzeAPIs({ ...common, packageName: "dependency" }, root);
		assert.equal(dependency.ok, true, JSON.stringify(dependency));
		writeFileSync(path.join(root, "api-model.json"), dependency.value.generateModel());
		cpSync(
			new URL("../../src/test/fixtures/suite/compound-consumer.d.ts", import.meta.url),
			path.join(directory, "index.d.ts"),
		);
		const result = await analyzeAPIs(
			{
				...common,
				packageName: "consumer",
				suite: { packages: ["dependency"], modelFile: "api-model.json" },
			},
			directory,
		);
		assert.equal(result.ok, true, JSON.stringify(result));
		const model = decodeDependencyModel(result.value.generateModel(), "consumer");
		assert.equal(model.ok, true, JSON.stringify(model));
		assert.match(
			model.value.apis.find((item) => item.name === "copy")?.documentation.documentation ?? "",
			/Callable factory/,
		);
		const links = model.value.apis.find((item) => item.name === "links")?.documentation.links;
		assert.equal(links?.length, 3);
		assert.notEqual(links?.[0]?.targetSignature, links?.[1]?.targetSignature);
	});

	it("inherits namespace export documentation without replacing merged ambient documentation", async () => {
		const root = path.join(directory, "node_modules", "dependency");
		cpSync(
			new URL("../../src/test/fixtures/native/ambient-entry.ts", import.meta.url),
			path.join(root, "index.d.ts"),
		);
		cpSync(
			new URL("../../src/test/fixtures/native/ambient-modules.d.ts", import.meta.url),
			path.join(root, "ambient-modules.d.ts"),
		);
		const common = {
			project: "tsconfig.json",
			entrypoints: [{ name: ".", path: "index.d.ts" }],
		};
		const dependency = await analyzeAPIs({ ...common, packageName: "dependency" }, root);
		assert.equal(dependency.ok, true, JSON.stringify(dependency));
		writeFileSync(path.join(root, "api-model.json"), dependency.value.generateModel());
		writeFileSync(
			path.join(directory, "index.d.ts"),
			`
			/**
			 * {@inheritDoc dependency#Tools}
			 * @public
			 */
			export declare namespace Copied { const version: "v1"; }
		`,
		);
		const result = await analyzeAPIs(
			{
				...common,
				packageName: "consumer",
				suite: { packages: ["dependency"], modelFile: "api-model.json" },
			},
			directory,
		);
		assert.equal(result.ok, true, JSON.stringify(result));
		const model = decodeDependencyModel(result.value.generateModel(), "consumer");
		assert.equal(model.ok, true, JSON.stringify(model));
		const copied = model.value.apis.find((item) => item.name === "Copied");
		assert.match(copied?.documentation.documentation ?? "", /Tools namespace documentation/);
		assert.equal(copied?.documentation.links.length, 2);
		assert(
			copied.documentation.links.every((link) => link.origin.packageName === "dependency"),
		);
		const file = path.join(root, "ambient-modules.d.ts");
		writeFileSync(
			file,
			readFileSync(file, "utf8").replace(
				"Second ambient contribution. See {@link update}.\n * @public",
				"Second ambient contribution. See {@link update}.\n * @beta",
			),
		);
		const conflict = await analyzeAPIs({ ...common, packageName: "dependency" }, root);
		assert.equal(conflict.ok, false);
		assert.equal(conflict.diagnostics[0]?.code, DiagnosticCode.ClassificationReleaseConflict);
	});

	it("inherits same-kind declarations from selected dependency models", async () => {
		const root = path.join(directory, "node_modules", "dependency");
		const original = readFileSync(
			new URL("../../src/test/fixtures/native/declaration-inheritance.ts", import.meta.url),
			"utf8",
		);
		writeFileSync(path.join(root, "index.d.ts"), original);
		const common = {
			project: "tsconfig.json",
			entrypoints: [{ name: ".", path: "index.d.ts" }],
		};
		const dependency = await analyzeAPIs({ ...common, packageName: "dependency" }, root);
		assert.equal(dependency.ok, true, JSON.stringify(dependency));
		writeFileSync(path.join(root, "api-model.json"), dependency.value.generateModel());
		writeFileSync(
			path.join(directory, "index.d.ts"),
			original.replaceAll("{@inheritDoc ", "{@inheritDoc dependency#"),
		);
		const result = await analyzeAPIs(
			{
				...common,
				packageName: "consumer",
				suite: { packages: ["dependency"], modelFile: "api-model.json" },
			},
			directory,
		);
		assert.equal(result.ok, true, JSON.stringify(result));
		const model = decodeDependencyModel(result.value.generateModel(), "consumer");
		assert.equal(model.ok, true, JSON.stringify(model));
		for (const name of [
			"ReceiverClass",
			"ReceiverAlias",
			"receiverConstant",
			"ReceiverEnum",
			"ReceiverNamespace",
		]) {
			const documentation: DependencyApi["documentation"] | undefined = model.value.apis.find(
				(item) => item.name === name,
			)?.documentation;
			assert(documentation !== undefined);
			assert.equal(
				documentation.sections?.find((section) => section.section === "summary")?.packageName,
				"dependency",
			);
		}
	});

	it("rejects missing and incompatible selected models even when unused", async () => {
		const configuration = {
			packageName: "consumer",
			project: "tsconfig.json",
			entrypoints: [{ name: ".", path: "index.d.ts" }],
			suite: { packages: ["dependency"], modelFile: "api-model.json" },
		};
		const missing = await analyzeAPIs(configuration, directory);
		assert.equal(missing.ok, false);
		assert.equal(missing.diagnostics[0]?.code, DiagnosticCode.DependencyModel);
		const dependencyRoot = path.join(directory, "node_modules", "dependency");
		const dependency = await analyzeAPIs(
			{
				packageName: "dependency",
				project: "tsconfig.json",
				entrypoints: [{ name: ".", path: "index.d.ts" }],
			},
			dependencyRoot,
		);
		assert.equal(dependency.ok, true, JSON.stringify(dependency));
		const file = path.join(dependencyRoot, "api-model.json");
		const model = dependency.value.generateModel();
		writeFileSync(file, model);
		const accepted = await analyzeAPIs(configuration, directory);
		assert.equal(accepted.ok, true, JSON.stringify(accepted));
		assert.equal(readFileSync(file, "utf8"), model);

		// Even unused models must correspond to the declarations installed beside them.
		const declarationFile = path.join(dependencyRoot, "index.d.ts");
		const declarationText = readFileSync(declarationFile, "utf8");
		writeFileSync(
			declarationFile,
			declarationText.replace(
				"source(value: string): string",
				"source(value: string): number",
			),
		);
		const stale = await analyzeAPIs(configuration, directory);
		assert.equal(stale.ok, false);
		assert.equal(stale.diagnostics[0]?.code, DiagnosticCode.DependencyModel);
		writeFileSync(declarationFile, declarationText);
		const decoded = decodeDependencyModel(model, "dependency");
		assert.equal(decoded.ok, true);
		const linked = decoded.value.apis.find((item) => item.name === "source");
		assert(linked !== undefined);

		// Corrupted resolved data must fail decoding before it can reach resolver invariants.
		for (const documentation of [
			{ ...linked.documentation, links: [] },
			{ ...linked.documentation, documentation: "/** {@inheritDoc target} @public */" },
		]) {
			writeFileSync(
				file,
				JSON.stringify({
					...decoded.value,
					apis: decoded.value.apis.map((item) =>
						item.id === linked.id ? { ...item, documentation } : item,
					),
				}),
			);
			const malformed = await analyzeAPIs(configuration, directory);
			assert.equal(malformed.ok, false);
			assert.equal(malformed.diagnostics[0]?.code, DiagnosticCode.DependencyModel);
		}
		writeFileSync(file, JSON.stringify({ ...JSON.parse(model), version: 99 }));
		const incompatible = await analyzeAPIs(configuration, directory);
		assert.equal(incompatible.ok, false);
		assert.equal(incompatible.diagnostics[0]?.code, DiagnosticCode.DependencyModel);
	});

	it("rejects stale inherited content after a transitive model is regenerated", async () => {
		const leafRoot = path.join(directory, "node_modules", "dependency");
		const intermediateRoot = path.join(directory, "node_modules", "intermediate");
		mkdirSync(intermediateRoot, { recursive: true });
		writeFileSync(
			path.join(intermediateRoot, "package.json"),
			JSON.stringify({
				name: "intermediate",
				types: "index.d.ts",
				dependencies: { dependency: "1.0.0" },
			}),
		);
		writeFileSync(
			path.join(intermediateRoot, "tsconfig.json"),
			JSON.stringify({ compilerOptions: { strict: true }, files: ["index.d.ts"] }),
		);
		cpSync(
			new URL("../../src/test/fixtures/suite/consumer.d.ts", import.meta.url),
			path.join(intermediateRoot, "index.d.ts"),
		);

		// The consumer names only the intermediate package, so discovery must follow its dependency to the leaf.
		writeFileSync(
			path.join(directory, "package.json"),
			JSON.stringify({ name: "consumer", dependencies: { intermediate: "1.0.0" } }),
		);
		const base = {
			project: "tsconfig.json",
			entrypoints: [{ name: ".", path: "index.d.ts" }],
			rules: { requireReleaseLevel: false },
		};

		// Generate resolved intermediate content from the original leaf model.
		const leaf = await analyzeAPIs({ ...base, packageName: "dependency" }, leafRoot);
		assert.equal(leaf.ok, true, JSON.stringify(leaf));
		writeFileSync(path.join(leafRoot, "api-model.json"), leaf.value.generateModel());
		const intermediateConfiguration = {
			...base,
			packageName: "intermediate",
			suite: { packages: ["dependency"], modelFile: "api-model.json" },
		};
		const intermediate = await analyzeAPIs(intermediateConfiguration, intermediateRoot);
		assert.equal(intermediate.ok, true, JSON.stringify(intermediate));
		writeFileSync(
			path.join(intermediateRoot, "api-model.json"),
			intermediate.value.generateModel(),
		);
		const consumerConfiguration = {
			...base,
			packageName: "consumer",
			suite: { packages: ["intermediate", "dependency"], modelFile: "api-model.json" },
		};
		const original = await analyzeAPIs(consumerConfiguration, directory);
		assert.equal(original.ok, true, JSON.stringify(original));
		const inputs = [
			{ packageName: "dependency", text: leaf.value.generateModel() },
			{ packageName: "intermediate", text: intermediate.value.generateModel() },
		];
		const models = decodeDependencyModels(inputs);
		assert.equal(models.ok, true, JSON.stringify(models));
		assert.deepEqual(decodeDependencyModels([...inputs].reverse()), models);
		assert.equal(decodeDependencyModels([...inputs, ...inputs]).ok, false);
		assert.equal(decodeDependencyModels(inputs.slice(1)).ok, false);

		// JSON layout and object-key order are not model changes; overload array order still is.
		const reformattedLeaf = JSON.stringify(
			JSON.parse(leaf.value.generateModel()),
			(_key: string, value: unknown): unknown => {
				if (value !== null && typeof value === "object" && !Array.isArray(value)) {
					return Object.fromEntries(Object.entries(value).reverse());
				}
				return value;
			},
			4,
		);
		writeFileSync(path.join(leafRoot, "api-model.json"), reformattedLeaf);
		const reformatted = await analyzeAPIs(consumerConfiguration, directory);
		assert.equal(reformatted.ok, true, JSON.stringify(reformatted));

		// Rebuilding only the leaf must not validate stale content copied into the intermediate artifact.
		const leafFile = path.join(leafRoot, "index.d.ts");
		writeFileSync(
			leafFile,
			readFileSync(leafFile, "utf8").replace(
				"Source documentation.",
				"Updated source documentation.",
			),
		);
		const rebuiltLeaf = await analyzeAPIs({ ...base, packageName: "dependency" }, leafRoot);
		assert.equal(rebuiltLeaf.ok, true);
		assert.equal(
			decodeDependencyModels([
				{ packageName: "dependency", text: rebuiltLeaf.value.generateModel() },
				{ packageName: "intermediate", text: intermediate.value.generateModel() },
			]).ok,
			false,
		);
		writeFileSync(path.join(leafRoot, "api-model.json"), rebuiltLeaf.value.generateModel());
		const stale = await analyzeAPIs(consumerConfiguration, directory);
		assert.equal(stale.ok, false);
		assert.equal(stale.diagnostics[0]?.code, DiagnosticCode.DependencyModel);
		assert.match(stale.diagnostics[0]?.message ?? "", /intermediate/);
		assert.match(stale.diagnostics[0]?.message ?? "", /dependency/);

		// The intermediate source did not change, but its copied documentation and model-input hash must be refreshed.
		const rebuiltIntermediate = await analyzeAPIs(intermediateConfiguration, intermediateRoot);
		assert.equal(rebuiltIntermediate.ok, true);
		writeFileSync(
			path.join(intermediateRoot, "api-model.json"),
			rebuiltIntermediate.value.generateModel(),
		);
		const fresh = await analyzeAPIs(consumerConfiguration, directory);
		assert.equal(fresh.ok, true, JSON.stringify(fresh));
	});

	it("consumes checked-in model snapshots without declarations or compiler imports", () => {
		const inputs = ["dependency", "consumer"].map((packageName) => ({
			packageName,
			text: readFileSync(
				new URL(`../../src/test/snapshots/${packageName}.api.json`, import.meta.url),
				"utf8",
			),
		}));

		// The child receives artifact text only and rejects compiler imports before loading the model reader.
		const output = execFileSync(
			process.execPath,
			[
				"--input-type=module",
				"--eval",
				`
			import assert from 'node:assert/strict';
			import { readFileSync } from 'node:fs';
			import { registerHooks } from 'node:module';
			registerHooks({ resolve(specifier, context, next) {
				assert(!specifier.startsWith('typescript') && !specifier.includes('/analysis/'), specifier);
				return next(specifier, context);
			}});
			const { decodeDependencyModels } = await import(${JSON.stringify(new URL("../model.js", import.meta.url).href)});
			const inputs = JSON.parse(readFileSync(0, 'utf8'));
			const result = decodeDependencyModels(inputs);
			assert(result.ok, JSON.stringify(result));
			assert.deepEqual(decodeDependencyModels([...inputs].reverse()), result);
			const consumer = result.value.find(model => model.packageName === 'consumer');
			const dependency = result.value.find(model => model.packageName === 'dependency');
			const alias = consumer.exports.find(entry => entry.path.join('.') === 'dependencyAlias');
			const target = dependency.apis.find(api => api.id === alias.items[0]);
			assert.equal(target.name, 'source');
			const inherited = consumer.apis.find(api => api.name === 'consumer');
			assert(inherited.documentation.documentation.includes('Source documentation.'));
			const link = inherited.documentation.links[0];
			assert.equal(link.origin.packageName, 'dependency');
			assert.equal(dependency.apis.find(api => api.id === link.targetSignature).name, 'target');
			assert.notEqual(consumer.apis.find(api => api.name === 'target').id, link.targetSignature);
			const implementation = consumer.graph.declarations.find(item => item.name === 'Implementation');
			const operation = implementation.members.find(item => item.name === 'operation').signatures[0];
			assert.equal(operation.effective.callSignatureText, '(value: string): string;');
			assert(consumer.apis.find(api => api.id === operation.documentationId).documentation.documentation.includes('Original operation.'));
			console.log('Resolved alias, inherited content, substituted member, and original-package link.');
		`,
			],
			{ cwd: tmpdir(), input: JSON.stringify(inputs), encoding: "utf8" },
		);
		assert.match(output, /Resolved alias/);
	});

	it("rejects nested export paths that disagree with the portable member graph", () => {
		const text = readFileSync(
			new URL("../../src/test/snapshots/dependency.api.json", import.meta.url),
			"utf8",
		);
		const decoded = decodeDependencyModel(text, "dependency");
		assert.equal(decoded.ok, true, JSON.stringify(decoded));
		const member = decoded.value.exports.find(
			(entry) => entry.path.join(".") === "Contract.operation",
		);
		assert(member !== undefined);

		// Each change leaves valid target IDs but makes the exported path disagree with its graph member.
		for (const exports of [
			decoded.value.exports.filter((entry) => entry !== member),
			decoded.value.exports.map((entry) =>
				entry === member ? { ...entry, path: ["Contract", "missing"] } : entry,
			),
			decoded.value.exports.map((entry) =>
				entry === member ? { ...entry, memberKind: "static" as const } : entry,
			),
		]) {
			const rejected = decodeDependencyModel(
				JSON.stringify({ ...decoded.value, exports }),
				"dependency",
			);
			assert.equal(rejected.ok, false, JSON.stringify(exports));
			assert.equal(rejected.diagnostics[0]?.code, DiagnosticCode.DependencyModel);
		}
	});

	it("resolves explicit and automatic dependency documentation with original link origins", async () => {
		const root = path.join(directory, "node_modules", "dependency");
		const dependency = await analyzeAPIs(
			{
				packageName: "dependency",
				project: "tsconfig.json",
				entrypoints: [{ name: ".", path: "index.d.ts" }],
			},
			root,
		);
		assert.equal(dependency.ok, true, JSON.stringify(dependency));
		writeFileSync(path.join(root, "api-model.json"), dependency.value.generateModel());
		cpSync(
			new URL("../../src/test/fixtures/suite/consumer.d.ts", import.meta.url),
			path.join(directory, "index.d.ts"),
		);
		const result = await analyzeAPIs(
			{
				packageName: "consumer",
				project: "tsconfig.json",
				entrypoints: [{ name: ".", path: "index.d.ts" }],
				rules: { requireReleaseLevel: false },
				suite: { packages: ["dep*"], modelFile: "api-model.json" },
			},
			directory,
		);
		assert.equal(result.ok, true, JSON.stringify(result));
		const report = result.value.generateReport(".", {
			name: "all",
			releaseLevels: [ReleaseLevel.Public, ReleaseLevel.Internal],
			includeUntagged: true,
		});
		assert.equal(report.ok, true);
		assert.match(report.value, /\/\/ @public\nexport function consumer/);
		assert.match(report.value, /\n {4}operation\(value: string\): string;/);
		const model = decodeDependencyModel(result.value.generateModel(), "consumer");
		assert.equal(model.ok, true, JSON.stringify(model));
		const consumer = model.value.apis.find((api) => api.name === "consumer");
		assert(consumer !== undefined);
		assert.equal(consumer.documentation.documented, true);
		assert.equal(consumer.documentation.links[0]?.origin.packageName, "dependency");
		assert.equal(
			consumer.documentation.sections?.find((section) => section.section === "summary")
				?.packageName,
			"dependency",
		);
		assertSnapshot(dependency.value.generateModel(), "dependency.api.json");
		assertSnapshot(result.value.generateModel(), "consumer.api.json");
	});

	it("resolves merged namespace exports and recursive aliases from dependency models", async () => {
		const root = path.join(directory, "node_modules", "dependency");
		cpSync(
			new URL("../../src/test/fixtures/native/merged-namespace.ts", import.meta.url),
			path.join(root, "index.d.ts"),
		);
		const common = {
			project: "tsconfig.json",
			entrypoints: [{ name: ".", path: "index.d.ts" }],
			customModifierTags: ["@selected", "@omit"],
		};
		const dependency = await analyzeAPIs({ ...common, packageName: "dependency" }, root);
		assert.equal(dependency.ok, true, JSON.stringify(dependency));
		writeFileSync(path.join(root, "api-model.json"), dependency.value.generateModel());
		const consumerFile = path.join(directory, "index.d.ts");
		const original = readFileSync(
			new URL("../../src/test/fixtures/suite/merged-namespace-consumer.d.ts", import.meta.url),
			"utf8",
		);
		writeFileSync(consumerFile, original);
		const configuration = {
			...common,
			packageName: "consumer",
			suite: { packages: ["dependency"], modelFile: "api-model.json" },
		};
		const result = await analyzeAPIs(configuration, directory);
		assert.equal(result.ok, true, JSON.stringify(result));
		const model = decodeDependencyModel(result.value.generateModel(), "consumer");
		assert.equal(model.ok, true, JSON.stringify(model));
		assert.equal(
			model.value.apis.find((item) => item.name === "links")?.documentation.links.length,
			2,
		);
		const second = model.value.apis.find((item) => item.name === "fromSecond");
		assert(second !== undefined);
		assert.match(second.documentation.documentation ?? "", /Second operation/);
		assert.equal(second.metadata.modifierTags.includes("@omit"), false);
		assert.equal(
			second.documentation.sections?.find((section) => section.section === "summary")
				?.packageName,
			"dependency",
		);
		assert.match(
			model.value.apis.find((item) => item.name === "fromNested")?.documentation
				.documentation ?? "",
			/Right operation/,
		);
		const models = decodeDependencyModels([
			{ packageName: "consumer", text: result.value.generateModel() },
			{ packageName: "dependency", text: dependency.value.generateModel() },
		]);
		assert.equal(models.ok, true, JSON.stringify(models));
		const producer = models.value.find((item) => item.packageName === "dependency");
		assert(producer !== undefined);
		const nested = producer.exports.find(
			(entry) => entry.path.join(".") === "Services.Nested.right",
		);
		assert(nested !== undefined);
		assert.equal(
			model.value.apis
				.find((item) => item.name === "fromNested")
				?.documentation.inheritedFrom.includes(nested.items[0] ?? ""),
			true,
		);
		const recursive = producer.exports.find(
			(entry) => entry.path.join(".") === "Services.self",
		);
		assert.deepEqual(recursive?.referencePath, ["Services"]);
		writeFileSync(
			consumerFile,
			original.replace("Services.self.Nested.right", "Services.self.Nested.missing"),
		);
		const missing = await analyzeAPIs(configuration, directory);
		assert.equal(missing.ok, false);
		assert.equal(missing.diagnostics[0]?.code, DiagnosticCode.DocumentationReference);
	});

	it("resolves self-qualified re-exports and dependency subpaths through selected models", async () => {
		const root = path.join(directory, "node_modules", "dependency");
		const dependency = await analyzeAPIs(
			{
				packageName: "dependency",
				project: "tsconfig.json",
				entrypoints: [
					{ name: ".", path: "index.d.ts" },
					{ name: "./compat", path: "index.d.ts" },
				],
			},
			root,
		);
		assert.equal(dependency.ok, true, JSON.stringify(dependency));
		writeFileSync(path.join(root, "api-model.json"), dependency.value.generateModel());
		const file = path.join(directory, "index.d.ts");
		const original = readFileSync(
			new URL("../../src/test/fixtures/suite/self-references-consumer.d.ts", import.meta.url),
			"utf8",
		);
		writeFileSync(file, original);
		const configuration = {
			packageName: "consumer",
			project: "tsconfig.json",
			entrypoints: [{ name: ".", path: "index.d.ts" }],
			suite: { packages: ["dependency"], modelFile: "api-model.json" },
		};
		const result = await analyzeAPIs(configuration, directory);
		assert.equal(result.ok, true, JSON.stringify(result));
		const model = decodeDependencyModel(result.value.generateModel(), "consumer");
		assert.equal(model.ok, true, JSON.stringify(model));
		const links = model.value.apis.find((item) => item.name === "links")?.documentation.links;
		assert(links !== undefined);
		assert.equal(links.length, 2);
		assert.equal(links[0]?.targetSignature, links[1]?.targetSignature);
		const inherited = model.value.apis.find((item) => item.name === "fromSelf")?.documentation;
		assert(inherited !== undefined);
		assert.match(inherited.documentation ?? "", /Source documentation/);
		assert.equal(inherited.links[0]?.origin.packageName, "dependency");
		assert.equal(
			inherited.sections?.find((section) => section.section === "summary")?.packageName,
			"dependency",
		);
		const withoutSuite = await analyzeAPIs(
			{
				packageName: configuration.packageName,
				project: configuration.project,
				entrypoints: configuration.entrypoints,
			},
			directory,
		);
		assert.equal(withoutSuite.ok, false);
		assert.equal(withoutSuite.diagnostics[0]?.code, DiagnosticCode.DocumentationUnsupported);
		writeFileSync(
			file,
			original.replace("source as ExportedSource", "internalSource as ExportedSource"),
		);
		const internal = await analyzeAPIs(configuration, directory);
		assert.equal(internal.ok, false);
		assert.equal(internal.diagnostics[0]?.code, DiagnosticCode.DocumentationLinkPolicy);
		writeFileSync(
			file,
			original.replace("dependency/compat#source", "dependency/missing#source"),
		);
		const missing = await analyzeAPIs(configuration, directory);
		assert.equal(missing.ok, false);
		assert.equal(missing.diagnostics[0]?.code, DiagnosticCode.DocumentationReference);
	});

	it("inherits merged interfaces and properties through qualified and imported model targets", async () => {
		const root = path.join(directory, "node_modules", "dependency");
		cpSync(
			new URL("../../src/test/fixtures/native/merged-inheritance.ts", import.meta.url),
			path.join(root, "index.d.ts"),
		);
		const dependency = await analyzeAPIs(
			{
				packageName: "dependency",
				project: "tsconfig.json",
				entrypoints: [{ name: ".", path: "index.d.ts" }],
				customModifierTags: ["@legacy"],
			},
			root,
		);
		assert.equal(dependency.ok, true, JSON.stringify(dependency));
		const dependencyText = dependency.value.generateModel();
		writeFileSync(path.join(root, "api-model.json"), dependencyText);
		const dependencyModel = decodeDependencyModel(dependencyText, "dependency");
		assert.equal(dependencyModel.ok, true, JSON.stringify(dependencyModel));
		assert.deepEqual(
			dependencyModel.value.apis.find((item) => item.name === "ReceivingSettings")
				?.typeParameters,
			["Value"],
		);
		const consumerFile = path.join(directory, "index.d.ts");
		const original = readFileSync(
			new URL(
				"../../src/test/fixtures/suite/merged-inheritance-consumer.d.ts",
				import.meta.url,
			),
			"utf8",
		);
		writeFileSync(consumerFile, original);
		const configuration = {
			packageName: "consumer",
			project: "tsconfig.json",
			entrypoints: [{ name: ".", path: "index.d.ts" }],
			suite: { packages: ["dependency"], modelFile: "api-model.json" },
			customModifierTags: ["@legacy"],
		};
		const result = await analyzeAPIs(configuration, directory);
		assert.equal(result.ok, true, JSON.stringify(result));
		const model = decodeDependencyModel(result.value.generateModel(), "consumer");
		assert.equal(model.ok, true, JSON.stringify(model));
		for (const name of ["ConsumerSettings", "ImportedReceiver"]) {
			const receiver: DependencyApi | undefined = model.value.apis.find(
				(item) => item.name === name,
			);
			assert(receiver !== undefined);
			assert.match(receiver.documentation.documentation ?? "", /First source description/);
			assert.match(receiver.documentation.documentation ?? "", /Second source description/);
			assert.match(receiver.documentation.documentation ?? "", /@typeParam Value/);
			assert.equal(receiver.metadata.modifierTags.includes("@legacy"), false);
			assert.equal(receiver.documentation.links[0]?.origin.packageName, "dependency");
			assert.equal(
				receiver.documentation.sections?.find((section) => section.section === "summary")
					?.packageName,
				"dependency",
			);
		}
		for (const name of ["MultiSource", "FromMerged"]) {
			const receiver: DependencyApi | undefined = model.value.apis.find(
				(item) => item.name === name,
			);
			assert(receiver !== undefined);
			assert.match(
				receiver.documentation.documentation ?? "",
				/Additional source description/,
			);
			assert.match(receiver.documentation.documentation ?? "", /First source description/);
			assert.equal(receiver.documentation.links.length, 2);
			assert(
				receiver.documentation.links.every((link) => link.origin.packageName === "dependency"),
			);
			assert.equal(
				receiver.documentation.sections?.filter((section) => section.section === "summary")
					.length,
				name === "MultiSource" ? 2 : 3,
			);
		}
		assert.doesNotMatch(result.value.generateModel(), /documentation-contribution:/);
		assert.match(
			model.value.apis.find((item) => item.name === "value")?.documentation.documentation ??
				"",
			/Second property description/,
		);
		for (const [before, after, code] of [
			["<Value>", "<Renamed>", DiagnosticCode.DocumentationReference],
			[
				"dependency#ReceivingSettings}",
				"dependency#(ReceivingSettings:1)}",
				DiagnosticCode.DocumentationReference,
			],
			[
				"dependency#ReceivingSettings.value",
				"dependency#destination",
				DiagnosticCode.DocumentationUnsupported,
			],
			[
				"dependency#ReceivingSettings}",
				"dependency#ReceivingSettings.value}",
				DiagnosticCode.DocumentationUnsupported,
			],
		] as const) {
			const changed = original.replaceAll(before, after);
			assert.notEqual(changed, original);
			writeFileSync(consumerFile, changed);
			const rejected = await analyzeAPIs(configuration, directory);
			assert.equal(rejected.ok, false, JSON.stringify(rejected));
			assert.equal(rejected.diagnostics[0]?.code, code, JSON.stringify(rejected));
		}
		const malformed = decodeDependencyModel(
			JSON.stringify({
				...dependencyModel.value,
				apis: dependencyModel.value.apis.map((item) =>
					item.kind === "InterfaceDeclaration" ? { ...item, typeParameters: undefined } : item,
				),
			}),
			"dependency",
		);
		assert.equal(malformed.ok, false);
		assert.equal(malformed.diagnostics[0]?.code, DiagnosticCode.DependencyModel);
	});

	it("resolves selectors and recursive namespace paths through dependency models", async () => {
		const root = path.join(directory, "node_modules", "dependency");
		cpSync(
			new URL("../../src/test/fixtures/native/reference-selectors.ts", import.meta.url),
			path.join(root, "index.d.ts"),
		);
		const base = {
			project: "tsconfig.json",
			entrypoints: [{ name: ".", path: "index.d.ts" }],
		};
		const dependency = await analyzeAPIs({ ...base, packageName: "dependency" }, root);
		assert.equal(dependency.ok, true, JSON.stringify(dependency));
		writeFileSync(path.join(root, "api-model.json"), dependency.value.generateModel());
		cpSync(
			new URL("../../src/test/fixtures/suite/selectors-consumer.d.ts", import.meta.url),
			path.join(directory, "index.d.ts"),
		);
		const result = await analyzeAPIs(
			{
				...base,
				packageName: "consumer",
				suite: { packages: ["dependency"], modelFile: "api-model.json" },
			},
			directory,
		);
		assert.equal(result.ok, true, JSON.stringify(result));
		const model = decodeDependencyModel(result.value.generateModel(), "consumer");
		assert.equal(model.ok, true, JSON.stringify(model));
		const links = model.value.apis.find((api) => api.name === "links")?.documentation.links;
		assert(links !== undefined);
		assert.equal(links.length, 5);
		assert.equal(links[4]?.targetSignature, links[2]?.targetSignature);
		assert.notEqual(links[0]?.targetSignature, links[1]?.targetSignature);
		assert.match(
			model.value.apis.find((api) => api.name === "fromStatic")?.documentation.documentation ??
				"",
			/Static operation documentation/,
		);
		assert.match(
			model.value.apis.find((api) => api.name === "fromAlias")?.documentation.documentation ??
				"",
			/Operation retained through recursive aliases/,
		);
		assert.equal(
			model.value.apis.find((api) => api.name === "kindLinks")?.documentation.links.length,
			7,
		);
		assert.equal(
			model.value.apis.find((api) => api.name === "fullSyntaxLinks")?.documentation.links
				.length,
			8,
		);
		assert.match(
			model.value.apis.find((api) => api.name === "fromLabel")?.documentation.documentation ??
				"",
			/Text overload/,
		);
		assert.deepEqual(model.value.apis.find((api) => api.name === "fromLabel")?.labels, []);
		assert.match(
			model.value.apis.find((api) => api.name === "CopiedContract")?.documentation
				.documentation ?? "",
			/Selector contract/,
		);

		// Successfully resolving a model target must not bypass ambiguity, range, or visibility checks.
		const consumerFile = path.join(directory, "index.d.ts");
		const original = readFileSync(consumerFile, "utf8");
		for (const [from, to, expected] of [
			["(Selected:SELECTED)", "(Selected:MISSING)", DiagnosticCode.DocumentationReference],
			[
				"Selected.(read:TEXT)",
				"Selected.(read:MISSING)",
				DiagnosticCode.DocumentationReference,
			],
			["[dependency#token]", "[dependency#version]", DiagnosticCode.DocumentationReference],
			[
				"(Selected:constructor)",
				"(ReferenceSource:constructor)",
				DiagnosticCode.DocumentationReference,
			],
			[
				"dependency#(ReferenceSource:class)",
				"dependency#(ReferenceSource:interface)",
				DiagnosticCode.DocumentationReference,
			],
			[
				"dependency#(Group:namespace)",
				"dependency#(Group:class)",
				DiagnosticCode.DocumentationReference,
			],
			[
				"dependency#(fromStatic:function)",
				"dependency#(fromStatic:type)",
				DiagnosticCode.DocumentationReference,
			],
			[
				"dependency#(overloaded:1)",
				"dependency#(overloaded:2)",
				DiagnosticCode.DocumentationLinkPolicy,
			],
			[
				"dependency#(overloaded:1)",
				"dependency#(overloaded:3)",
				DiagnosticCode.DocumentationReference,
			],
			[
				"dependency#ReferenceSource.(operation:static)",
				"dependency#ReferenceSource.operation",
				DiagnosticCode.DocumentationReference,
			],
			[
				"dependency#Group.self.self.run",
				"dependency#Group.self.self.missing",
				DiagnosticCode.DocumentationReference,
			],
		] as const) {
			writeFileSync(consumerFile, original.replace(from, to));
			const rejected = await analyzeAPIs(
				{
					...base,
					packageName: "consumer",
					suite: { packages: ["dependency"], modelFile: "api-model.json" },
				},
				directory,
			);
			assert.equal(rejected.ok, false, to);
			assert.equal(rejected.diagnostics[0]?.code, expected, JSON.stringify(rejected));
		}
		const produced = decodeDependencyModel(dependency.value.generateModel(), "dependency");
		assert.equal(produced.ok, true);
		assert.equal(
			decodeDependencyModel(
				JSON.stringify({
					...produced.value,
					apis: produced.value.apis.map((api) => ({ ...api, declarationKinds: [] })),
				}),
				"dependency",
			).ok,
			false,
		);
		assert.equal(
			decodeDependencyModel(
				JSON.stringify({
					...produced.value,
					apis: produced.value.apis.map((api) => ({
						...api,
						declarationKinds: ["WrongKind"],
					})),
				}),
				"dependency",
			).ok,
			false,
		);
		const alias = produced.value.exports.find((entry) => entry.referencePath !== undefined);
		assert(alias !== undefined);

		// Corrupt aliases must fail before lookup; otherwise a model could induce an endless rewrite loop.
		const invalid = {
			...produced.value,
			exports: produced.value.exports.map((entry) =>
				entry === alias ? { ...entry, referencePath: entry.path } : entry,
			),
		};
		assert.equal(decodeDependencyModel(JSON.stringify(invalid), "dependency").ok, false);

		// Reverse compiler overload order without changing either signature's stable identity.
		const producerFile = path.join(root, "index.d.ts");
		const producer = readFileSync(producerFile, "utf8");
		for (const changed of [
			producer.replace("{@label NUMBER}", "{@label TEXT}"),
			producer.replace("constructor();", "constructor();\nconstructor(value: string);"),
			producer.replace("(Selected:SELECTED).(read:TEXT)", "(Selected:MISSING).(read:TEXT)"),
		]) {
			writeFileSync(producerFile, changed);
			const rejected = await analyzeAPIs({ ...base, packageName: "dependency" }, root);
			assert.equal(rejected.ok, false);
			assert.equal(rejected.diagnostics[0]?.code, DiagnosticCode.DocumentationReference);
		}
		const publicStart = producer.indexOf("/**\n * Public overload documentation.");
		const internalStart = producer.indexOf("/**\n * Internal overload documentation.");
		const afterOverloads = producer.indexOf("/**\n * Links to", internalStart);
		assert(publicStart >= 0 && internalStart > publicStart && afterOverloads > internalStart);
		writeFileSync(
			producerFile,
			producer.slice(0, publicStart) +
				producer.slice(internalStart, afterOverloads) +
				producer.slice(publicStart, internalStart) +
				producer.slice(afterOverloads).replace("(overloaded:1)", "(overloaded:2)"),
		);
		const reordered = await analyzeAPIs({ ...base, packageName: "dependency" }, root);
		assert.equal(reordered.ok, true, JSON.stringify(reordered));
		writeFileSync(path.join(root, "api-model.json"), reordered.value.generateModel());
		writeFileSync(
			consumerFile,
			original
				.replace("dependency#(overloaded:1)", "dependency#(overloaded:2)")
				.replace("(localAlias:1)", "(localAlias:2)"),
		);
		const reorderedConsumer = await analyzeAPIs(
			{
				...base,
				packageName: "consumer",
				suite: { packages: ["dependency"], modelFile: "api-model.json" },
			},
			directory,
		);
		assert.equal(reorderedConsumer.ok, true, JSON.stringify(reorderedConsumer));
	});

	it("loads matching transitive and peer models and rejects missing selected artifacts", async () => {
		const dependencyRoot = path.join(directory, "node_modules", "dependency");
		writeFileSync(
			path.join(dependencyRoot, "package.json"),
			JSON.stringify({
				name: "dependency",
				types: "index.d.ts",
				dependencies: { transitive: "1.0.0" },
				peerDependencies: { peer: "1.0.0" },
			}),
		);
		for (const name of ["dependency", "transitive", "peer"]) {
			const root = path.join(directory, "node_modules", name);
			mkdirSync(root, { recursive: true });
			if (name !== "dependency") {
				writeFileSync(
					path.join(root, "package.json"),
					JSON.stringify({ name, types: "index.d.ts" }),
				);
				cpSync(
					new URL("../../src/test/fixtures/suite/dependency.d.ts", import.meta.url),
					path.join(root, "index.d.ts"),
				);
				writeFileSync(
					path.join(root, "tsconfig.json"),
					JSON.stringify({ compilerOptions: { strict: true }, files: ["index.d.ts"] }),
				);
			}
			const built = await analyzeAPIs(
				{
					packageName: name,
					project: "tsconfig.json",
					entrypoints: [{ name: ".", path: "index.d.ts" }],
				},
				root,
			);
			assert.equal(built.ok, true, JSON.stringify(built));
			writeFileSync(path.join(root, "api-model.json"), built.value.generateModel());
		}
		const configuration = {
			packageName: "consumer",
			project: "tsconfig.json",
			entrypoints: [{ name: ".", path: "index.d.ts" }],
			suite: { packages: ["dep*", "trans*", "peer"], modelFile: "api-model.json" },
		};
		const available = await analyzeAPIs(configuration, directory);
		assert.equal(available.ok, true);
		const consumerSource = readFileSync(
			new URL("../../src/test/fixtures/suite/consumer.d.ts", import.meta.url),
			"utf8",
		);
		for (const name of ["transitive", "peer"]) {
			writeFileSync(
				path.join(directory, "index.d.ts"),
				consumerSource.replaceAll("dependency#", `${name}#`),
			);
			const resolved = await analyzeAPIs(
				{ ...configuration, rules: { requireReleaseLevel: false } },
				directory,
			);
			assert.equal(resolved.ok, true, JSON.stringify(resolved));
			const model = decodeDependencyModel(resolved.value.generateModel(), "consumer");
			assert.equal(model.ok, true);
			assert.equal(
				model.value.apis.find((item) => item.name === "consumer")?.documentation.links[0]
					?.origin.packageName,
				name,
			);
		}
		cpSync(
			new URL("../../src/test/fixtures/suite/unused.d.ts", import.meta.url),
			path.join(directory, "index.d.ts"),
		);
		for (const name of ["transitive", "peer"]) {
			const file = path.join(directory, "node_modules", name, "api-model.json");
			const model = readFileSync(file, "utf8");
			rmSync(file);
			const missing = await analyzeAPIs(configuration, directory);
			assert.equal(missing.ok, false);
			assert.match(missing.diagnostics[0]?.message ?? "", new RegExp(name));
			writeFileSync(file, model);
		}
	});

	it("rejects outside-suite and missing exported documentation targets", async () => {
		const root = path.join(directory, "node_modules", "dependency");
		const dependency = await analyzeAPIs(
			{
				packageName: "dependency",
				project: "tsconfig.json",
				entrypoints: [{ name: ".", path: "index.d.ts" }],
			},
			root,
		);
		assert.equal(dependency.ok, true);
		writeFileSync(path.join(root, "api-model.json"), dependency.value.generateModel());
		const source = readFileSync(
			new URL("../../src/test/fixtures/suite/consumer.d.ts", import.meta.url),
			"utf8",
		);
		for (const [reference, expected] of [
			["outside#source", DiagnosticCode.DocumentationUnsupported],
			["dependency#missing", DiagnosticCode.DocumentationReference],
		] as const) {
			writeFileSync(
				path.join(directory, "index.d.ts"),
				source.replace("dependency#source", reference),
			);
			const result = await analyzeAPIs(
				{
					packageName: "consumer",
					project: "tsconfig.json",
					entrypoints: [{ name: ".", path: "index.d.ts" }],
					rules: { requireReleaseLevel: false },
					suite: { packages: ["dependency"], modelFile: "api-model.json" },
				},
				directory,
			);
			assert.equal(result.ok, false);
			assert.equal(result.diagnostics[0]?.code, expected);
			assert.equal("value" in result, false);
		}
	});

	it("enforces configured dependency policies without requiring consumer re-exports", async () => {
		const root = path.join(directory, "node_modules", "dependency");
		const built = await analyzeAPIs(
			{
				packageName: "dependency",
				project: "tsconfig.json",
				entrypoints: [{ name: ".", path: "index.d.ts" }],
			},
			root,
		);
		assert.equal(built.ok, true);
		writeFileSync(path.join(root, "api-model.json"), built.value.generateModel());
		const original = readFileSync(
			new URL("../../src/test/fixtures/suite/consumer.d.ts", import.meta.url),
			"utf8",
		);
		const configuration = {
			packageName: "consumer",
			project: "tsconfig.json",
			entrypoints: [{ name: ".", path: "index.d.ts" }],
			rules: { requireReleaseLevel: false },
			suite: { packages: ["dependency"], modelFile: "api-model.json" },
		};
		writeFileSync(path.join(directory, "index.d.ts"), original);
		const exposed = await analyzeAPIs(
			{ ...configuration, referencePolicies: { entrypointExposure: true } },
			directory,
		);
		assert.equal(exposed.ok, true, JSON.stringify(exposed));
		writeFileSync(
			path.join(directory, "index.d.ts"),
			original.replace("dependency#source", "dependency#internalSource"),
		);
		const forbidden = await analyzeAPIs(
			{ ...configuration, referencePolicies: { inheritanceVisibility: true } },
			directory,
		);
		assert.equal(forbidden.ok, false);
		assert.equal(forbidden.diagnostics[0]?.code, DiagnosticCode.ReferencePolicy);
		const disabled = await analyzeAPIs(
			{ ...configuration, referencePolicies: { inheritanceVisibility: false } },
			directory,
		);
		assert.equal(disabled.ok, true);
		writeFileSync(
			path.join(directory, "index.d.ts"),
			original.replace("dependency#target", "dependency#internalSource"),
		);
		const link = await analyzeAPIs(configuration, directory);
		assert.equal(link.ok, false);
		assert.equal(link.diagnostics[0]?.code, DiagnosticCode.DocumentationLinkPolicy);

		// Import expressions must not bypass stability checks or require a consumer re-export.
		cpSync(
			new URL("../../src/test/fixtures/suite/import-types.d.ts", import.meta.url),
			path.join(directory, "index.d.ts"),
		);
		const importType = await analyzeAPIs(
			{
				...configuration,
				referencePolicies: { releaseCompatibility: true, entrypointExposure: true },
			},
			directory,
		);
		assert.equal(importType.ok, false);
		assert.equal(importType.diagnostics[0]?.code, DiagnosticCode.ReferencePolicy);
		assert.match(importType.diagnostics[0]?.message ?? "", /Preview/);

		// Disable only release compatibility to prove that exposure checks do not require a dependency re-export.
		const permittedImportType = await analyzeAPIs(
			{
				...configuration,
				referencePolicies: { releaseCompatibility: false, entrypointExposure: true },
			},
			directory,
		);
		assert.equal(permittedImportType.ok, true, JSON.stringify(permittedImportType));
	});

	it("preserves dependency type aliases without requiring consumer re-exports", async () => {
		const root = path.join(directory, "node_modules", "dependency");
		const base = {
			project: "tsconfig.json",
			entrypoints: [{ name: ".", path: "index.d.ts" }],
		};
		const dependency = await analyzeAPIs({ ...base, packageName: "dependency" }, root);
		assert.equal(dependency.ok, true, JSON.stringify(dependency));
		writeFileSync(path.join(root, "api-model.json"), dependency.value.generateModel());
		const source = readFileSync(
			new URL("../../src/test/fixtures/suite/alias-consumer.d.ts", import.meta.url),
			"utf8",
		);
		for (const reexport of [false, true]) {
			// Both variants must remain usable; exposure checks apply only to same-package targets.
			writeFileSync(
				path.join(directory, "index.d.ts"),
				reexport
					? source
					: source.replace('export type { AliasContract } from "dependency";', ""),
			);
			const result = await analyzeAPIs(
				{
					...base,
					packageName: "consumer",
					suite: { packages: ["dependency"], modelFile: "api-model.json" },
					referencePolicies: { entrypointExposure: true, releaseCompatibility: true },
				},
				directory,
			);
			assert.equal(result.ok, true, JSON.stringify(result));
			const report = result.value.generateReport(".", {
				name: "public",
				releaseLevels: [ReleaseLevel.Public],
			});
			assert.equal(report.ok, true);
			assert.match(report.value, /accept\(value: AliasContract<string>\): void;/);
			assert.match(report.value, /computed\(value: AliasContract<string>\): void;/);
			assert.equal(report.value.includes("as AliasContract"), reexport);

			// Using a dependency alias does not make it a consumer export; only an explicit re-export does.
			const model = decodeDependencyModel(result.value.generateModel(), "consumer");
			assert.equal(model.ok, true, JSON.stringify(model));
			assert.equal(
				model.value.exports.some((entry) => entry.path.join(".") === "AliasContract"),
				reexport,
			);
		}
	});

	it("detects real Node/browser export-condition divergence without accepting a baseline", async () => {
		const root = path.join(directory, "node_modules", "platform");
		mkdirSync(root, { recursive: true });
		writeFileSync(
			path.join(directory, "package.json"),
			JSON.stringify({
				name: "consumer",
				type: "module",
				dependencies: { platform: "1.0.0" },
			}),
		);
		writeFileSync(
			path.join(root, "package.json"),
			JSON.stringify({
				name: "platform",
				type: "module",
				exports: {
					".": { browser: "./browser.d.ts", node: "./node.d.ts", default: "./node.d.ts" },
				},
			}),
		);
		for (const condition of ["node", "browser"]) {
			cpSync(
				new URL("../../src/test/fixtures/suite/platform.d.ts", import.meta.url),
				path.join(root, `${condition}.d.ts`),
			);
			writeFileSync(
				path.join(directory, `${condition}.json`),
				JSON.stringify({
					compilerOptions: {
						strict: true,
						module: "NodeNext",
						customConditions: [condition],
						types: [],
					},
					files: ["index.d.ts"],
				}),
			);
		}
		cpSync(
			new URL("../../src/test/fixtures/suite/conditional-entry.d.ts", import.meta.url),
			path.join(directory, "index.d.ts"),
		);
		const node = await analyzeAPIs(
			{
				packageName: "consumer",
				project: "node.json",
				entrypoints: [{ name: ".", path: "index.d.ts" }],
			},
			directory,
		);
		const browser = await analyzeAPIs(
			{
				packageName: "consumer",
				project: "browser.json",
				entrypoints: [{ name: ".", path: "index.d.ts" }],
			},
			directory,
		);
		assert.equal(node.ok, true, JSON.stringify(node));
		assert.equal(browser.ok, true, JSON.stringify(browser));
		const selection = { name: "public", releaseLevels: [ReleaseLevel.Public] };
		const nodeReport = node.value.generateReport(".", selection);
		const browserReport = browser.value.generateReport(".", selection);
		assert.equal(nodeReport.ok, true);
		assert.equal(browserReport.ok, true);
		assert.equal(compareReviewBaseline(nodeReport.value, browserReport.value).ok, true);
		const browserFile = path.join(root, "browser.d.ts");
		writeFileSync(
			browserFile,
			readFileSync(browserFile, "utf8").replace('"same"', '"browser-only"'),
		);
		const changed = await analyzeAPIs(
			{
				packageName: "consumer",
				project: "browser.json",
				entrypoints: [{ name: ".", path: "index.d.ts" }],
			},
			directory,
		);
		assert.equal(changed.ok, true);
		const changedReport = changed.value.generateReport(".", selection);
		assert.equal(changedReport.ok, true);
		assert.equal(compareReviewBaseline(changedReport.value, nodeReport.value).ok, false);
		assert.equal(browser.value.generateReport(".", selection).ok, true);
		assert.equal(readFileSync(browserFile, "utf8").includes('"browser-only"'), true);
	});
});

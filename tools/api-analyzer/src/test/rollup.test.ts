import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "mocha";
import { analyzeAPIs, ReleaseLevel } from "../index.js";
import {
	analyzeRepository,
	compilePackage,
	createRepository,
	getPackageRoot,
} from "./repositoryUtils.js";
import { primaryExports, repositoryScenarios } from "./repositoryScenarios.js";
import { createProgram, ModuleKind, ScriptTarget } from "typescript6";
import type { CompletedAnalysis } from "../analysis-types/completedGraph.js";
import type { DeclarationSyntaxFacts } from "../analysis-types/declarationSyntax.js";
import { DiagnosticCode } from "../analysis-types/result.js";
import { generateDeclarationRollups } from "../rollup-generation/declarationRollup.js";
import { freezeData } from "../utilities/freezeData.js";
import { assertSnapshot } from "./snapshotUtils.js";

describe("Detached declaration rollups", () => {
	it("cleans temporary projects after asynchronous success and failure", async () => {
		const failure = new Error("Fixture operation failed");
		for (const shouldFail of [false, true]) {
			let projectDirectory: string | undefined;
			const run = withRollupProject("api-rollup-cleanup-", async (directory) => {
				projectDirectory = directory;
				await Promise.resolve();
				assert(
					existsSync(directory),
					"The project must remain available until the work completes.",
				);
				if (shouldFail) {
					throw failure;
				}
			});
			await (shouldFail ? assert.rejects(run, (error: unknown) => error === failure) : run);
			assert(projectDirectory !== undefined);
			assert.equal(existsSync(projectDirectory), false);
		}
	});

	it("accepts empty capture and rejects invalid paths and unsupported selected declarations", () => {
		const empty: DeclarationSyntaxFacts = {
			lexicalNames: [],
			imports: [],
			surfaces: [],
			declarations: [],
		};
		const selection = { name: "public", releaseLevels: [ReleaseLevel.Public] };
		const graph: CompletedAnalysis = freezeData({
			facts: {
				packageName: "test",
				compilerVersion: "7.0.2",
				declarationSyntax: empty,
				surfaces: [],
				declarations: [],
			},
			classification: { items: [], modifierTags: [] },
			documentation: [],
		});
		const emptyResult = generateDeclarationRollups(graph, selection);
		assert.equal(emptyResult.ok, true);
		assert.deepEqual(Object.keys(emptyResult.value), ["__api.d.ts"]);
		for (const name of ["./../outside", "./__api", "./index", "/absolute", "./a//b"]) {
			const invalid = generateDeclarationRollups(
				{
					...graph,
					facts: {
						...graph.facts,
						declarationSyntax: {
							...empty,
							surfaces: [
								{ name: ".", exports: [] },
								{ name, exports: [] },
							],
						},
					},
				},
				selection,
			);
			assert.equal(invalid.ok, false, name);
			assert.equal(invalid.diagnostics[0]?.code, DiagnosticCode.RollupConfiguration, name);
		}
		const unsupported = generateDeclarationRollups(
			{
				...graph,
				facts: {
					...graph.facts,
					declarationSyntax: {
						...empty,
						surfaces: [
							{
								name: ".",
								exports: [
									{ name: "value", target: "value", typeOnly: false, outsideSuite: true },
								],
							},
						],
						declarations: [
							{
								id: "value",
								name: "value",
								fragments: [
									{
										signatures: [],
										syntax: {
											excerpt: {
												tokens: [{ kind: "Content", text: "const value = 1;" }],
												tokenRange: { startIndex: 0, endIndex: 1 },
											},
											isDeclarationFile: false,
											declarationStart: 0,
											modifiers: [],
											comments: [],
											importTypes: [],
										},
									},
								],
							},
						],
					},
				},
			},
			selection,
		);
		assert.equal(unsupported.ok, false);
		assert.equal(unsupported.diagnostics[0]?.code, DiagnosticCode.RollupUnsupported);
		const relativeAugmentation = generateDeclarationRollups(
			{
				...graph,
				facts: {
					...graph.facts,
					declarationSyntax: {
						...empty,
						declarations: [
							{
								id: "augmentation",
								name: "local",
								moduleAugmentation: "./local.js",
								fragments: [],
							},
						],
					},
				},
			},
			selection,
		);
		assert.equal(relativeAugmentation.ok, false);
		assert.equal(relativeAugmentation.diagnostics[0]?.code, DiagnosticCode.RollupUnsupported);
		assert.match(
			relativeAugmentation.diagnostics[0]?.message ?? "",
			/Relative module augmentations/,
		);
		const nested = generateDeclarationRollups(
			{
				...graph,
				facts: {
					...graph.facts,
					declarationSyntax: { ...empty, surfaces: [{ name: "./nested/entry", exports: [] }] },
				},
			},
			selection,
		);
		assert.equal(nested.ok, true);
		assert.match(nested.value["nested/entry.d.ts"] ?? "", /from "\.\.\/__api.js"/);
	});

	it("preserves namespace aliases and local import types after relocation", async () => {
		await withRollupProject("api-rollup-aliases-", async (directory) => {
			copyRollupFixtures(directory, [
				["aliases.d.ts", "index.d.ts"],
				["aliases-consumer.ts", "consumer.ts"],
				["aliases-local.d.ts", "local.d.ts"],
				["right.d.ts", "right.d.ts"],
				["aliases-external.d.ts", "external.d.ts"],
				["foreign.d.ts", "node_modules/foreign/index.d.ts"],
			]);
			const foreign = path.join(directory, "node_modules", "foreign");
			writeFileSync(
				path.join(foreign, "package.json"),
				JSON.stringify({ name: "foreign", type: "module", types: "index.d.ts" }),
			);
			writeFileSync(
				path.join(directory, "package.json"),
				JSON.stringify({ name: "aliases", type: "module" }),
			);
			writeFileSync(
				path.join(directory, "tsconfig.json"),
				JSON.stringify({
					compilerOptions: { strict: true, module: "NodeNext", types: [] },
					files: ["index.d.ts"],
				}),
			);

			// Check that both compilers accept the consumer with the original declarations.
			compileRollupFiles(directory, ["consumer.ts"], "ES2022");
			const result = await analyzeAPIs(
				{
					packageName: "aliases",
					project: "tsconfig.json",
					entrypoints: [{ name: ".", path: "index.d.ts" }],
				},
				directory,
			);
			assert(result.ok, JSON.stringify(result));

			// Remove the original files so an unchanged relative path cannot hide a generation error.
			rmSync(path.join(directory, "index.d.ts"));
			rmSync(path.join(directory, "local.d.ts"));
			rmSync(path.join(directory, "right.d.ts"));
			rmSync(path.join(directory, "external.d.ts"));
			const generated = result.value.generateRollups({
				name: "public",
				releaseLevels: [ReleaseLevel.Public],
			});
			assert(generated.ok, JSON.stringify(generated));
			writeRollupArtifacts(directory, generated.value);
			compileRollupFiles(directory, ["consumer.ts"], "ES2022");

			// An import without named bindings must still apply global augmentations when the export selection is empty.
			const empty = result.value.generateRollups({ name: "empty", releaseLevels: [] });
			assert(empty.ok, JSON.stringify(empty));
			writeRollupArtifacts(directory, empty.value);
			assert.doesNotMatch(empty.value["index.d.ts"] ?? "", /Aliases|OrdinaryModule/);
			writeFileSync(
				path.join(directory, "consumer.ts"),
				'import "./index.js";\n"".extra();\n',
			);
			compileRollupFiles(directory, ["consumer.ts"], "ES2022");
		});
	});

	it("preserves side-effect imports and module augmentations without selected exports", async () => {
		await withRollupProject("api-rollup-effects-", async (directory) => {
			copyRollupFixtures(directory, [
				["effects.d.ts", "index.d.ts"],
				["effects-consumer.ts", "consumer.ts"],
				["effects-external.d.ts", "node_modules/effects/index.d.ts"],
				["effects-foreign.d.ts", "node_modules/foreign/index.d.ts"],
			]);
			for (const name of ["effects", "foreign"]) {
				writeFileSync(
					path.join(directory, "node_modules", name, "package.json"),
					JSON.stringify({ name, type: "module", types: "index.d.ts" }),
				);
			}
			writeFileSync(
				path.join(directory, "package.json"),
				JSON.stringify({
					name: "effects-package",
					type: "module",
					exports: { ".": { types: "./index.d.ts" } },
				}),
			);
			writeFileSync(
				path.join(directory, "tsconfig.json"),
				JSON.stringify({
					compilerOptions: { strict: true, module: "NodeNext", types: [] },
					files: ["index.d.ts"],
				}),
			);
			compileRollupFiles(directory, ["consumer.ts"]);
			const result = await analyzeAPIs(
				{
					packageName: "effects-package",
					project: "tsconfig.json",
					entrypoints: [{ name: ".", path: "index.d.ts" }],
					rules: { requireReleaseLevel: false },
				},
				directory,
			);
			assert(result.ok, JSON.stringify(result));
			rmSync(path.join(directory, "index.d.ts"));
			for (const releaseLevels of [[ReleaseLevel.Public], []]) {
				const generated = result.value.generateRollups({ name: "selected", releaseLevels });
				assert(generated.ok, JSON.stringify(generated));
				assert.match(generated.value["__api.d.ts"] ?? "", /import "effects"/);
				assert.match(generated.value["__api.d.ts"] ?? "", /declare module "foreign"/);
				assert.doesNotMatch(
					generated.value["__api.d.ts"] ?? "",
					/privateRemarks|must not be published/,
				);
				assert.doesNotMatch(generated.value["index.d.ts"] ?? "", /Support/);
				if (releaseLevels.length === 0) {
					assert.doesNotMatch(generated.value["index.d.ts"] ?? "", /Value/);
				}
				writeRollupArtifacts(directory, generated.value);
				compileRollupFiles(directory, ["consumer.ts"]);
			}
		});
	});

	it("relocates relative module augmentations with their local declarations", async () => {
		await withRollupProject("api-rollup-relative-", async (directory) => {
			const files = [
				"local.d.ts",
				"augmentation.d.ts",
				"other.d.ts",
				"second.d.ts",
				"nested/augmentation.d.ts",
				"index.d.ts",
			];
			copyRollupFixtures(
				directory,
				[...files, "consumer.ts", "package.json", "tsconfig.json"].map((file) => [
					`relative-augmentation/${file}`,
					file,
				]),
			);
			compileRollupFiles(directory, ["consumer.ts"]);
			const result = await analyzeAPIs(
				{
					packageName: "relative-package",
					project: "tsconfig.json",
					entrypoints: [
						{ name: ".", path: "index.d.ts" },
						{ name: "./second", path: "second.d.ts" },
					],
					rules: { requireReleaseLevel: false },
				},
				directory,
			);
			assert(result.ok, JSON.stringify(result));
			for (const file of files) {
				rmSync(path.join(directory, file));
			}
			const generated = result.value.generateRollups({
				name: "public",
				releaseLevels: [ReleaseLevel.Public],
			});
			assert(generated.ok, JSON.stringify(generated));
			assert.doesNotMatch(generated.value["__api.d.ts"] ?? "", /\.\/local\.js/);
			assert.doesNotMatch(
				generated.value["__api.d.ts"] ?? "",
				/privateRemarks|Local augmentation secret/,
			);
			assert.match(generated.value["__api.d.ts"] ?? "", /Returns supporting state/);
			writeRollupArtifacts(directory, generated.value);
			compileRollupFiles(directory, ["consumer.ts"]);
			const empty = result.value.generateRollups({ name: "empty", releaseLevels: [] });
			assert(empty.ok, JSON.stringify(empty));
			assert.doesNotMatch(
				empty.value["__api.d.ts"] ?? "",
				/class Store|interface Item|Support/,
			);
		});
	});

	for (const producer of ["typescript6", "typescript"] as const) {
		for (const scenario of repositoryScenarios) {
			it(`compiles ${scenario} rollups from ${producer} declarations`, async () => {
				const repository = createRepository(producer, scenario);
				try {
					for (const name of repository.packages) {
						compilePackage(repository, name);
					}
					const artifacts = await analyzeRepository(repository);
					for (const artifact of artifacts) {
						const root = getPackageRoot(repository, artifact.name);
						rmSync(path.join(root, "src"), { recursive: true });
						rmSync(path.join(root, "lib"), { recursive: true });
					}
					for (const complete of [true, false]) {
						for (const artifact of artifacts) {
							const root = getPackageRoot(repository, artifact.name);
							const output = artifact.analysis.generateRollups({
								name: complete ? "complete" : "public",
								releaseLevels: complete
									? [
											ReleaseLevel.Public,
											ReleaseLevel.Beta,
											ReleaseLevel.Alpha,
											ReleaseLevel.Internal,
										]
									: [ReleaseLevel.Public],
							});
							assert(output.ok, JSON.stringify(output));
							assert.equal(artifact.analysis.generateModel(), artifact.text);
							writeRollupArtifacts(path.join(root, "lib"), output.value);
							if (scenario === "primary") {
								const program = createProgram([path.join(root, "lib/index.d.ts")], {
									module: ModuleKind.NodeNext,
									target: ScriptTarget.ES2022,
									types: [],
								});
								const source = program.getSourceFile(path.join(root, "lib/index.d.ts"));
								assert(source !== undefined);
								const moduleSymbol = program.getTypeChecker().getSymbolAtLocation(source);
								assert(moduleSymbol !== undefined);
								const names = program
									.getTypeChecker()
									.getExportsOfModule(moduleSymbol)
									.map((symbol) => symbol.name)
									.sort();
								assert.deepEqual(
									names,
									primaryExports
										.filter((name) => complete || !["experiment", "hidden"].includes(name))
										.sort(),
								);
							}
							compileRollupFiles(
								root,
								Object.keys(output.value).map((file) => `lib/${file}`),
								"ES2022",
							);
						}
					}
				} finally {
					rmSync(repository.directory, { recursive: true, force: true });
				}
			}).timeout(90000);
		}
	}

	it("retains private support types and documentation without publishing excluded APIs", async () => {
		await withRollupProject("api-rollup-", async (directory) => {
			copyRollupFixtures(directory, [
				["foreign.d.ts", "node_modules/foreign/index.d.ts"],
				["index.d.ts", "index.d.ts"],
				["second.d.ts", "second.d.ts"],
				["left.d.ts", "left.d.ts"],
				["right.d.ts", "right.d.ts"],
			]);
			const foreign = path.join(directory, "node_modules", "foreign");
			writeFileSync(
				path.join(foreign, "package.json"),
				JSON.stringify({ name: "foreign", type: "module", types: "index.d.ts" }),
			);
			writeFileSync(
				path.join(directory, "package.json"),
				JSON.stringify({ name: "rollup-test", type: "module" }),
			);
			writeFileSync(
				path.join(directory, "tsconfig.json"),
				JSON.stringify({
					compilerOptions: { strict: true, module: "NodeNext", types: [] },
					files: ["index.d.ts", "second.d.ts"],
				}),
			);
			const result = await analyzeAPIs(
				{
					packageName: "rollup-test",
					project: "tsconfig.json",
					entrypoints: [
						{ name: ".", path: "index.d.ts" },
						{ name: "./second", path: "second.d.ts" },
					],
				},
				directory,
			);
			assert(result.ok, JSON.stringify(result));
			const analysis = result.value;
			rmSync(path.join(directory, "index.d.ts"));
			rmSync(path.join(directory, "second.d.ts"));
			for (const file of ["left", "right"]) {
				rmSync(path.join(directory, `${file}.d.ts`));
			}
			const model = analysis.generateModel();
			const selection = { name: "public", releaseLevels: [ReleaseLevel.Public] };
			const generated = analysis.generateRollups(selection);
			assert(generated.ok, JSON.stringify(generated));
			const shared = generated.value["__api.d.ts"] ?? "";
			assert.doesNotMatch(shared, /\*[\t ]+\r?\n/);
			assert.doesNotMatch(shared, /^export[\t ]{2,}/m);
			assert.match(shared, /export function external\(input: Input\): string;/);
			assert.equal(
				shared.includes(
					"export // Preserve the line-comment boundary.\n\tfunction read_1(input: Support): string;",
				),
				true,
			);
			for (const name of ["first", "second"]) {
				assert.equal(
					shared.includes(
						`export /* Preserve  modifier comment spacing. */ const ${name}: "${name}";`,
					),
					true,
				);
			}
			for (const file of ["index.d.ts", "second.d.ts"]) {
				assert.match(generated.value[file] ?? "", /Package overview retained/);
				assert.doesNotMatch(generated.value[file] ?? "", /privateRemarks|Private package/);
			}
			assert.match(shared, /interface Support/);
			assert.match(shared, /Reads a value/);
			assert.equal(
				shared.includes(
					"/**\n * Reads a value.\n * @param input - Value to read.\n * @returns The stored text.",
				),
				true,
			);
			assert.match(shared, /Reads the value/);
			assert.match(shared, /Selected namespace with a type-only class alias/);
			assert.doesNotMatch(
				shared,
				/privateRemarks|implementation note|function preview|PreviewOnly|\.\/left\.js/,
			);
			assert.equal(analysis.generateModel(), model);
			assert.deepEqual(analysis.generateRollups(selection), generated);
			for (const [file, text] of Object.entries(generated.value)) {
				assertSnapshot(text, `rollup-public-${file}`);
			}
			writeRollupArtifacts(directory, generated.value);
			copyRollupFixtures(directory, [["consumer.ts", "consumer.ts"]]);
			compileRollupFiles(directory, ["consumer.ts"], "ES2022");
			assert.equal(readFileSync(path.join(directory, "__api.d.ts"), "utf8"), shared);
			const atomic = analysis.generateRollups({ ...selection, requireTags: ["@sealed"] });
			assert(atomic.ok, JSON.stringify(atomic));
			assert.match(atomic.value["__api.d.ts"] ?? "", /function atomic\(value: string\)/);
			assert.match(atomic.value["__api.d.ts"] ?? "", /function atomic\(value: number\)/);
			assert.doesNotMatch(atomic.value["index.d.ts"] ?? "", /as atomic/);
			const empty = analysis.generateRollups({ name: "empty", releaseLevels: [] });
			assert(empty.ok, JSON.stringify(empty));
			assert.match(empty.value["index.d.ts"] ?? "", /export \* as Foreign from "foreign"/);
			assert.doesNotMatch(empty.value["__api.d.ts"] ?? "", /class Store/);
		});
	});
});

/**
 * Runs a rollup test in an isolated project and removes the project on success or failure.
 * @remarks
 * Tests delete copied declarations before writing generated output so stale imports cannot resolve
 * to the original inputs. The temporary project protects checked-in fixtures from those changes.
 * Cleanup waits for the test to finish, including asynchronous analysis and consumer checks.
 * @param prefix - Temporary directory name prefix used to identify the scenario.
 * @param run - Test steps that own the project contents and assertions.
 * @returns A promise that completes after the test and cleanup.
 */
async function withRollupProject(
	prefix: string,
	run: (directory: string) => Promise<void>,
): Promise<void> {
	const directory = mkdtempSync(path.join(tmpdir(), prefix));
	try {
		await run(directory);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}

/**
 * Copies selected rollup inputs into a disposable project without changing checked-in fixtures.
 * @remarks
 * Tests can rename inputs or install them as dependencies through explicit file mappings.
 * Parent directories are created without changing the destination paths used by analysis.
 * @param directory - Temporary project root.
 * @param files - Pairs of rollup fixture paths and destination paths relative to the project root.
 */
function copyRollupFixtures(
	directory: string,
	files: readonly (readonly [fixture: string, destination: string])[],
): void {
	for (const [fixture, destination] of files) {
		const output = path.join(directory, destination);
		mkdirSync(path.dirname(output), { recursive: true });
		cpSync(new URL(`../../src/test/fixtures/rollup/${fixture}`, import.meta.url), output);
	}
}

/**
 * Checks consumer source or generated declarations with both supported TypeScript compilers.
 * @remarks
 * Explicit input files and compiler options keep the check independent of the analysis project.
 * Its configuration can still list original declarations that the test has removed.
 * Each compiler runs in a separate process with a timeout; failures propagate to the test.
 * @param directory - Temporary package root used for package resolution.
 * @param files - Input file paths relative to the package root.
 * @param target - Explicit language target, or omitted to retain each compiler's default.
 */
function compileRollupFiles(
	directory: string,
	files: readonly string[],
	target?: "ES2022",
): void {
	const require = createRequire(import.meta.url);
	for (const compiler of ["typescript6", "typescript"]) {
		const compilerRoot = path.dirname(require.resolve(`${compiler}/package.json`));
		execFileSync(
			process.execPath,
			[
				path.join(compilerRoot, "bin/tsc"),
				...files,
				"--ignoreConfig",
				"--noEmit",
				"--strict",
				"--module",
				"NodeNext",
				...(target === undefined ? [] : ["--target", target]),
			],
			{ cwd: directory, stdio: "inherit", timeout: 15000 },
		);
	}
}

/**
 * Writes a generated artifact set into a temporary package for consumer compilation.
 * @remarks
 * Relative paths, including nested entrypoints, are preserved.
 * This does not remove original inputs or artifacts from an earlier selection.
 * Tests control those removals explicitly so missing output cannot be hidden by retained inputs.
 * @param directory - Destination root for the generated artifact paths.
 * @param artifacts - Generated file contents keyed by relative path.
 */
function writeRollupArtifacts(
	directory: string,
	artifacts: Readonly<Record<string, string>>,
): void {
	for (const [file, text] of Object.entries(artifacts)) {
		const output = path.join(directory, file);
		mkdirSync(path.dirname(output), { recursive: true });
		writeFileSync(output, text);
	}
}

import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "mocha";
import { analyzeAPIs, DiagnosticCode, ReleaseLevel } from "../index.js";
import { decodeDependencyModel } from "../model-generation/dependencyModel.js";
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
		writeFileSync(file, JSON.stringify({ ...JSON.parse(model), version: 2 }));
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

		// Successfully resolving a model target must not bypass ambiguity, range, or visibility checks.
		const consumerFile = path.join(directory, "index.d.ts");
		const original = readFileSync(consumerFile, "utf8");
		for (const [from, to, expected] of [
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

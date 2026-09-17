import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "mocha";
import { analyzeAPIs, DiagnosticCode, ReleaseLevel } from "../index.js";
import { decodeDependencyModel } from "../model-generation/dependencyModel.js";
import { compareReviewBaseline } from "../report-generation/reviewBaseline.js";

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

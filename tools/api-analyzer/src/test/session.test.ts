import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mock } from "node:test";
import { TSDocParser } from "@microsoft/tsdoc";
import { API } from "typescript/unstable/sync";
import { afterEach, beforeEach, describe, it } from "mocha";
import { resolveConfiguration } from "../configuration.js";
import type { EffectiveConfiguration } from "../analysis-types/configuration.js";
import { analyzeDeclarations, createNativeAdapter } from "../analysis/nativeAdapter.js";
import { DiagnosticCode, reportFailure } from "../analysis-types/result.js";
import type {
	AnalysisFacts,
	DeclarationFact,
	SignatureFact,
} from "../analysis-types/facts.js";
import { analyzeAPIs, ReleaseLevel } from "../index.js";
import * as publicAPI from "../index.js";

describe("One-shot API analysis and adapter facts", () => {
	let directory: string;
	let configuration: EffectiveConfiguration;
	let adapter: ReturnType<typeof createNativeAdapter>;
	beforeEach(() => {
		directory = mkdtempSync(path.join(tmpdir(), "api-analyzer-session-"));
		cpSync(
			fileURLToPath(new URL("../../src/test/fixtures/shared/", import.meta.url)),
			path.join(directory, "src"),
			{ recursive: true },
		);
		writeFileSync(
			path.join(directory, "package.json"),
			JSON.stringify({ name: "example", type: "module" }),
		);
		cpSync(
			new URL("../../src/test/fixtures/session/base/", import.meta.url),
			path.join(directory, "src"),
			{ recursive: true },
		);
		writeFileSync(
			path.join(directory, "tsconfig.json"),
			JSON.stringify({
				compilerOptions: {
					target: "ES2022",
					module: "NodeNext",
					strict: true,
					types: [],
					noEmit: true,
				},
				include: ["src"],
			}),
		);
		const result = resolveConfiguration(
			{
				packageName: "example",
				project: "tsconfig.json",
				entrypoints: [
					{ name: ".", path: "src/index.ts" },
					{ name: "./chain", path: "src/chain.ts" },
				],
			},
			directory,
		);
		assert(result.ok);
		configuration = result.value;
		adapter = createNativeAdapter();
	});
	afterEach(() => {
		adapter.close();
		rmSync(directory, { recursive: true, force: true });
	});

	it("returns completed analysis without a public compiler lifecycle", async () => {
		assert.deepEqual(
			Object.entries(publicAPI)
				.filter(([, value]) => typeof value === "function")
				.map(([name]) => name),
			["analyzeAPIs", "decodeDependencyModel", "decodeDependencyModels"],
		);
		const entrypoint = path.join(directory, "src/public.ts");
		writeFileSync(
			entrypoint,
			"/** Converts a value. @public */\nexport function convert(value: string): string { return value; }\n",
		);
		const result = await analyzeAPIs({
			...configuration,
			entrypoints: [{ name: ".", path: entrypoint }],
		});
		assert.equal(result.ok, true);
		assert.equal(Object.isFrozen(result.value), true);
		for (const method of ["analyze", "invalidate", "close"]) {
			assert.equal(method in result.value, false);
		}
	});

	it("parses each callable comment once across extraction and semantic analysis", async () => {
		const entrypoint = path.join(directory, "src/once.d.ts");
		writeFileSync(
			entrypoint,
			"/** Base content. @public */\nexport declare function base(): void;\n/** {@inheritDoc base} @public */\nexport declare function derived(): void;\n",
		);
		const parse = mock.method(TSDocParser.prototype, "parseString");
		try {
			const result = await analyzeAPIs({
				...configuration,
				entrypoints: [{ name: ".", path: entrypoint }],
			});
			assert.equal(result.ok, true, JSON.stringify(result));
			assert.equal(parse.mock.callCount(), 2);
			for (const name of ["public", "another"]) {
				assert.equal(
					result.value.generateReport(".", { name, releaseLevels: [ReleaseLevel.Public] }).ok,
					true,
				);
			}
			assert.equal(parse.mock.callCount(), 2);
		} finally {
			parse.mock.restore();
		}
	});

	it("applies inherited classification settings during eager analysis", async () => {
		writeFileSync(
			path.join(directory, "src/public.d.ts"),
			"/** A value. @partner */\nexport declare function value(): string;\n",
		);
		const settings = {
			packageName: "example",
			project: "tsconfig.json",
			entrypoints: [{ name: ".", path: "src/public.d.ts" }],
			customModifierTags: ["@partner"],
		};
		const missing = await analyzeAPIs(settings, directory);
		assert.equal(missing.ok, false);
		assert.equal(missing.diagnostics[0]?.code, DiagnosticCode.ClassificationReleaseMissing);
		const result = await analyzeAPIs(
			{ extends: [settings], rules: { requireReleaseLevel: false } },
			directory,
		);
		assert.equal(result.ok, true);
		assert.deepEqual(result.value.configuration.customModifierTags, ["@partner"]);
		assert.equal(Object.isFrozen(result.value.configuration.rules), true);
		const report = result.value.generateReport(
			".",
			{ name: "untagged", releaseLevels: [], includeUntagged: true },
			{ additionalTags: ["@partner"] },
		);
		assert.equal(report.ok, true);
		assert.equal(report.value.includes("@partner"), true);
	});

	it("rejects unexpected configuration errors through the promise", async () => {
		const error = new Error("Configuration access failed.");
		await assert.rejects(
			analyzeAPIs({
				get extends(): never {
					throw error;
				},
			}),
			(thrown: unknown) => thrown === error,
		);
	});

	it("returns configuration diagnostics before compiler extraction", async () => {
		const snapshot = mock.method(API.prototype, "updateSnapshot");
		try {
			const result = await analyzeAPIs({});
			assert.equal(result.ok, false);
			assert.equal(result.diagnostics[0]?.code, DiagnosticCode.ConfigurationRequired);
			assert.equal("value" in result, false);
			assert.equal(snapshot.mock.callCount(), 0);
		} finally {
			snapshot.mock.restore();
		}
	});

	it("disposes owned adapters for success, diagnostics, and exceptions", () => {
		const facts: AnalysisFacts = {
			packageName: "example",
			compilerVersion: "test",
			surfaces: [],
			declarations: [],
		};
		for (const result of [
			{ ok: true, value: facts } as const,
			reportFailure(DiagnosticCode.CompilerDiagnostics, "Invalid compiler input."),
		]) {
			let disposed = false;
			assert.strictEqual(
				analyzeDeclarations(configuration, {
					analyze: () => result,
					close: () => {
						disposed = true;
					},
				}),
				result,
			);
			assert.equal(disposed, true);
		}
		const error = new assert.AssertionError({ message: "Extraction invariant failed." });
		let closed = false;
		assert.throws(
			() =>
				analyzeDeclarations(configuration, {
					analyze: () => {
						throw error;
					},
					close: () => {
						closed = true;
					},
				}),
			(thrown: unknown) => thrown === error,
		);
		assert.equal(closed, true);
		const cleanupError = new Error("Compiler cleanup failed.");
		assert.throws(
			() =>
				analyzeDeclarations(configuration, {
					analyze: () => {
						throw error;
					},
					close: () => {
						throw cleanupError;
					},
				}),
			{
				name: "AggregateError",
				message: "Analysis and compiler cleanup failed.",
				errors: [error, cleanupError],
				cause: error,
			},
		);
		assert.throws(
			() =>
				analyzeDeclarations(configuration, {
					analyze: () => ({ ok: true, value: facts }),
					close: () => {
						throw cleanupError;
					},
				}),
			(thrown: unknown) => thrown === cleanupError,
		);
	});

	// Design feature: F3. Only an absent TSDoc comment permits automatic inheritance.
	it("distinguishes absent and empty signature comments without including declaration text", () => {
		cpSync(
			new URL("../../src/test/fixtures/session/comments.ts", import.meta.url),
			path.join(directory, "src/comments.ts"),
		);
		const result = adapter.analyze({
			...configuration,
			entrypoints: [{ name: ".", path: path.join(directory, "src/comments.ts") }],
		});
		assert(result.ok, JSON.stringify(result));
		for (const [name, expected] of [
			["absent", undefined],
			["empty", "/** */"],
			["ordinary", undefined],
			["documented", "/** Documented. @public */"],
		] as const) {
			const declaration: DeclarationFact | undefined = result.value.declarations.find(
				(item) => item.name === name,
			);
			const signature: SignatureFact | undefined = declaration?.signatures[0];
			assert(signature !== undefined);
			assert.equal(signature.documentation, expected, name);
			assert.equal(declaration?.declarations[0]?.text.includes(`function ${name}`), true);
		}
	});

	// Design requirements: W6, W11.
	it("reuses completed analysis for reports after inputs are removed", async () => {
		const entrypoint = path.join(directory, "src/public.d.ts");
		writeFileSync(
			entrypoint,
			"/** Converts a value. @public */\nexport declare function convert(value: string): string;\n",
		);
		const result = await analyzeAPIs({
			...configuration,
			entrypoints: [{ name: ".", path: entrypoint }],
		});
		assert.equal(result.ok, true);
		const selection = { name: "public", releaseLevels: [ReleaseLevel.Public] };
		const first = result.value.generateReport(".", selection);
		assert.equal(first.ok, true);
		assert.equal(first.value.includes("convert(value: string): string;"), true);
		const statistics = result.value.getStatistics();
		assert.deepEqual(statistics, { entrypoints: 1, declarations: 1, signatures: 1 });
		rmSync(entrypoint);
		const parse = mock.method(TSDocParser.prototype, "parseString");
		const snapshot = mock.method(API.prototype, "updateSnapshot");
		try {
			assert.equal(
				result.value.generateReport(".", { name: "empty", releaseLevels: [] }).ok,
				true,
			);
			assert.deepEqual(result.value.generateReport(".", selection), first);
			assert.equal(parse.mock.callCount(), 0);
			assert.equal(snapshot.mock.callCount(), 0);
		} finally {
			parse.mock.restore();
			snapshot.mock.restore();
		}
		assert.deepEqual(result.value.getStatistics(), statistics);
		assert.equal(result.value.generateReport("missing", selection).ok, false);
		assert.equal(result.value.generateReport(".", { ...selection, name: " " }).ok, false);
	});

	// Design regressions: B1, B2.
	it("preserves alias identity and transitive type-only export paths", () => {
		const result = adapter.analyze(configuration);
		assert(result.ok, JSON.stringify(result));
		assert.equal(Object.isFrozen(result.value.declarations), true);
		assert.equal(Object.isFrozen(result.value.surfaces[0]?.exports), true);
		const serialized = JSON.stringify(result.value);
		assert.equal(JSON.stringify(JSON.parse(serialized)), serialized);
		const root = result.value.surfaces.find((surface) => surface.name === ".");
		const chain = result.value.surfaces.find((surface) => surface.name === "./chain");
		assert(root !== undefined && chain !== undefined);
		const publicAlias = root.exports.find((item) => item.name === "PublicIdentity");
		const typeAlias = root.exports.find((item) => item.name === "TypeIdentity");
		assert(publicAlias !== undefined && typeAlias !== undefined);
		assert.equal(publicAlias.target, typeAlias.target);
		assert.equal(publicAlias.typeOnly, false);
		assert.equal(typeAlias.typeOnly, true);
		assert.equal(chain.exports.find((item) => item.name === "Renamed")?.typeOnly, true);
		assert.equal(chain.exports.find((item) => item.name === "Identity")?.typeOnly, true);
		assert.equal(chain.exports.find((item) => item.name === "Merged")?.typeOnly, false);
		assert(root.exports.some((item) => item.name === "ApiNamespace"));
		assert(
			result.value.declarations.some(
				(item) =>
					item.name === "Merged" &&
					item.declarations.length === 2 &&
					item.exports.some((child) => child.name === "label"),
			),
		);
	});

	// Design features: F1, F4.
	it("retains effective members and individual callable signatures", () => {
		const result = adapter.analyze(configuration);
		assert(result.ok, JSON.stringify(result));
		const derived = result.value.declarations.find((item) => item.name === "Derived");
		assert.equal(derived?.members.find((member) => member.name === "value")?.type, "string");
		const frozen = result.value.declarations.find((item) => item.name === "Frozen");
		assert.equal(frozen?.members.find((member) => member.name === "value")?.readonly, true);
		assert.equal(frozen?.members.find((member) => member.name === "optional")?.optional, true);
		const overloads = result.value.declarations.find(
			(item) => item.name === "convert",
		)?.signatures;
		assert.equal(overloads?.length, 2);
		assert.equal(new Set(overloads?.map((signature) => signature.id)).size, 2);
		assert.equal(
			overloads?.some((signature) => signature.documentation?.includes("@internal") === true),
			true,
		);
		assert.equal(
			overloads?.some((signature) => signature.documentation?.includes("@public") === true),
			true,
		);
		assert.equal(
			derived?.members.every((member) => member.declarations.length > 0),
			true,
		);
	});

	// Design feature: F1.
	it("marks deferred expansion with an actionable limitation", () => {
		const result = adapter.analyze(configuration);
		assert(result.ok);
		const deferred = result.value.declarations.find((item) => item.name === "Deferred");
		assert.equal(deferred?.memberView, "partial");
		assert.match(deferred?.limitations[0]?.message ?? "", /original declaration/);
		assert.match(deferred?.declarations[0]?.text ?? "", /Value extends string/);
	});

	// Design requirement: W6.
	it("observes changed inputs on each invocation without invalidation", async () => {
		const entrypoint = path.join(directory, "src/public.d.ts");
		const settings = { ...configuration, entrypoints: [{ name: ".", path: entrypoint }] };
		writeFileSync(
			entrypoint,
			"/** @public */\nexport declare function convert(value: string): string;\n",
		);
		const first = await analyzeAPIs(settings);
		assert.equal(first.ok, true);
		const selection = { name: "public", releaseLevels: [ReleaseLevel.Public] };
		const original = first.value.generateReport(".", selection);
		writeFileSync(
			entrypoint,
			"/** @public */\nexport declare function convert(value: number): number;\n",
		);
		const changed = await analyzeAPIs(settings);
		assert.equal(changed.ok, true);
		assert.notDeepEqual(changed.value.generateReport(".", selection), original);
		assert.deepEqual(first.value.generateReport(".", selection), original);
		writeFileSync(
			entrypoint,
			"/** {@inheritDoc missing} @public */\nexport declare function convert(value: number): number;\n",
		);
		const invalid = await analyzeAPIs(settings);
		assert.equal(invalid.ok, false);
		assert.equal(invalid.diagnostics[0]?.code, DiagnosticCode.DocumentationReference);
		assert.equal("value" in invalid, false);
	});

	// Design requirements: W4, W6.
	it("reports invalid projects before returning a completed analysis", async () => {
		const result = await analyzeAPIs({
			...configuration,
			project: path.join(directory, "missing.json"),
		});
		assert.equal(result.ok, false);
		if (!result.ok) {
			assert.equal(result.diagnostics[0]?.message.includes("missing.json"), true);
		}
		assert.equal("value" in result, false);
	});

	// Design requirement: W4.
	it("isolates browser and Node resolution and retains dependency origins", () => {
		const dependency = path.join(directory, "node_modules/dependency");
		cpSync(
			new URL("../../src/test/fixtures/session/dependency/", import.meta.url),
			dependency,
			{ recursive: true },
		);
		writeFileSync(
			path.join(dependency, "package.json"),
			JSON.stringify({
				name: "dependency",
				version: "1.0.0",
				type: "module",
				exports: { ".": { browser: "./browser.d.ts", default: "./node.d.ts" } },
			}),
		);
		cpSync(
			new URL("../../src/test/fixtures/session/environment.ts", import.meta.url),
			path.join(directory, "src/environment.ts"),
		);
		const browserProject = path.join(directory, "browser.json");
		writeFileSync(
			browserProject,
			JSON.stringify({
				extends: "./tsconfig.json",
				compilerOptions: { customConditions: ["browser"] },
			}),
		);
		const settings = {
			...configuration,
			entrypoints: [{ name: ".", path: path.join(directory, "src/environment.ts") }],
		};
		const outside = adapter.analyze(settings);
		assert(outside.ok);
		assert.equal(outside.value.declarations[0]?.memberView, "partial");
		assert.equal(
			outside.value.declarations[0]?.limitations[0]?.code,
			DiagnosticCode.MemberExpansionOutsideSuite,
		);
		assert.equal(outside.value.declarations[0]?.members.length, 0);
		const node = adapter.analyze(settings, undefined, ["dependency"]);
		const browser = adapter.analyze({ ...settings, project: browserProject }, undefined, [
			"dependency",
		]);
		assert(node.ok && browser.ok, JSON.stringify({ node, browser }));
		assert.equal(node.value.declarations[0]?.members[0]?.type, '"node"');
		assert.equal(browser.value.declarations[0]?.members[0]?.type, '"browser"');
		assert.equal(browser.value.declarations[0]?.declarations[0]?.packageName, "dependency");
		cpSync(
			new URL("../../src/test/fixtures/session/browser-updated.d.ts", import.meta.url),
			path.join(dependency, "browser.d.ts"),
		);
		adapter.close();
		adapter = createNativeAdapter();
		const updated = adapter.analyze({ ...settings, project: browserProject }, undefined, [
			"dependency",
		]);
		assert(updated.ok);
		assert.equal(updated.value.declarations[0]?.members[0]?.type, '"updated"');
	});

	// Design requirement: W4.
	it("preserves identities across checkout relocation and overload reordering", () => {
		const first = adapter.analyze(configuration);
		assert(first.ok);
		const original = readFileSync(path.join(directory, "src/api.ts"), "utf8");

		// Move each overload with its comment. Only declaration order should change.
		writeFileSync(
			path.join(directory, "src/api.ts"),
			original.replace(
				"/** Public overload documentation. @public */\nexport function convert(value: string): string;\n/** Internal overload documentation. @internal */\nexport function convert(value: number): number;",
				"/** Internal overload documentation. @internal */\nexport function convert(value: number): number;\n/** Public overload documentation. @public */\nexport function convert(value: string): string;",
			),
		);
		adapter.close();
		adapter = createNativeAdapter();
		const reordered = adapter.analyze(configuration);
		assert(reordered.ok);
		const initialSignatures = first.value.declarations.find(
			(item) => item.name === "convert",
		)?.signatures;
		const reorderedSignatures = reordered.value.declarations.find(
			(item) => item.name === "convert",
		)?.signatures;
		assert.deepEqual(
			initialSignatures?.map((item) => item.id).sort(),
			reorderedSignatures?.map((item) => item.id).sort(),
		);
		const copy = mkdtempSync(path.join(tmpdir(), "api-analyzer-copy-"));
		const fresh = createNativeAdapter();
		try {
			// Change the checkout path without changing package-relative paths or source text.
			cpSync(directory, copy, { recursive: true });
			const moved = fresh.analyze({
				...configuration,
				packageRoot: copy,
				project: path.join(copy, "tsconfig.json"),
				entrypoints: configuration.entrypoints.map((entrypoint) => ({
					...entrypoint,
					path: path.join(copy, path.relative(directory, entrypoint.path)),
				})),
			});
			assert.deepEqual(moved, reordered);
		} finally {
			fresh.close();
			rmSync(copy, { recursive: true, force: true });
		}
	});
});

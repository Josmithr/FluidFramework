import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, it } from "mocha";
import { resolveConfiguration, type EffectiveConfiguration } from "../configuration.js";
import { createAnalysisSession } from "../session.js";
import { createNativeAdapter } from "../nativeAdapter.js";
import { DiagnosticCode } from "../result.js";
import type { DeclarationFact, SignatureFact } from "../facts.js";

describe("Analysis session", () => {
	let directory: string;
	let configuration: EffectiveConfiguration;
	let session: ReturnType<typeof createAnalysisSession>;
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
		assert.ok(result.ok);
		configuration = result.value;
		session = createAnalysisSession();
		adapter = createNativeAdapter();
	});
	afterEach(() => {
		session.close();
		adapter.close();
		rmSync(directory, { recursive: true, force: true });
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
		assert.ok(result.ok, JSON.stringify(result));
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
			assert.ok(signature);
			assert.equal(signature.documentation, expected, name);
			assert.equal(declaration?.declarations[0]?.text.includes(`function ${name}`), true);
		}
	});

	// Design requirements: W6, W11.
	it("keeps cached facts private across task order and policy changes", () => {
		const first = session.analyze(configuration);
		assert.ok(first.ok, JSON.stringify(first));
		assert.deepEqual(first, { ok: true, value: undefined });
		const second = session.analyze({
			...configuration,
			rules: { documentation: false },
			entrypoints: [...configuration.entrypoints].reverse(),
		});
		assert.ok(second.ok);
		assert.deepEqual(second, { ok: true, value: undefined });
		assert.deepEqual(session.getStatistics(), { analyses: 1, cacheHits: 1, generation: 0 });
		session.close();
		assert.equal(session.analyze(configuration).ok, false);
	});

	// Design regressions: B1, B2.
	it("preserves alias identity and transitive type-only export paths", () => {
		const result = adapter.analyze(configuration);
		assert.ok(result.ok, JSON.stringify(result));
		assert.equal(Object.isFrozen(result.value.declarations), true);
		assert.equal(Object.isFrozen(result.value.surfaces[0]?.exports), true);
		const serialized = JSON.stringify(result.value);
		assert.equal(JSON.stringify(JSON.parse(serialized)), serialized);
		const root = result.value.surfaces.find((surface) => surface.name === ".");
		const chain = result.value.surfaces.find((surface) => surface.name === "./chain");
		assert.ok(root && chain);
		const publicAlias = root.exports.find((item) => item.name === "PublicIdentity");
		const typeAlias = root.exports.find((item) => item.name === "TypeIdentity");
		assert.ok(publicAlias && typeAlias);
		assert.equal(publicAlias.target, typeAlias.target);
		assert.equal(publicAlias.typeOnly, false);
		assert.equal(typeAlias.typeOnly, true);
		assert.equal(chain.exports.find((item) => item.name === "Renamed")?.typeOnly, true);
		assert.equal(chain.exports.find((item) => item.name === "Identity")?.typeOnly, true);
		assert.equal(chain.exports.find((item) => item.name === "Merged")?.typeOnly, false);
		assert.ok(root.exports.some((item) => item.name === "ApiNamespace"));
		assert.ok(
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
		assert.ok(result.ok, JSON.stringify(result));
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
		assert.ok(result.ok);
		const deferred = result.value.declarations.find((item) => item.name === "Deferred");
		assert.equal(deferred?.memberView, "partial");
		assert.match(deferred?.limitations[0]?.message ?? "", /original declaration/);
		assert.match(deferred?.declarations[0]?.text ?? "", /Value extends string/);
	});

	// Design requirement: W6.
	it("invalidates dependency changes and agrees with a fresh session", () => {
		const first = session.analyze(configuration);
		assert.ok(first.ok, JSON.stringify(first));
		cpSync(
			new URL("../../src/test/fixtures/session/updated/", import.meta.url),
			path.join(directory, "src"),
			{ recursive: true },
		);
		session.invalidate();
		const changed = session.analyze(configuration);
		assert.ok(changed.ok, JSON.stringify(changed));
		assert.deepEqual(changed, { ok: true, value: undefined });
		// TODO (Stage 2 session outputs): Compare generated reports with a fresh session after this
		// valid dependency edit; completion status alone cannot detect stale successful output.
		const fresh = createAnalysisSession();
		try {
			assert.deepEqual(changed, fresh.analyze(configuration));
		} finally {
			fresh.close();
		}
		assert.equal(session.getStatistics().analyses, 2);
		assert.equal(session.getStatistics().generation, 1);
		const invalidSource = path.join(directory, "src/invalid.ts");
		writeFileSync(invalidSource, "export const invalid: string = 0;\n");
		assert.deepEqual(session.analyze(configuration), { ok: true, value: undefined });
		session.invalidate();
		const invalid = session.analyze(configuration);
		assert.equal(invalid.ok, false);
		assert.equal("value" in invalid, false);
		assert.equal(invalid.diagnostics[0]?.code, DiagnosticCode.CompilerDiagnostics);
		const freshInvalid = createAnalysisSession();
		try {
			assert.deepEqual(invalid, freshInvalid.analyze(configuration));
		} finally {
			freshInvalid.close();
		}
		assert.deepEqual(session.analyze(configuration), invalid);
		rmSync(invalidSource);
		session.invalidate();
		assert.deepEqual(session.analyze(configuration), { ok: true, value: undefined });
		assert.deepEqual(session.getStatistics(), { analyses: 5, cacheHits: 1, generation: 3 });
	});

	// Design requirements: W4, W6.
	it("reports invalid projects without caching partial success", () => {
		const result = session.analyze({
			...configuration,
			project: path.join(directory, "missing.json"),
		});
		assert.equal(result.ok, false);
		if (!result.ok) {
			assert.equal(result.diagnostics[0]?.message.includes("missing.json"), true);
		}
		assert.ok(session.analyze(configuration).ok);
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
		const node = adapter.analyze(settings);
		const browser = adapter.analyze({ ...settings, project: browserProject });
		assert.ok(node.ok && browser.ok, JSON.stringify({ node, browser }));
		assert.equal(node.value.declarations[0]?.members[0]?.type, '"node"');
		assert.equal(browser.value.declarations[0]?.members[0]?.type, '"browser"');
		assert.equal(browser.value.declarations[0]?.declarations[0]?.packageName, "dependency");
		cpSync(
			new URL("../../src/test/fixtures/session/browser-updated.d.ts", import.meta.url),
			path.join(dependency, "browser.d.ts"),
		);
		adapter.close();
		adapter = createNativeAdapter();
		const updated = adapter.analyze({ ...settings, project: browserProject });
		assert.ok(updated.ok);
		assert.equal(updated.value.declarations[0]?.members[0]?.type, '"updated"');
	});

	// Design requirement: W4.
	it("preserves identities across checkout relocation and overload reordering", () => {
		const first = adapter.analyze(configuration);
		assert.ok(first.ok);
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
		assert.ok(reordered.ok);
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

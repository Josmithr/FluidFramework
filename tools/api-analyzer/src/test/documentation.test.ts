import assert from "node:assert/strict";
import { TSDocParser } from "@microsoft/tsdoc";
import { describe, it } from "mocha";
import { bindDocumentationReferences } from "../documentation.js";
import {
	resolveDocumentation,
	classifyApiItems,
	DiagnosticCode,
	type DocumentationInput,
	type DocumentationReferenceBinding,
} from "../index.js";
import { assertSnapshot } from "./snapshotUtils.js";

function item(id: string, documentation: string | undefined): DocumentationInput {
	return { id, documentation, packageName: "example" };
}

function binding(source: string, target: string): DocumentationReferenceBinding {
	return { source, reference: target, target };
}

describe("Explicit documentation inheritance", () => {
	it("shares custom modifier configuration without inheriting target metadata", () => {
		const options = { customModifierTags: ["@sourceOnly", "@localOnly"] };
		const items = [
			item("base", "/** Summary. @internal @sourceOnly */"),
			item("derived", "/** {@inheritDoc base} @public @localOnly */"),
		];
		const before = JSON.stringify({ items, options });
		const classified = classifyApiItems(items, options);
		assert.equal(classified.ok, true);
		const result = resolveDocumentation(items, [binding("derived", "base")], options);
		assert.equal(result.ok, true);
		const derived = result.value.find((entry) => entry.id === "derived");
		assert(derived?.documentation !== undefined);
		assert(derived.documentation !== "");
		assert.equal(derived.documentation.includes("Summary."), true);
		assert.equal(derived.documentation.includes("@localOnly"), true);
		assert.equal(derived.documentation.includes("@sourceOnly"), false);
		assert.equal(derived.documentation.includes("@internal"), false);
		assert.deepEqual(derived.inheritedFrom, ["base"]);
		assert.deepEqual(classifyApiItems(items, options), classified);
		assert.equal(JSON.stringify({ items, options }), before);
		assert.equal(Object.isFrozen(options.customModifierTags), false);
		assert.equal(Object.isFrozen(result.value), true);
		const unconfigured = resolveDocumentation(items, [binding("derived", "base")]);
		assert.equal(unconfigured.ok, false);
		assert.equal(unconfigured.diagnostics[0]?.code, DiagnosticCode.DocumentationTsdoc);
	});

	it("rejects invalid custom modifier definitions consistently", () => {
		const facts = {
			packageName: "example",
			compilerVersion: "test",
			surfaces: [],
			declarations: [],
		};
		for (const customModifierTags of [
			["missingAt"],
			["@invalid-name"],
			["@partner", "@partner"],
			["@public"],
			["@remarks"],
		]) {
			const options = { customModifierTags };
			const before = JSON.stringify(options);
			for (const [result, code] of [
				[classifyApiItems([], options), DiagnosticCode.ClassificationConfiguration],
				[
					bindDocumentationReferences(facts, options),
					DiagnosticCode.DocumentationConfiguration,
				],
				[resolveDocumentation([], [], options), DiagnosticCode.DocumentationConfiguration],
			] as const) {
				assert.equal(result.ok, false);
				assert.equal(result.diagnostics[0]?.code, code);
				assert.equal("value" in result, false);
				assert.equal(Object.isFrozen(result.diagnostics), true);
			}
			assert.equal(JSON.stringify(options), before);
		}
	});

	it("keeps documentation syntax validation strict with custom modifiers", () => {
		const options = { customModifierTags: ["@partner"] };
		for (const documentation of ["/** @public @partner @unknown */", "/** {@link */"]) {
			const inputs = [item("base", documentation)];
			assert.equal(
				classifyApiItems(inputs, {
					...options,
					rules: { validateTsdocSyntax: false, requireReleaseLevel: false },
				}).ok,
				true,
			);
			const result = resolveDocumentation(inputs, [], options);
			assert.equal(result.ok, false);
			assert.equal(result.diagnostics[0]?.code, DiagnosticCode.DocumentationTsdoc);
		}
	});

	it("resolves direct inheritance against the shared compiler snapshot", () => {
		const result = resolveDocumentation(
			[
				item(
					"base",
					"/** Converts a value.\n * @param value - Input value.\n * @returns The input.\n * @internal\n */",
				),
				item("derived", "/** {@inheritDoc base} @public */"),
			],
			[binding("derived", "base")],
		);
		assert.equal(result.ok, true);
		const derived = result.value.find((entry) => entry.id === "derived");
		assert.ok(derived?.documentation !== undefined);
		assert.notEqual(derived.documentation, "");
		assertSnapshot(derived.documentation, "documentation.direct.txt");
		assert.deepEqual(derived.inheritedFrom, ["base"]);
	});

	it("resolves chains without inheriting release metadata or mutating inputs", () => {
		const items = [
			item("derived", "/** {@inheritDoc middle} @public */"),
			item(
				"base",
				"/** Converts a value.\n * @remarks Keeps the value.\n * @param value - Input value.\n * @typeParam Value - Value type.\n * @returns The input.\n * @internal\n */",
			),
			item("middle", "/** {@inheritDoc base} @beta */"),
		];
		const bindings = [binding("derived", "middle"), binding("middle", "base")];
		const before = JSON.stringify({ items, bindings });
		const result = resolveDocumentation(items, bindings);
		assert.equal(result.ok, true);
		assert.deepEqual(
			result.value.map((entry) => entry.id),
			["base", "derived", "middle"],
		);
		const derived = result.value.find((entry) => entry.id === "derived");
		assert.ok(derived?.documentation !== undefined);
		assert.notEqual(derived.documentation, "");
		assert.deepEqual(derived.inheritedFrom, ["middle", "base"]);
		assertSnapshot(derived.documentation, "documentation.chain.txt");
		assert.equal(derived.documentation.includes("Converts a value."), true);
		assert.equal(derived.documentation.includes("@remarks"), true);
		assert.equal(derived.documentation.includes("@param value"), true);
		assert.equal(derived.documentation.includes("@typeParam Value"), true);
		assert.equal(derived.documentation.includes("@returns"), true);
		assert.equal(derived.documentation.includes("@public"), true);
		assert.equal(derived.documentation.includes("@internal"), false);
		assert.equal(derived.documentation.includes("@beta"), false);
		assert.equal(derived.documentation.includes("@inheritDoc"), false);
		assert.equal(new TSDocParser().parseString(derived.documentation).log.messages.length, 0);
		assert.equal(JSON.stringify({ items, bindings }), before);
		assert.equal(Object.isFrozen(result.value), true);
		assert.equal(Object.isFrozen(derived.inheritedFrom), true);
		assert.deepEqual(
			resolveDocumentation([...items].reverse(), [...bindings].reverse()),
			result,
		);
	});

	it("preserves absent and empty local comments and does not invent inherited content", () => {
		for (const documentation of [undefined, "/** */", "/** @internal */"]) {
			const result = resolveDocumentation(
				[item("base", documentation), item("derived", "/** {@inheritDoc base} @public */")],
				[binding("derived", "base")],
			);
			assert.equal(result.ok, true);
			const base = result.value.find((entry) => entry.id === "base");
			assert.equal(base?.documentation === undefined, documentation === undefined);
			const derived = result.value.find((entry) => entry.id === "derived");
			assert.ok(derived?.documentation !== undefined);
			assert.notEqual(derived.documentation, "");
			assert.deepEqual(derived.inheritedFrom, ["base"]);
			assert.equal(derived.documentation.includes("@inheritDoc"), false);
			assert.equal(derived.documentation.includes("@internal"), false);
			assertSnapshot(derived.documentation, "documentation.empty.txt");
		}
	});

	it("fails closed for missing, ambiguous, stale, and cyclic bindings", () => {
		const items = [item("derived", "/** {@inheritDoc base} */"), item("base", "/** Base. */")];
		const cases: readonly (readonly DocumentationReferenceBinding[])[] = [
			[],
			[binding("derived", "base"), binding("derived", "base")],
			[{ source: "derived", reference: "base", target: "missing" }],
			[{ source: "derived", reference: "other", target: "base" }],
			[binding("derived", "base"), binding("missing", "base")],
			[binding("derived", "base"), binding("base", "derived")],
		];
		for (const bindings of cases) {
			const result = resolveDocumentation(items, bindings);
			assert.equal(result.ok, false);
			assert.equal(result.diagnostics[0]?.code, DiagnosticCode.DocumentationReference);
			assert.equal("value" in result, false);
			assert.equal(Object.isFrozen(result), true);
			assert.equal(Object.isFrozen(result.diagnostics), true);
		}
		for (const cyclic of [
			[item("base", "/** {@inheritDoc base} */")],
			[
				item("base", "/** {@inheritDoc derived} */"),
				item("derived", "/** {@inheritDoc base} */"),
			],
		]) {
			const result = resolveDocumentation(
				cyclic,
				cyclic.length === 1
					? [binding("base", "base")]
					: [binding("base", "derived"), binding("derived", "base")],
			);
			assert.equal(result.ok, false);
			assert.equal(result.diagnostics[0]?.code, DiagnosticCode.DocumentationCycle);
			assert.equal(result.diagnostics[0]?.message.includes("base"), true);
		}
	});

	it("retains local ancillary content without copying target-only blocks", () => {
		const result = resolveDocumentation(
			[
				item(
					"base",
					"/** Summary.\n * @example Target example.\n * @deprecated Target alternative.\n * @privateRemarks Private information.\n */",
				),
				item("derived", "/** {@inheritDoc base}\n * @example Local example.\n */"),
			],
			[binding("derived", "base")],
		);
		assert.equal(result.ok, true);
		const derived = result.value.find((entry) => entry.id === "derived");
		assert.ok(derived?.documentation !== undefined);
		assert.notEqual(derived.documentation, "");
		assert.equal(derived.documentation.includes("Summary."), true);
		assert.equal(derived.documentation.includes("Local example."), true);
		assertSnapshot(derived.documentation, "documentation.local-blocks.txt");
		assert.equal(derived.documentation.includes("Target example."), false);
		assert.equal(derived.documentation.includes("Target alternative."), false);
		assert.equal(derived.documentation.includes("Private information."), false);
	});

	it("rejects unsupported semantic scope while retaining URL links", () => {
		for (const documentation of [
			"/** {@link base} */",
			"/** {@inheritDoc other#base} */",
			"/** {@inheritDoc} */",
			"/** {@link */",
		]) {
			assert.equal(resolveDocumentation([item("derived", documentation)], []).ok, false);
		}
		const result = resolveDocumentation(
			[item("base", "/** See {@link https://example.com}. */")],
			[],
		);
		assert.equal(result.ok, true);
		assert.equal(result.value[0]?.documentation?.includes("https://example.com"), true);
		assert.equal(
			resolveDocumentation([item("base", undefined), item("base", undefined)], []).ok,
			false,
		);
		assert.equal(
			resolveDocumentation(
				[
					item("derived", "/** {@inheritDoc base} */"),
					{ ...item("base", "/** Base. */"), packageName: "other" },
				],
				[binding("derived", "base")],
			).ok,
			false,
		);
	});
});

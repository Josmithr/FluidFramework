import assert from "node:assert/strict";
import { TSDocParser } from "@microsoft/tsdoc";
import { describe, it } from "mocha";
import { bindDocumentationLinks, bindDocumentationReferences } from "../documentation.js";
import type {
	AnalysisFacts,
	DeclarationFact,
	DocumentationReferenceLookup,
} from "../facts.js";
import {
	resolveDocumentation,
	classifyApiItems,
	selectApiItems,
	ReleaseLevel,
	DiagnosticCode,
	type DocumentationInput,
	type DocumentationReferenceBinding,
} from "../index.js";
import { assertSnapshot } from "./snapshotUtils.js";

/**
 * Creates a documentation input in the shared example package.
 *
 * @param id - The item identifier.
 * @param documentation - The local comment, or `undefined` when absent.
 * @returns A documentation input for resolver tests.
 */
function item(id: string, documentation: string | undefined): DocumentationInput {
	return { id, documentation, packageName: "example" };
}

/**
 * Creates an inheritance binding whose reference text matches the target identifier.
 *
 * @param source - The identifier of the item requesting inheritance.
 * @param target - The target identifier and reference text.
 * @returns An explicit inheritance binding for resolver tests.
 */
function binding(source: string, target: string): DocumentationReferenceBinding {
	return { source, reference: target, target };
}

/**
 * Creates a synthetic standalone function with one parameter-less signature.
 *
 * @param id - The declaration identifier and name. The signature identifier appends `-signature`.
 * @param documentation - The original signature comment.
 * @param links - Lookup results in API link traversal order.
 * @returns Mutable declaration facts with a fixed origin in the example package.
 */
function functionFact(
	id: string,
	documentation: string,
	links: readonly DocumentationReferenceLookup[],
): DeclarationFact {
	const origin = { packageName: "example", file: "original.d.ts", start: 0 };
	return {
		id,
		name: id,
		declarations: [{ ...origin, kind: "FunctionDeclaration", text: "", documentation }],
		type: "",
		memberView: "complete",
		baseDeclarations: [],
		implementedDeclarations: [],
		limitations: [],
		members: [],
		exports: [],
		signatures: [
			{
				id: `${id}-signature`,
				documentation,
				callSignatureText: "(): void;",
				functionTypeText: "() => void",
				documentationContext: { origin, links, parameters: [], typeParameters: [] },
			},
		],
	};
}

/**
 * Wraps declarations in analysis facts for a distinct re-exporting package.
 *
 * @param declarations - The declarations to retain without copying or changing their origins.
 * @returns Analysis facts with no entrypoint surfaces, for detached link-binding tests.
 */
function linkFacts(declarations: readonly DeclarationFact[]): AnalysisFacts {
	return {
		packageName: "reexporting-package",
		compilerVersion: "test",
		surfaces: [],
		declarations,
	};
}

describe("Documentation link binding", () => {
	it("permits public-to-beta links independently of selection and preserves occurrences", () => {
		const facts: AnalysisFacts = {
			packageName: "reexporting-package",
			compilerVersion: "test",
			surfaces: [],
			declarations: [
				functionFact("source", "/** {@link target} {@link target | Again} @public */", [
					{ reference: "target", status: "resolved", target: "target" },
					{ reference: "target", status: "resolved", target: "target" },
				]),
				functionFact("target", "/** Target. @beta */", []),
			],
		};
		const classified = classifyApiItems(
			facts.declarations.flatMap((entry) => entry.signatures),
		);
		assert.equal(classified.ok, true);
		const selected = selectApiItems(classified.value, {
			name: "public",
			releaseLevels: [ReleaseLevel.Public],
		});
		assert.equal(selected.ok, true);
		assert.deepEqual(
			selected.value.items.map((entry) => entry.id),
			["source-signature"],
		);
		const before = JSON.stringify({ facts, classification: classified.value });
		const result = bindDocumentationLinks(facts, classified.value, {});
		assert.equal(result.ok, true);
		assert.deepEqual(
			result.value,
			[0, 1].map((linkIndex) => ({
				source: "source-signature",
				linkIndex,
				reference: "target",
				target: "target",
				targetSignature: "target-signature",
				origin: { packageName: "example", file: "original.d.ts", start: 0 },
			})),
		);
		assert.equal(JSON.stringify({ facts, classification: classified.value }), before);
		assert.equal(
			Object.isFrozen(facts.declarations[0]?.signatures[0]?.documentationContext?.origin),
			false,
		);
		assert.equal(Object.isFrozen(result.value), true);
		assert.equal(Object.isFrozen(result.value[0]?.origin), true);
	});

	it("enforces only the internal-target restriction across all release levels", () => {
		for (const sourceTag of ["public", "beta", "alpha", "internal"]) {
			for (const targetTag of ["public", "beta", "alpha", "internal"]) {
				const facts = linkFacts([
					functionFact("source", `/** {@link target} @${sourceTag} */`, [
						{ reference: "target", status: "resolved", target: "target" },
					]),
					functionFact("target", `/** Target. @${targetTag} */`, []),
				]);
				const classified = classifyApiItems(
					facts.declarations.flatMap((entry) => entry.signatures),
				);
				assert.equal(classified.ok, true);
				const result = bindDocumentationLinks(facts, classified.value, {});
				const permitted = sourceTag === "internal" || targetTag !== "internal";
				assert.equal(result.ok, permitted, `${sourceTag} to ${targetTag}`);
				if (!result.ok) {
					assert.equal(result.diagnostics[0]?.code, DiagnosticCode.DocumentationLinkPolicy);
					assert.equal("value" in result, false);
					assert.equal(Object.isFrozen(result.diagnostics[0]), true);
				}
			}
		}
	});

	it("validates self-links and mutual links without recursively binding targets", () => {
		const facts = linkFacts([
			functionFact("second", "/** {@link first} @public */", [
				{ reference: "first", status: "resolved", target: "first" },
			]),
			functionFact("first", "/** {@link first} @remarks {@link second} @beta */", [
				{ reference: "first", status: "resolved", target: "first" },
				{ reference: "second", status: "resolved", target: "second" },
			]),
		]);
		const classified = classifyApiItems(
			facts.declarations.flatMap((entry) => entry.signatures),
		);
		assert.equal(classified.ok, true);
		const result = bindDocumentationLinks(facts, classified.value, {});
		assert.equal(result.ok, true);
		assert.deepEqual(
			result.value.map(({ source, linkIndex, target }) => ({ source, linkIndex, target })),
			[
				{ source: "first-signature", linkIndex: 0, target: "first" },
				{ source: "first-signature", linkIndex: 1, target: "second" },
				{ source: "second-signature", linkIndex: 0, target: "first" },
			],
		);
		assert.deepEqual(
			bindDocumentationLinks(
				linkFacts([...facts.declarations].reverse()),
				classified.value,
				{},
			),
			result,
		);
		assert.deepEqual(
			bindDocumentationLinks(
				JSON.parse(JSON.stringify(facts)) as AnalysisFacts,
				classified.value,
				{},
			),
			result,
		);
	});

	it("rejects stale, missing, and unsupported lookups without partial bindings", () => {
		const target = functionFact("target", "/** Target. @beta */", []);
		const cases: readonly {
			documentation: string;
			links: readonly DocumentationReferenceLookup[];
			code: DiagnosticCode;
		}[] = [
			{
				documentation: "/** {@link target} @public */",
				links: [],
				code: DiagnosticCode.DocumentationReference,
			},
			{
				documentation: "/** No links. @public */",
				links: [{ reference: "target", status: "resolved", target: "target" }],
				code: DiagnosticCode.DocumentationReference,
			},
			{
				documentation: "/** {@link target} @public */",
				links: [{ reference: "other", status: "not-found" }],
				code: DiagnosticCode.DocumentationReference,
			},
			{
				documentation: "/** {@link target} @public */",
				links: [{ reference: "target", status: "not-found" }],
				code: DiagnosticCode.DocumentationReference,
			},
			{
				documentation: "/** {@link example#target} @public */",
				links: [{ reference: "example#target", status: "unsupported" }],
				code: DiagnosticCode.DocumentationUnsupported,
			},
			{
				documentation: "/** {@link (target:1)} @public */",
				links: [{ reference: "(target:1)", status: "unsupported" }],
				code: DiagnosticCode.DocumentationUnsupported,
			},
			{
				documentation: "/** {@link target} {@link missing} @public */",
				links: [
					{ reference: "target", status: "resolved", target: "target" },
					{ reference: "missing", status: "not-found" },
				],
				code: DiagnosticCode.DocumentationReference,
			},
			{
				documentation: "/** {@link target} {@link other} @public */",
				links: [
					{ reference: "other", status: "not-found" },
					{ reference: "target", status: "resolved", target: "target" },
				],
				code: DiagnosticCode.DocumentationReference,
			},
		];
		for (const entry of cases) {
			const facts = linkFacts([
				functionFact("source", entry.documentation, entry.links),
				target,
			]);
			const classified = classifyApiItems(
				facts.declarations.flatMap((declaration) => declaration.signatures),
			);
			assert.equal(classified.ok, true);
			const result = bindDocumentationLinks(facts, classified.value, {});
			assert.equal(result.ok, false);
			assert.equal(result.diagnostics[0]?.code, entry.code);
			assert.equal("value" in result, false);
		}
	});

	it("requires supported source and target context within the original package", () => {
		const source = functionFact("source", "/** {@link target} @public */", [
			{ reference: "target", status: "resolved", target: "target" },
		]);
		const target = functionFact("target", "/** Target. @beta */", []);
		const targetSignature = target.signatures[0];
		assert.ok(targetSignature?.documentationContext);
		const sourceSignature = source.signatures[0];
		assert.ok(sourceSignature);
		const { documentationContext: sourceContext, ...noSourceContext } = sourceSignature;
		assert.ok(sourceContext);
		const { documentationContext: targetContext, ...noTargetContext } = targetSignature;
		const variants: readonly (readonly DeclarationFact[])[] = [
			[{ ...source, signatures: [noSourceContext] }, target],
			[
				{
					...source,
					declarations: source.declarations.map((entry) => ({
						...entry,
						kind: "MethodDeclaration",
					})),
				},
				target,
			],
			[source, { ...target, signatures: [noTargetContext] }],
			[
				source,
				{
					...target,
					signatures: [targetSignature, { ...targetSignature, id: "second-overload" }],
				},
			],
			[
				source,
				{
					...target,
					declarations: target.declarations.map((entry) => ({
						...entry,
						kind: "VariableDeclaration",
					})),
				},
			],
			[source, { ...target, declarations: [] }],
			[
				source,
				{
					...target,
					declarations: target.declarations.map((entry) => ({
						...entry,
						packageName: "dependency",
					})),
					signatures: [
						{
							...targetSignature,
							documentationContext: {
								...targetContext,
								origin: { ...targetContext.origin, packageName: "dependency" },
							},
						},
					],
				},
			],
		];
		for (const declarations of variants) {
			const classified = classifyApiItems(declarations.flatMap((entry) => entry.signatures));
			assert.equal(classified.ok, true);
			const result = bindDocumentationLinks(linkFacts(declarations), classified.value, {});
			assert.equal(result.ok, false);
			assert.equal(result.diagnostics[0]?.code, DiagnosticCode.DocumentationUnsupported);
		}
	});

	it("requires original source and target metadata with explicit release levels", () => {
		const facts = linkFacts([
			functionFact("source", "/** {@link target} @public */", [
				{ reference: "target", status: "resolved", target: "target" },
			]),
			functionFact("target", "/** Target. @beta */", []),
		]);
		const classified = classifyApiItems(
			facts.declarations.flatMap((entry) => entry.signatures),
		);
		assert.equal(classified.ok, true);
		for (const id of ["source-signature", "target-signature"]) {
			for (const items of [
				classified.value.items.filter((entry) => entry.id !== id),
				classified.value.items.map((entry) =>
					entry.id === id ? { ...entry, releaseLevel: undefined } : entry,
				),
			]) {
				const result = bindDocumentationLinks(facts, { ...classified.value, items }, {});
				assert.equal(result.ok, false);
				assert.equal(result.diagnostics[0]?.code, DiagnosticCode.DocumentationConfiguration);
			}
		}
	});

	it("shares modifier configuration and validates syntax even without API links", () => {
		const options = { customModifierTags: ["@partner"] };
		const facts = linkFacts([
			functionFact("source", "/** {@link target} @public @partner */", [
				{ reference: "target", status: "resolved", target: "target" },
			]),
			functionFact("target", "/** Target. @beta */", []),
		]);
		const classified = classifyApiItems(
			facts.declarations.flatMap((entry) => entry.signatures),
			options,
		);
		assert.equal(classified.ok, true);
		assert.equal(bindDocumentationLinks(facts, classified.value, options).ok, true);
		const unconfigured = bindDocumentationLinks(facts, classified.value, {});
		assert.equal(unconfigured.ok, false);
		assert.equal(unconfigured.diagnostics[0]?.code, DiagnosticCode.DocumentationTsdoc);
		for (const documentation of ["/** {@link */", "/** @unknown */", "not a comment"]) {
			const result = bindDocumentationLinks(
				linkFacts([functionFact("source", documentation, [])]),
				classified.value,
				{},
			);
			assert.equal(result.ok, false);
			assert.equal(result.diagnostics[0]?.code, DiagnosticCode.DocumentationTsdoc);
		}
		const invalid = bindDocumentationLinks(facts, classified.value, {
			customModifierTags: ["@public"],
		});
		assert.equal(invalid.ok, false);
		assert.equal(invalid.diagnostics[0]?.code, DiagnosticCode.DocumentationConfiguration);
		const urls = linkFacts([
			functionFact("source", "/** {@link https://example.invalid | Website} */", []),
		]);
		assert.deepEqual(bindDocumentationLinks(urls, { items: [], modifierTags: [] }, {}), {
			ok: true,
			value: [],
		});
	});

	it("throws for broken fact identities and missing retained targets", () => {
		const source = functionFact("source", "/** {@link target} @public */", [
			{ reference: "target", status: "resolved", target: "target" },
		]);
		const target = functionFact("target", "/** Target. @beta */", []);
		const classified = classifyApiItems([...source.signatures, ...target.signatures]);
		assert.equal(classified.ok, true);
		assert.throws(
			() => bindDocumentationLinks(linkFacts([source]), classified.value, {}),
			/targets must be retained/,
		);
		assert.throws(
			() => bindDocumentationLinks(linkFacts([source, source, target]), classified.value, {}),
			/Declaration facts must have distinct/,
		);
		assert.throws(
			() =>
				bindDocumentationLinks(
					linkFacts([source, { ...target, signatures: source.signatures }]),
					classified.value,
					{},
				),
			/Signature facts must have distinct/,
		);
		assert.throws(
			() =>
				bindDocumentationLinks(
					linkFacts([source, target]),
					{
						...classified.value,
						items: [...classified.value.items, ...classified.value.items],
					},
					{},
				),
			/metadata must have distinct/,
		);
	});
});

describe("Explicit documentation inheritance", () => {
	it("preserves section link provenance through chains without copying target-only blocks", () => {
		const facts = linkFacts([
			functionFact(
				"base",
				"/** See {@link target}.\n * @remarks Details {@link target}.\n * @param value - Input {@link target}.\n * @typeParam Value - Type {@link target}.\n * @returns Output {@link target}.\n * @example Private {@link secret}.\n * @internal\n */",
				[
					// The five copied sections each contain a target link; the private example is not inherited.
					...[0, 1, 2, 3, 4].map(() => ({
						reference: "target",
						status: "resolved" as const,
						target: "target",
					})),
					{ reference: "secret", status: "resolved", target: "secret" },
				],
			),
			functionFact("middle", "/** {@inheritDoc base} @beta */", []),
			functionFact(
				"derived",
				"/** {@inheritDoc middle}\n * @example Local {@link target}.\n * @public\n */",
				// Identical reference text resolves differently in the local example and inherited sections.
				[{ reference: "target", status: "resolved", target: "local" }],
			),
			functionFact("target", "/** Original target. @beta */", []),
			functionFact("local", "/** Local target. @public */", []),
			functionFact("secret", "/** Private target. @internal */", []),
		]);
		const signatures = facts.declarations.flatMap((entry) => entry.signatures);
		const classification = classifyApiItems(signatures);
		assert.equal(classification.ok, true);
		const links = bindDocumentationLinks(facts, classification.value, {});
		assert.equal(links.ok, true);
		const inputs = signatures.map((signature) => item(signature.id, signature.documentation));
		const bindings = [
			{ source: "derived-signature", reference: "middle", target: "middle-signature" },
			{ source: "middle-signature", reference: "base", target: "base-signature" },
		];
		const options = {
			linkValidation: { bindings: links.value, classification: classification.value },
		};
		const before = JSON.stringify({ inputs, bindings, options });
		const result = resolveDocumentation(inputs, bindings, options);
		assert.equal(result.ok, true);
		const derived = result.value.find((entry) => entry.id === "derived-signature");
		assert.ok(derived?.documentation !== undefined);
		assert.notEqual(derived.documentation, "");
		assertSnapshot(derived.documentation, "documentation.inherited-sections.txt");
		assert.deepEqual(derived.inheritedFrom, ["middle-signature", "base-signature"]);
		// Effective traversal contains copied base links followed by the retained local example's link.
		assert.deepEqual(derived.links, [
			...links.value.filter(
				(link) => link.source === "base-signature" && link.reference === "target",
			),
			...links.value.filter((link) => link.source === "derived-signature"),
		]);
		assert.equal(derived.links.length, 6);
		assert.equal(
			derived.links.some((link) => link.target === "secret"),
			false,
		);
		assert.equal(derived.links[5]?.target, "local");
		// The index belongs to the original comment, even though this link is sixth in the effective comment.
		assert.equal(derived.links[5]?.linkIndex, 0);
		assert.equal(
			derived.links.every((link) => Object.isFrozen(link) && Object.isFrozen(link.origin)),
			true,
		);
		assert.equal(JSON.stringify({ inputs, bindings, options }), before);
		// Input order must not affect chain traversal or the order of links in resolved comments.
		assert.deepEqual(
			resolveDocumentation([...inputs].reverse(), [...bindings].reverse(), options),
			result,
		);
		const restored = JSON.parse(before) as {
			inputs: typeof inputs;
			bindings: typeof bindings;
			options: typeof options;
		};
		assert.deepEqual(
			resolveDocumentation(restored.inputs, restored.bindings, restored.options),
			result,
		);
		// JSON creates mutable inputs; freezing resolver output must not freeze caller-owned binding origins.
		assert.equal(Object.isFrozen(restored.options.linkValidation.bindings[0]?.origin), false);
		assert.deepEqual(classifyApiItems(signatures), classification);
	});

	it("rejects incomplete or stale link inputs and missing receiving metadata", () => {
		const facts = linkFacts([
			functionFact("base", "/** See {@link target}. @internal */", [
				{ reference: "target", status: "resolved", target: "target" },
			]),
			functionFact("derived", "/** {@inheritDoc base} @public */", []),
			functionFact("target", "/** Target. @beta */", []),
		]);
		const signatures = facts.declarations.flatMap((entry) => entry.signatures);
		const classification = classifyApiItems(signatures);
		assert.equal(classification.ok, true);
		const links = bindDocumentationLinks(facts, classification.value, {});
		assert.equal(links.ok, true);
		const link = links.value[0];
		assert.ok(link);
		const inputs = signatures.map((signature) => item(signature.id, signature.documentation));
		const bindings = [
			{ source: "derived-signature", reference: "base", target: "base-signature" },
		];
		// Alter one binding invariant at a time while keeping the comments and inheritance request valid.
		for (const invalidLinks of [
			[],
			[link, link],
			[{ ...link, reference: "stale" }],
			[{ ...link, linkIndex: 1 }],
			[{ ...link, linkIndex: -1 }],
			[{ ...link, linkIndex: 0.5 }],
			[{ ...link, source: "unknown" }],
			[{ ...link, targetSignature: "unknown" }],
			// The target comment contains no links, so this otherwise well-formed binding is unused.
			[link, { ...link, source: "target-signature" }],
		]) {
			const result = resolveDocumentation(inputs, bindings, {
				linkValidation: { bindings: invalidLinks, classification: classification.value },
			});
			assert.equal(result.ok, false);
			assert.equal(result.diagnostics[0]?.code, DiagnosticCode.DocumentationReference);
			assert.equal("value" in result, false);
		}
		// Check both absent metadata and an explicit missing release level for the author, receiver, and target.
		for (const id of ["base-signature", "derived-signature", "target-signature"]) {
			for (const items of [
				classification.value.items.filter((entry) => entry.id !== id),
				classification.value.items.map((entry) =>
					entry.id === id ? { ...entry, releaseLevel: undefined } : entry,
				),
			]) {
				const result = resolveDocumentation(inputs, bindings, {
					linkValidation: {
						bindings: links.value,
						classification: { ...classification.value, items },
					},
				});
				assert.equal(result.ok, false);
				assert.equal(result.diagnostics[0]?.code, DiagnosticCode.DocumentationConfiguration);
			}
		}
		const duplicate = resolveDocumentation(inputs, bindings, {
			linkValidation: {
				bindings: links.value,
				classification: {
					...classification.value,
					items: [...classification.value.items, ...classification.value.items],
				},
			},
		});
		assert.equal(duplicate.ok, false);
		assert.equal(duplicate.diagnostics[0]?.code, DiagnosticCode.DocumentationConfiguration);
		const origin = resolveDocumentation(inputs, bindings, {
			linkValidation: {
				bindings: [{ ...link, origin: { ...link.origin, packageName: "other" } }],
				classification: classification.value,
			},
		});
		assert.equal(origin.ok, false);
		assert.equal(origin.diagnostics[0]?.code, DiagnosticCode.DocumentationUnsupported);
		const crossPackage = resolveDocumentation(
			inputs.map((entry) =>
				entry.id === "target-signature" ? { ...entry, packageName: "other" } : entry,
			),
			bindings,
			{ linkValidation: { bindings: links.value, classification: classification.value } },
		);
		assert.equal(crossPackage.ok, false);
		assert.equal(crossPackage.diagnostics[0]?.code, DiagnosticCode.DocumentationUnsupported);
	});

	it("preserves inherited link origins and applies policy to the receiving API", () => {
		// The internal author may link to either target; only the public receiver rejects the internal target.
		for (const targetTag of ["beta", "internal"]) {
			const facts = linkFacts([
				functionFact("base", "/** See {@link target}. @internal */", [
					{ reference: "target", status: "resolved", target: "target" },
				]),
				functionFact("derived", "/** {@inheritDoc base} @public */", []),
				functionFact("target", `/** Target. @${targetTag} */`, []),
			]);
			const signatures = facts.declarations.flatMap((entry) => entry.signatures);
			const classification = classifyApiItems(signatures);
			assert.equal(classification.ok, true);
			const links = bindDocumentationLinks(facts, classification.value, {});
			assert.equal(links.ok, true);
			const inputs = signatures.map((signature) =>
				item(signature.id, signature.documentation),
			);
			const before = JSON.stringify({ inputs, classification, links });
			const result = resolveDocumentation(
				inputs,
				[
					{
						source: "derived-signature",
						reference: "base",
						target: "base-signature",
					},
				],
				{ linkValidation: { bindings: links.value, classification: classification.value } },
			);
			assert.equal(result.ok, targetTag === "beta");
			if (result.ok) {
				const derived = result.value.find((entry) => entry.id === "derived-signature");
				assert.ok(derived);
				assert.deepEqual(derived.links, links.value);
				assert.equal(derived.links[0]?.source, "base-signature");
				assert.equal(derived.links[0]?.origin.file, "original.d.ts");
				assert.equal(Object.isFrozen(derived.links), true);
				assert.ok(derived.documentation !== undefined);
				assert.notEqual(derived.documentation, "");
				assertSnapshot(derived.documentation, "documentation.inherited-link.txt");
			} else {
				assert.equal(result.diagnostics[0]?.code, DiagnosticCode.DocumentationLinkPolicy);
				assert.equal(result.diagnostics[0]?.message.includes("derived-signature"), true);
				assert.equal("value" in result, false);
			}
			assert.equal(JSON.stringify({ inputs, classification, links }), before);
		}
	});

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

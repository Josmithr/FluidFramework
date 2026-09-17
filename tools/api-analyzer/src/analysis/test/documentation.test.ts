import { documentationContext, analysisContext } from "../../test/contextUtils.js";
import { createAnalysisContext, createDocumentationContext } from "../documentationContext.js";
import assert from "node:assert/strict";
import { mock } from "node:test";
import { TSDocParser } from "@microsoft/tsdoc";
import { describe, it } from "mocha";
import { classifyApiItems } from "../classification.js";
import { selectApiItems, ReleaseLevel } from "../../analysis-types/classification.js";
import {
	bindDocumentationLinks,
	bindDocumentationReferences,
	resolveDocumentation,
} from "../documentation.js";
import type {
	DocumentationInput,
	DocumentationReferenceBinding,
	ResolvedDocumentation,
} from "../../analysis-types/documentation.js";
import type {
	AnalysisFacts,
	DeclarationFact,
	DocumentationReferenceLookup,
} from "../../analysis-types/facts.js";
import { DiagnosticCode } from "../../analysis-types/result.js";
import { assertAssertionError } from "../../test/assertionUtils.js";
import { assertSnapshot } from "../../test/snapshotUtils.js";

/**
 * Creates a documentation input in the shared example package.
 *
 * @param id - The item identifier.
 * @param documentation - The local comment, or `undefined` when absent.
 * @returns A documentation input for resolver tests.
 */
function documentationInput(
	id: string,
	documentation: string | undefined,
): DocumentationInput {
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
		heritage: [],
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
	it("reuses captured comments and parses only missing entries", () => {
		const inputs = [
			documentationInput(
				"captured",
				"/** See {@link target} and {@link https://example.com}. */",
			),
			documentationInput("target", "/** Target. */"),
		];
		const before = JSON.stringify(inputs);
		const captured = new TSDocParser().parseString(inputs[0]?.documentation ?? "");
		const parse = mock.method(TSDocParser.prototype, "parseString");
		try {
			const result = createDocumentationContext(
				inputs,
				{},
				DiagnosticCode.DocumentationConfiguration,
				new Map([["captured", captured]]),
			);
			assert.equal(result.ok, true);
			assert.equal(result.value.validation.ok, true);
			assert.equal(parse.mock.callCount(), 1);
			const item = result.value.items.get("captured");
			assert.ok(item);
			assert.strictEqual(item.parsed, captured);
			assert.equal(item.originalLinks.length, 1);
			assert.equal(item.originalLinks[0]?.codeDestination?.emitAsTsdoc(), "target");
			assert.equal(JSON.stringify(inputs), before);
		} finally {
			parse.mock.restore();
		}
	});

	it("rejects missing origin data at context creation", () => {
		for (const packageName of ["", " \t "]) {
			assertAssertionError(
				() =>
					createDocumentationContext([
						{ ...documentationInput("item", undefined), packageName },
					]),
				"Documentation inputs must retain non-blank originating package names.",
			);
		}
		const fact = functionFact("source", "/** @public */", []);
		const signature = fact.signatures[0];
		assert.ok(signature);
		const { documentationContext: originalContext, ...withoutContext } = signature;
		assert.ok(originalContext);
		assertAssertionError(
			() =>
				createAnalysisContext(
					linkFacts([{ ...fact, declarations: [], signatures: [withoutContext] }]),
				),
			"Signature facts must retain an original declaration location.",
		);
	});

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
			documentationContext(facts.declarations.flatMap((entry) => entry.signatures)),
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
		const result = bindDocumentationLinks(analysisContext(facts, {}));
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
					documentationContext(facts.declarations.flatMap((entry) => entry.signatures)),
				);
				assert.equal(classified.ok, true);
				const result = bindDocumentationLinks(analysisContext(facts, {}));
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
			documentationContext(facts.declarations.flatMap((entry) => entry.signatures)),
		);
		assert.equal(classified.ok, true);
		const result = bindDocumentationLinks(analysisContext(facts, {}));
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
				analysisContext(linkFacts([...facts.declarations].reverse()), {}),
			),
			result,
		);
		assert.deepEqual(
			bindDocumentationLinks(
				analysisContext(JSON.parse(JSON.stringify(facts)) as AnalysisFacts, {}),
			),
			result,
		);
	});

	it("rejects stale, missing, and unsupported lookups without partial bindings", () => {
		const target = functionFact("target", "/** Target. @beta */", []);
		const cases: readonly ({
			documentation: string;
			links: readonly DocumentationReferenceLookup[];
		} & ({ code: DiagnosticCode } | { code: "assertion"; message: string }))[] = [
			{
				documentation: "/** {@link target} @public */",
				links: [],
				code: "assertion",
				message: "API link lookup counts must match the original comment.",
			},
			{
				documentation: "/** No links. @public */",
				links: [{ reference: "target", status: "resolved", target: "target" }],
				code: "assertion",
				message: "API link lookup counts must match the original comment.",
			},
			{
				documentation: "/** {@link target} @public */",
				links: [{ reference: "other", status: "not-found" }],
				code: "assertion",
				message: "API link lookup references must match the original comment.",
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
				code: "assertion",
				message: "API link lookup references must match the original comment.",
			},
		];
		for (const entry of cases) {
			const facts = linkFacts([
				functionFact("source", entry.documentation, entry.links),
				target,
			]);
			const classified = classifyApiItems(
				documentationContext(
					facts.declarations.flatMap((declaration) => declaration.signatures),
				),
			);
			assert.equal(classified.ok, true);
			if (entry.code === "assertion") {
				assertAssertionError(
					() => bindDocumentationLinks(analysisContext(facts, {})),
					entry.message,
				);
				continue;
			}
			const result = bindDocumentationLinks(analysisContext(facts, {}));
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
		for (const [declarations, message] of [
			[
				[{ ...source, signatures: [noSourceContext] }, target],
				"Supported API link sources must retain documentation context.",
			],
			[
				[source, { ...target, signatures: [noTargetContext] }],
				"Supported API link targets must retain documentation context.",
			],
		] as const) {
			const classified = classifyApiItems(
				documentationContext(declarations.flatMap((entry) => entry.signatures)),
			);
			assert.equal(classified.ok, true);
			assertAssertionError(
				() => bindDocumentationLinks(analysisContext(linkFacts(declarations), {})),
				message,
			);
		}
		for (const kind of ["MethodDeclaration", "MethodSignature"]) {
			const facts = linkFacts([
				{ ...source, declarations: source.declarations.map((entry) => ({ ...entry, kind })) },
				target,
			]);
			const classification = classifyApiItems(
				documentationContext(facts.declarations.flatMap((entry) => entry.signatures)),
			);
			assert.equal(classification.ok, true);
			assert.equal(bindDocumentationLinks(analysisContext(facts, {})).ok, true, kind);
		}
		const variants: readonly (readonly DeclarationFact[])[] = [
			[
				{
					...source,
					declarations: source.declarations.map((entry) => ({
						...entry,
						kind: "PropertyDeclaration",
					})),
				},
				target,
			],
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
			const classified = classifyApiItems(
				documentationContext(declarations.flatMap((entry) => entry.signatures)),
			);
			assert.equal(classified.ok, true);
			const result = bindDocumentationLinks(analysisContext(linkFacts(declarations), {}));
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
			documentationContext(facts.declarations.flatMap((entry) => entry.signatures)),
		);
		assert.equal(classified.ok, true);
		for (const id of ["source-signature", "target-signature"]) {
			const untagged = {
				...facts,
				declarations: facts.declarations.map((declaration) => ({
					...declaration,
					signatures: declaration.signatures.map((signature) =>
						signature.id === id
							? {
									...signature,
									documentation: signature.documentation?.replace(/@public|@beta/g, ""),
								}
							: signature,
					),
				})),
			};
			const result = bindDocumentationLinks(analysisContext(untagged));
			assert.equal(result.ok, false);
			assert.equal(result.diagnostics[0]?.code, DiagnosticCode.DocumentationConfiguration);
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
			documentationContext(
				facts.declarations.flatMap((entry) => entry.signatures),
				options,
			),
		);
		assert.equal(classified.ok, true);
		assert.equal(bindDocumentationLinks(analysisContext(facts, options)).ok, true);
		const unconfigured = bindDocumentationLinks(analysisContext(facts, {}));
		assert.equal(unconfigured.ok, false);
		assert.equal(unconfigured.diagnostics[0]?.code, DiagnosticCode.DocumentationTsdoc);
		for (const documentation of ["/** {@link */", "/** @unknown */", "not a comment"]) {
			const result = bindDocumentationLinks(
				analysisContext(linkFacts([functionFact("source", documentation, [])]), {}),
			);
			assert.equal(result.ok, false);
			assert.equal(result.diagnostics[0]?.code, DiagnosticCode.DocumentationTsdoc);
		}
		const invalid = createAnalysisContext(facts, { customModifierTags: ["@public"] });
		assert.equal(invalid.ok, false);
		assert.equal(invalid.diagnostics[0]?.code, DiagnosticCode.ClassificationConfiguration);
		const urls = linkFacts([
			functionFact("source", "/** {@link https://example.invalid | Website} */", []),
		]);
		assert.deepEqual(bindDocumentationLinks(analysisContext(urls, {})), {
			ok: true,
			value: [],
		});
	});

	it("throws for broken fact identities and missing retained targets", () => {
		const source = functionFact("source", "/** {@link target} @public */", [
			{ reference: "target", status: "resolved", target: "target" },
		]);
		const target = functionFact("target", "/** Target. @beta */", []);
		const classified = classifyApiItems(
			documentationContext([...source.signatures, ...target.signatures]),
		);
		assert.equal(classified.ok, true);
		assertAssertionError(
			() => bindDocumentationLinks(analysisContext(linkFacts([source]), {})),
			"Documentation lookup targets must be retained in declaration facts.",
		);
		assertAssertionError(
			() => bindDocumentationLinks(analysisContext(linkFacts([source, source, target]), {})),
			"Declaration facts must have distinct identities.",
		);
		assertAssertionError(
			() =>
				bindDocumentationLinks(
					analysisContext(
						linkFacts([source, { ...target, signatures: source.signatures }]),
						{},
					),
				),
			"Documentation inputs must have distinct identities.",
		);
	});
});

describe("Explicit documentation inheritance", () => {
	it("preserves original block tags and classification while resolving parsed content", () => {
		const inputs = [
			documentationInput(
				"base",
				"/** Base summary.\n * @remarks Base remarks.\n * @deprecated Target only.\n * @internal\n */",
			),
			documentationInput(
				"derived",
				"/** {@inheritDoc base}\n * @example Local example.\n * @public\n */",
			),
		];
		const context = documentationContext(inputs);
		const original = classifyApiItems(context);
		assert.equal(original.ok, true);
		const receiver = context.items.get("derived");
		assert.ok(receiver);
		assert.deepEqual(receiver.originalBlockTags, ["@example"]);
		const result = resolveDocumentation(context, [binding("derived", "base")]);
		assert.equal(result.ok, true);
		assert.equal(receiver.parsed.docComment.emitAsTsdoc().includes("Base summary."), true);
		assert.equal(receiver.parsed.docComment.emitAsTsdoc().includes("Target only."), false);
		assert.deepEqual(receiver.originalBlockTags, ["@example"]);
		assert.equal(
			original.value.items.find((entry) => entry.id === "derived")?.releaseLevel,
			ReleaseLevel.Public,
		);
		assert.equal(receiver.documentation, inputs[1]?.documentation);
		const independent = documentationContext(inputs);
		assert.notStrictEqual(independent.items.get("derived")?.parsed, receiver.parsed);
		assert.equal(
			independent.items
				.get("derived")
				?.parsed.docComment.emitAsTsdoc()
				.includes("@inheritDoc"),
			true,
		);
	});

	it("requires a release tag on an inherited-link receiver even when untagged APIs are allowed", () => {
		const facts = linkFacts([
			functionFact("base", "/** See {@link target}. @internal */", [
				{ reference: "target", status: "resolved", target: "target" },
			]),
			functionFact("derived", "/** {@inheritDoc base} */", []),
			functionFact("target", "/** Target. @beta */", []),
		]);
		const context = analysisContext(facts);
		const links = bindDocumentationLinks(context);
		assert.equal(links.ok, true);
		const result = resolveDocumentation(
			context,
			[{ source: "derived-signature", reference: "base", target: "base-signature" }],
			{
				linkValidation: { bindings: links.value, metadata: context.metadata },
			},
		);
		assert.equal(result.ok, false);
		assert.equal(result.diagnostics[0]?.code, DiagnosticCode.DocumentationConfiguration);
	});

	it("resolves automatic chains while suppressing local comments and uncertain choices", () => {
		const inputs = [
			documentationInput("base", "/** Base content. @internal */"),
			documentationInput("other", "/** Other content. @beta */"),
			documentationInput("middle", undefined),
			documentationInput("derived", undefined),
			documentationInput("empty", "/** */"),
			documentationInput("tag", "/** @public */"),
			documentationInput("local", "/** Local content. @public */"),
			documentationInput("explicit", "/** {@inheritDoc other} @public */"),
			documentationInput("ambiguous", undefined),
			documentationInput("missing", undefined),
		];
		const automaticInheritance = [
			...["middle", "empty", "tag", "local", "explicit", "ambiguous"].map((source) => ({
				source,
				target: "base",
			})),
			{ source: "derived", target: "middle" },
			{ source: "derived", target: "middle" },
			{ source: "ambiguous", target: "other" },
		];
		const before = JSON.stringify({ inputs, automaticInheritance });
		const result = resolveDocumentation(
			documentationContext(inputs, {
				automaticInheritance,
			}),
			[binding("explicit", "other")],
			{
				automaticInheritance,
			},
		);
		assert.equal(result.ok, true);
		const derived = result.value.find((entry) => entry.id === "derived");
		assert.ok(derived);
		assert.equal(derived.documentation?.includes("Base content."), true);
		assert.equal(derived.documentation?.includes("@internal"), false);
		assert.deepEqual(derived.inheritedFrom, ["middle", "base"]);
		for (const id of ["empty", "tag", "local", "ambiguous", "missing"]) {
			const output: ResolvedDocumentation | undefined = result.value.find(
				(entry) => entry.id === id,
			);
			assert.ok(output);
			assert.deepEqual(output.inheritedFrom, []);
			assert.equal(output.documentation?.includes("Base content.") ?? false, false);
		}
		assert.equal(
			result.value.find((entry) => entry.id === "ambiguous")?.documentation,
			undefined,
		);
		assert.equal(
			result.value
				.find((entry) => entry.id === "explicit")
				?.documentation?.includes("Other content."),
			true,
		);
		assert.equal(Object.isFrozen(result.value), true);
		assert.equal(JSON.stringify({ inputs, automaticInheritance }), before);
		assert.deepEqual(
			resolveDocumentation(
				documentationContext([...inputs].reverse(), {
					automaticInheritance: [...automaticInheritance].reverse(),
				}),
				[binding("explicit", "other")],
				{
					automaticInheritance: [...automaticInheritance].reverse(),
				},
			),
			result,
		);
	});

	it("asserts invalid automatic binding identities and diagnoses cycles", () => {
		for (const [automaticInheritance, message] of [
			[[{ source: "receiver", target: "missing" }], "Automatic targets must exist."],
			[[{ source: "missing", target: "receiver" }], "Automatic sources must exist."],
			[
				[{ source: "receiver", target: "outside" }],
				"Automatic bindings must retain same-package source and target inputs.",
			],
		] as const) {
			assertAssertionError(
				() =>
					resolveDocumentation(
						documentationContext(
							[
								documentationInput("receiver", undefined),
								{ ...documentationInput("outside", undefined), packageName: "outside" },
							],
							{ automaticInheritance },
						),
						[],
						{ automaticInheritance },
					),
				message,
			);
		}
		const result = resolveDocumentation(
			documentationContext([documentationInput("receiver", undefined)], {
				automaticInheritance: [{ source: "receiver", target: "receiver" }],
			}),
			[],
			{
				automaticInheritance: [{ source: "receiver", target: "receiver" }],
			},
		);
		assert.equal(result.ok, false);
		assert.equal(result.diagnostics[0]?.code, DiagnosticCode.DocumentationCycle);
		assert.equal("value" in result, false);
	});

	it("validates automatically inherited links against original receiving metadata", () => {
		for (const targetTag of ["beta", "internal"]) {
			const facts = linkFacts([
				functionFact("base", "/** See {@link target}. @internal */", [
					{ reference: "target", status: "resolved", target: "target" },
				]),
				functionFact("derived", "/** @public */", []),
				functionFact("target", `/** Target. @${targetTag} */`, []),
			]);
			const signatures = facts.declarations.flatMap((entry) => entry.signatures);
			const classification = classifyApiItems(documentationContext(signatures));
			assert.equal(classification.ok, true);
			const links = bindDocumentationLinks(analysisContext(facts, {}));
			assert.equal(links.ok, true);
			const inputs = signatures.map((entry) =>
				documentationInput(
					entry.id,
					entry.id === "derived-signature" ? undefined : entry.documentation,
				),
			);
			const before = JSON.stringify({ inputs, classification, links });
			const result = resolveDocumentation(
				documentationContext(inputs, {
					automaticInheritance: [{ source: "derived-signature", target: "base-signature" }],
					linkValidation: {
						bindings: links.value,
						metadata: new Map(classification.value.items.map((item) => [item.id, item])),
					},
				}),
				[],
				{
					automaticInheritance: [{ source: "derived-signature", target: "base-signature" }],
					linkValidation: {
						bindings: links.value,
						metadata: new Map(classification.value.items.map((item) => [item.id, item])),
					},
				},
			);
			assert.equal(result.ok, targetTag === "beta");
			if (result.ok) {
				const derived = result.value.find((entry) => entry.id === "derived-signature");
				assert.ok(derived);
				assert.deepEqual(derived.links, links.value);
				assert.equal(derived.links[0]?.source, "base-signature");
				assert.equal(derived.links[0]?.origin.file, "original.d.ts");
				assert.equal(derived.documentation?.includes("@internal"), false);
			} else {
				assert.equal(result.diagnostics[0]?.code, DiagnosticCode.DocumentationLinkPolicy);
				assert.equal("value" in result, false);
			}
			assert.equal(JSON.stringify({ inputs, classification, links }), before);
		}
	});

	it("asserts missing or stale inheritance facts but diagnoses unsupported sources and references", () => {
		const receiver = functionFact("receiver", "/** {@inheritDoc base} @public */", []);
		const signature = receiver.signatures[0];
		assert.ok(signature);
		const { documentationContext: sourceContext, ...withoutContext } = signature;
		assert.ok(sourceContext);
		for (const [source, expectedMessage] of [
			[withoutContext, "Supported inheritance sources must retain documentation context."],
			[signature, "Inheritance requests must retain compiler lookup facts."],
		] as const) {
			assertAssertionError(
				() =>
					bindDocumentationReferences(
						analysisContext(linkFacts([{ ...receiver, signatures: [source] }]), {}),
					),
				expectedMessage,
			);
		}
		const unsupported = bindDocumentationReferences(
			analysisContext(
				linkFacts([
					{
						...receiver,
						declarations: receiver.declarations.map((source) => ({
							...source,
							kind: "VariableDeclaration",
						})),
						signatures: [withoutContext],
					},
				]),
				{},
			),
		);
		assert.equal(unsupported.ok, false);
		assert.equal(unsupported.diagnostics[0]?.code, DiagnosticCode.DocumentationUnsupported);
		for (const status of ["resolved", "unsupported", "not-found"] as const) {
			assertAssertionError(
				() =>
					bindDocumentationReferences(
						analysisContext(
							linkFacts([
								{
									...receiver,
									signatures: [
										{
											...signature,
											documentationContext: {
												...sourceContext,
												inheritance: { reference: "stale", status, target: "base" },
											},
										},
									],
								},
							]),
							{},
						),
					),
				"Inheritance lookup facts must match the original comment.",
			);
		}
		const result = bindDocumentationReferences(
			analysisContext(
				linkFacts([
					{
						...receiver,
						signatures: [
							{
								...signature,
								documentationContext: {
									...sourceContext,
									inheritance: { reference: "base", status: "unsupported" },
								},
							},
						],
					},
				]),
				{},
			),
		);
		assert.equal(result.ok, false);
		assert.equal("value" in result, false);
		assert.equal(result.diagnostics[0]?.code, DiagnosticCode.DocumentationUnsupported);
		const message = result.diagnostics[0]?.message ?? "";
		assert.match(message, /unsupported @inheritDoc reference "base"/);
		assert.equal(message.includes("{@inheritDoc base}"), true);
		assert.equal(message.includes("{@inheritDoc Base.method}"), true);
		assert.equal(message.includes("{@inheritDoc (base:2)}"), true);
		assert.equal(message.includes("{@inheritDoc Base.(method:2)}"), true);
		assert.match(message, /replace @inheritDoc with local documentation/);
	});

	it("selects numeric overload targets and validates the selected parameter shape", () => {
		const template = functionFact("target", "/** First. @public */", []);
		const first = template.signatures[0];
		assert.ok(first?.documentationContext);
		const second = { ...first, id: "second", documentation: "/** Second. @public */" };
		const target = { ...template, signatures: [first, second] };
		for (const [reference, expected] of [
			["(target:1)", first.id],
			["(target:2)", second.id],
			["(target:3)", undefined],
			["(target:9007199254740992)", undefined],
			["target", undefined],
		] as const) {
			const receiver = functionFact(
				"receiver",
				`/** {@inheritDoc ${reference}} @public */`,
				[],
			);
			const signature = receiver.signatures[0];
			assert.ok(signature?.documentationContext);
			const facts = linkFacts([
				target,
				{
					...receiver,
					signatures: [
						{
							...signature,
							documentationContext: {
								...signature.documentationContext,
								inheritance: { reference, status: "resolved", target: target.id },
							},
						},
					],
				},
			]);
			const before = JSON.stringify(facts);
			const bindings = bindDocumentationReferences(analysisContext(facts, {}));
			if (expected === undefined) {
				assert.equal(bindings.ok, false, reference);
				assert.equal(bindings.diagnostics[0]?.code, DiagnosticCode.DocumentationReference);
			} else {
				assert.equal(bindings.ok, true, reference);
				assert.equal(bindings.value[0]?.target, expected);
				const resolved = resolveDocumentation(
					documentationContext(
						facts.declarations.flatMap((entry) =>
							entry.signatures.map((candidateSignature) =>
								documentationInput(candidateSignature.id, candidateSignature.documentation),
							),
						),
						{},
					),
					bindings.value,
				);
				assert.equal(resolved.ok, true);
				assert.match(
					resolved.value.find((entry) => entry.id === signature.id)?.documentation ?? "",
					expected === first.id ? /First\./ : /Second\./,
				);
				const incompatible = {
					...target,
					signatures: [
						first,
						{
							...second,
							documentationContext: {
								...first.documentationContext,
								parameters: [{ name: "extra", optional: false, rest: false }],
							},
						},
					],
				};
				const checked = bindDocumentationReferences(
					analysisContext(
						{ ...facts, declarations: [incompatible, ...facts.declarations.slice(1)] },
						{},
					),
				);
				assert.equal(checked.ok, expected === first.id);
				const reordered = bindDocumentationReferences(
					analysisContext(
						{
							...facts,
							declarations: [
								{ ...target, signatures: [second, first] },
								...facts.declarations.slice(1),
							],
						},
						{},
					),
				);
				assert.equal(reordered.ok, true);
				assert.equal(reordered.value[0]?.target, expected === first.id ? second.id : first.id);
			}
			assert.equal(JSON.stringify(facts), before);
		}
	});

	it("rejects malformed and nonnumeric explicit inheritance selectors", () => {
		for (const reference of [
			"(target:0)",
			"(target:-1)",
			"(target:1.5)",
			"(target:function)",
		]) {
			const target = functionFact("target", "/** Target. @public */", []);
			const receiver = functionFact(
				"receiver",
				`/** {@inheritDoc ${reference}} @public */`,
				[],
			);
			const signature = receiver.signatures[0];
			assert.ok(signature?.documentationContext);
			const result = bindDocumentationReferences(
				analysisContext(
					linkFacts([
						target,
						{
							...receiver,
							signatures: [
								{
									...signature,
									documentationContext: {
										...signature.documentationContext,
										inheritance: { reference, status: "resolved", target: target.id },
									},
								},
							],
						},
					]),
					{},
				),
			);
			assert.equal(result.ok, false, reference);
			assert.equal("value" in result, false);
		}
	});

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
		const classification = classifyApiItems(documentationContext(signatures));
		assert.equal(classification.ok, true);
		const links = bindDocumentationLinks(analysisContext(facts, {}));
		assert.equal(links.ok, true);
		const inputs = signatures.map((signature) =>
			documentationInput(signature.id, signature.documentation),
		);
		const bindings = [
			{ source: "derived-signature", reference: "middle", target: "middle-signature" },
			{ source: "middle-signature", reference: "base", target: "base-signature" },
		];
		const options = {
			linkValidation: {
				bindings: links.value,
				metadata: new Map(classification.value.items.map((item) => [item.id, item])),
			},
		};
		const before = JSON.stringify({ inputs, bindings, options });
		const result = resolveDocumentation(
			documentationContext(inputs, options),
			bindings,
			options,
		);
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
			resolveDocumentation(
				documentationContext([...inputs].reverse(), options),
				[...bindings].reverse(),
				options,
			),
			result,
		);
		const restored = JSON.parse(before) as {
			inputs: typeof inputs;
			bindings: typeof bindings;
			options: typeof options;
		};
		// Only plain inputs and bindings are portable; the metadata index belongs to the owning analysis.
		const restoredOptions = {
			linkValidation: {
				bindings: restored.options.linkValidation.bindings,
				metadata: options.linkValidation.metadata,
			},
		};
		assert.deepEqual(
			resolveDocumentation(
				documentationContext(restored.inputs),
				restored.bindings,
				restoredOptions,
			),
			result,
		);
		// JSON creates mutable inputs; freezing resolver output must not freeze caller-owned binding origins.
		assert.equal(Object.isFrozen(restored.options.linkValidation.bindings[0]?.origin), false);
		assert.deepEqual(classifyApiItems(documentationContext(signatures)), classification);
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
			const classification = classifyApiItems(documentationContext(signatures));
			assert.equal(classification.ok, true);
			const links = bindDocumentationLinks(analysisContext(facts, {}));
			assert.equal(links.ok, true);
			const inputs = signatures.map((signature) =>
				documentationInput(signature.id, signature.documentation),
			);
			const before = JSON.stringify({ inputs, classification, links });
			const result = resolveDocumentation(
				documentationContext(inputs, {
					linkValidation: {
						bindings: links.value,
						metadata: new Map(classification.value.items.map((item) => [item.id, item])),
					},
				}),
				[
					{
						source: "derived-signature",
						reference: "base",
						target: "base-signature",
					},
				],
				{
					linkValidation: {
						bindings: links.value,
						metadata: new Map(classification.value.items.map((item) => [item.id, item])),
					},
				},
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
			documentationInput("base", "/** Summary. @internal @sourceOnly */"),
			documentationInput("derived", "/** {@inheritDoc base} @public @localOnly */"),
		];
		const before = JSON.stringify({ items, options });
		const classified = classifyApiItems(documentationContext(items, options));
		assert.equal(classified.ok, true);
		const result = resolveDocumentation(documentationContext(items, options), [
			binding("derived", "base"),
		]);
		assert.equal(result.ok, true);
		const derived = result.value.find((entry) => entry.id === "derived");
		assert(derived?.documentation !== undefined);
		assert(derived.documentation !== "");
		assert.equal(derived.documentation.includes("Summary."), true);
		assert.equal(derived.documentation.includes("@localOnly"), true);
		assert.equal(derived.documentation.includes("@sourceOnly"), false);
		assert.equal(derived.documentation.includes("@internal"), false);
		assert.deepEqual(derived.inheritedFrom, ["base"]);
		assert.deepEqual(classifyApiItems(documentationContext(items, options)), classified);
		assert.equal(JSON.stringify({ items, options }), before);
		assert.equal(Object.isFrozen(options.customModifierTags), false);
		assert.equal(Object.isFrozen(result.value), true);
		const unconfigured = resolveDocumentation(documentationContext(items, {}), [
			binding("derived", "base"),
		]);
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
				[createAnalysisContext(facts, options), DiagnosticCode.ClassificationConfiguration],
				[createDocumentationContext([], options), DiagnosticCode.DocumentationConfiguration],
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
			const inputs = [documentationInput("base", documentation)];
			assert.equal(
				classifyApiItems(
					documentationContext(inputs, {
						...options,
						rules: { validateTsdocSyntax: false, requireReleaseLevel: false },
					}),
				).ok,
				true,
			);
			const result = resolveDocumentation(documentationContext(inputs, options), []);
			assert.equal(result.ok, false);
			assert.equal(result.diagnostics[0]?.code, DiagnosticCode.DocumentationTsdoc);
		}
	});

	it("resolves direct inheritance against the shared compiler snapshot", () => {
		const result = resolveDocumentation(
			documentationContext(
				[
					documentationInput(
						"base",
						"/** Converts a value.\n * @param value - Input value.\n * @returns The input.\n * @internal\n */",
					),
					documentationInput("derived", "/** {@inheritDoc base} @public */"),
				],
				{},
			),
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
			documentationInput("derived", "/** {@inheritDoc middle} @public */"),
			documentationInput(
				"base",
				"/** Converts a value.\n * @remarks Keeps the value.\n * @param value - Input value.\n * @typeParam Value - Value type.\n * @returns The input.\n * @internal\n */",
			),
			documentationInput("middle", "/** {@inheritDoc base} @beta */"),
		];
		const bindings = [binding("derived", "middle"), binding("middle", "base")];
		const before = JSON.stringify({ items, bindings });
		const result = resolveDocumentation(documentationContext(items, {}), bindings);
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
			resolveDocumentation(
				documentationContext([...items].reverse(), {}),
				[...bindings].reverse(),
			),
			result,
		);
	});

	it("preserves absent and empty local comments and does not invent inherited content", () => {
		for (const documentation of [undefined, "/** */", "/** @internal */"]) {
			const result = resolveDocumentation(
				documentationContext(
					[
						documentationInput("base", documentation),
						documentationInput("derived", "/** {@inheritDoc base} @public */"),
					],
					{},
				),
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

	it("diagnoses explicit inheritance cycles", () => {
		for (const cyclic of [
			[documentationInput("base", "/** {@inheritDoc base} */")],
			[
				documentationInput("base", "/** {@inheritDoc derived} */"),
				documentationInput("derived", "/** {@inheritDoc base} */"),
			],
		]) {
			const result = resolveDocumentation(
				documentationContext(cyclic, {}),
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
			documentationContext(
				[
					documentationInput(
						"base",
						"/** Summary.\n * @example Target example.\n * @deprecated Target alternative.\n * @privateRemarks Private information.\n */",
					),
					documentationInput(
						"derived",
						"/** {@inheritDoc base}\n * @example Local example.\n */",
					),
				],
				{},
			),
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
		assertAssertionError(
			() =>
				resolveDocumentation(
					documentationContext([documentationInput("derived", "/** {@link base} */")], {}),
					[],
				),
			"Comments with API links must have original link validation inputs.",
		);
		for (const documentation of [
			"/** {@inheritDoc other#base} */",
			"/** {@inheritDoc} */",
			"/** {@link */",
		]) {
			assert.equal(
				resolveDocumentation(
					documentationContext([documentationInput("derived", documentation)], {}),
					[],
				).ok,
				false,
			);
		}
		const result = resolveDocumentation(
			documentationContext(
				[documentationInput("base", "/** See {@link https://example.com}. */")],
				{},
			),
			[],
		);
		assert.equal(result.ok, true);
		assert.equal(result.value[0]?.documentation?.includes("https://example.com"), true);
		assertAssertionError(
			() =>
				resolveDocumentation(
					documentationContext(
						[documentationInput("base", undefined), documentationInput("base", undefined)],
						{},
					),
					[],
				),
			"Documentation inputs must have distinct identities.",
		);
		assert.equal(
			resolveDocumentation(
				documentationContext(
					[
						documentationInput("derived", "/** {@inheritDoc base} */"),
						{ ...documentationInput("base", "/** Base. */"), packageName: "other" },
					],
					{},
				),
				[binding("derived", "base")],
			).ok,
			false,
		);
	});
});

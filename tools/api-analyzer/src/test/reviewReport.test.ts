import assert from "node:assert/strict";
import { describe, it } from "mocha";
import {
	classifyApiItems,
	createReviewReport,
	renderReviewReport,
	selectApiItems,
	ReleaseLevel,
	DiagnosticCode,
	type AnalysisFacts,
} from "../index.js";
import { assertSnapshot } from "./snapshotUtils.js";

const facts: AnalysisFacts = {
	packageName: "example",
	compilerVersion: "not-in-the-report",
	surfaces: [
		{
			name: ".",
			exports: [
				{ name: "convert", target: "convert-id", typeOnly: false },
				{ name: "alias", target: "convert-id", typeOnly: true },
			],
		},
	],
	declarations: [
		{
			id: "convert-id",
			name: "convert",
			declarations: [
				{
					packageName: "dependency",
					file: "api.d.ts",
					start: 100,
					kind: "FunctionDeclaration",
					text: "not-for-rendering",
					documentation: "/** @public @partner */",
				},
			],
			type: "not-for-rendering",
			memberView: "complete",
			baseDeclarations: [],
			implementedDeclarations: [],
			limitations: [],
			members: [],
			exports: [],
			signatures: [
				{
					id: "text",
					callSignatureText: "(value: string): string;",
					functionTypeText: "(value: string) => string",
					documentation: "/** @public @partner */",
				},
				{
					id: "number",
					callSignatureText: "(value: number): number;",
					functionTypeText: "(value: number) => number",
					documentation: "/** @internal */",
				},
			],
		},
	],
};

/**
 * Creates a public function inheriting from an unexported internal ancestor.
 *
 * @param documentation - The ancestor's original comment, or `undefined` when absent.
 * @returns Mutable facts with matching parameter context and a single exported receiver.
 */
function inheritanceReportFacts(documentation: string | undefined): AnalysisFacts {
	const template = facts.declarations[0];
	assert.ok(template);
	const signature = template.signatures[0];
	assert.ok(signature);
	const origin = { packageName: "example", file: "api.d.ts", start: 0 };
	const context = {
		origin,
		parameters: [{ name: "value", optional: false, rest: false }],
		typeParameters: [],
		links: [],
	};
	return {
		...facts,
		surfaces: [
			{ name: ".", exports: [{ name: "convert", target: "derived", typeOnly: false }] },
		],
		declarations: [
			{
				...template,
				id: "base",
				name: "base",
				declarations: [{ ...origin, kind: "FunctionDeclaration", text: "", documentation }],
				signatures: [
					{ ...signature, id: "base-signature", documentation, documentationContext: context },
				],
			},
			{
				...template,
				id: "derived",
				declarations: [
					{
						...origin,
						kind: "FunctionDeclaration",
						text: "",
						documentation: "/** {@inheritDoc base} @public */",
					},
				],
				signatures: [
					{
						...signature,
						id: "derived-signature",
						documentation: "/** {@inheritDoc base} @public */",
						documentationContext: {
							...context,
							inheritance: { reference: "base", status: "resolved", target: "base" },
						},
					},
				],
			},
		],
	};
}

describe("Review report generation", () => {
	it("reports effective inherited content without inheriting target metadata", () => {
		for (const [documentation, documented] of [
			["/** Converts a value. @deprecated Target only. @internal */", true],
			["/** @internal */", false],
			["/** */", false],
			[undefined, false],
		] as const) {
			const input = inheritanceReportFacts(documentation);
			const classification = classifyApiItems(
				input.declarations.flatMap((entry) => entry.signatures),
				{ rules: { requireReleaseLevel: false } },
			);
			assert.equal(classification.ok, true);
			const selection = selectApiItems(classification.value, {
				name: "public",
				releaseLevels: [ReleaseLevel.Public],
			});
			assert.equal(selection.ok, true);
			// The ancestor is not exported or selected, but still supplies the effective comment.
			assert.deepEqual(
				selection.value.items.map((entry) => entry.id),
				["derived-signature"],
			);
			const before = JSON.stringify({ input, classification, selection });
			const report = createReviewReport(input, ".", selection.value, {
				classification: classification.value,
			});
			assert.equal(report.ok, true);
			assert.equal(report.value.exports[0]?.signatures[0]?.documented, documented);
			assert.deepEqual(report.value.exports[0]?.signatures[0]?.modifierTags, ["@public"]);
			assertSnapshot(
				renderReviewReport(report.value, { additionalTags: ["@deprecated"] }),
				documented ? "functions.inherited.md" : "functions.inherited-empty.md",
			);
			assert.equal(JSON.stringify({ input, classification, selection }), before);
		}
	});

	it("validates inherited API links using full original classification", () => {
		const input = inheritanceReportFacts("/** See {@link base}. @beta @ancestorOnly */");
		const base = input.declarations[0];
		assert.ok(base);
		const signature = base.signatures[0];
		assert.ok(signature?.documentationContext);
		const linked: AnalysisFacts = {
			...input,
			declarations: [
				{
					...base,
					signatures: [
						{
							...signature,
							documentationContext: {
								...signature.documentationContext,
								links: [{ reference: "base", status: "resolved", target: "base" }],
							},
						},
					],
				},
				...input.declarations.slice(1),
			],
		};
		const options = { customModifierTags: ["@ancestorOnly"] };
		const classified = classifyApiItems(
			linked.declarations.flatMap((entry) => entry.signatures),
			options,
		);
		assert.equal(classified.ok, true);
		const selected = selectApiItems(classified.value, {
			name: "public",
			releaseLevels: [ReleaseLevel.Public],
		});
		assert.equal(selected.ok, true);
		const report = createReviewReport(linked, ".", selected.value, {
			...options,
			classification: classified.value,
		});
		assert.equal(report.ok, true);
		assert.equal(report.value.exports[0]?.signatures[0]?.documented, true);
		assert.deepEqual(report.value.exports[0]?.signatures[0]?.modifierTags, ["@public"]);
		assertSnapshot(
			renderReviewReport(report.value, { additionalTags: ["@ancestorOnly"] }),
			"functions.inherited.md",
		);
		// Selection excludes the beta target, but both original author and receiver metadata are still required.
		for (const id of ["base-signature", "derived-signature"]) {
			const result = createReviewReport(linked, ".", selected.value, {
				...options,
				classification: {
					...classified.value,
					items: classified.value.items.filter((entry) => entry.id !== id),
				},
			});
			assert.equal(result.ok, false);
			assert.equal(result.diagnostics[0]?.code, DiagnosticCode.DocumentationConfiguration);
		}
		// A modifier used only by an unselected ancestor still belongs to the parser vocabulary.
		const unconfigured = createReviewReport(linked, ".", selected.value, {
			classification: classified.value,
		});
		assert.equal(unconfigured.ok, false);
		assert.equal(unconfigured.diagnostics[0]?.code, DiagnosticCode.DocumentationTsdoc);
	});

	it("propagates documentation failures even when no signatures are selected", () => {
		const valid = inheritanceReportFacts("/** Base. @internal */");
		const base = valid.declarations[0];
		const derived = valid.declarations[1];
		assert.ok(base);
		assert.ok(derived);
		const baseSignature = base.signatures[0];
		const derivedSignature = derived.signatures[0];
		assert.ok(baseSignature?.documentationContext);
		assert.ok(derivedSignature?.documentationContext);
		const baseContext = baseSignature.documentationContext;
		const derivedContext = derivedSignature.documentationContext;
		const cases: readonly { name: string; input: AnalysisFacts; code: DiagnosticCode }[] = [
			{
				name: "missing inheritance target",
				input: {
					...valid,
					declarations: [
						base,
						{
							...derived,
							signatures: [
								{
									...derivedSignature,
									documentationContext: {
										...derivedContext,
										inheritance: { reference: "base", status: "not-found" },
									},
								},
							],
						},
					],
				},
				code: DiagnosticCode.DocumentationReference,
			},
			{
				name: "ambiguous overload target",
				input: {
					...valid,
					declarations: [
						{
							...base,
							signatures: [baseSignature, { ...baseSignature, id: "base-overload" }],
						},
						derived,
					],
				},
				code: DiagnosticCode.DocumentationReference,
			},
			{
				name: "inheritance cycle",
				input: {
					...valid,
					declarations: [
						{
							...base,
							signatures: [
								{
									...baseSignature,
									documentation: "/** {@inheritDoc derived} @internal */",
									documentationContext: {
										...baseContext,
										inheritance: {
											reference: "derived",
											status: "resolved",
											target: "derived",
										},
									},
								},
							],
						},
						derived,
					],
				},
				code: DiagnosticCode.DocumentationCycle,
			},
			{
				name: "missing API link",
				input: {
					...valid,
					declarations: [
						{
							...base,
							signatures: [
								{
									...baseSignature,
									documentation: "/** {@link missing} @internal */",
									documentationContext: {
										...baseContext,
										links: [{ reference: "missing", status: "not-found" }],
									},
								},
							],
						},
						derived,
					],
				},
				code: DiagnosticCode.DocumentationReference,
			},
			// The internal author's self-link is valid locally, but becomes invalid in the public receiver.
			{
				name: "inherited internal link",
				input: {
					...valid,
					declarations: [
						{
							...base,
							signatures: [
								{
									...baseSignature,
									documentation: "/** {@link base} @internal */",
									documentationContext: {
										...baseContext,
										links: [{ reference: "base", status: "resolved", target: "base" }],
									},
								},
							],
						},
						derived,
					],
				},
				code: DiagnosticCode.DocumentationLinkPolicy,
			},
			{
				name: "invalid unselected comment",
				input: {
					...valid,
					declarations: [
						{
							...base,
							signatures: [{ ...baseSignature, documentation: "/** @unknown @internal */" }],
						},
						derived,
					],
				},
				code: DiagnosticCode.DocumentationTsdoc,
			},
		];
		for (const { name, input, code } of cases) {
			// Classification may tolerate parser diagnostics; report validation must remain strict.
			const classified = classifyApiItems(
				input.declarations.flatMap((entry) => entry.signatures),
				{ rules: { validateTsdocSyntax: false } },
			);
			assert.equal(classified.ok, true);
			const selected = selectApiItems(classified.value, {
				name: "public",
				releaseLevels: [ReleaseLevel.Public],
			});
			assert.equal(selected.ok, true);
			const before = JSON.stringify(input);
			for (const items of [selected.value.items, []]) {
				const result = createReviewReport(
					input,
					".",
					{ ...selected.value, items },
					{ classification: classified.value },
				);
				assert.equal(result.ok, false, name);
				assert.equal(result.diagnostics[0]?.code, code, name);
				assert.equal("value" in result, false);
				assert.equal(Object.isFrozen(result.diagnostics), true);
			}
			assert.equal(JSON.stringify(input), before);
		}
	});

	// Design requirements: W1, W2, W4. Initial function-only report coverage.
	it("renders public and complete reports against checked-in snapshots", () => {
		const before = JSON.stringify(facts);
		const classification = classifyApiItems(
			facts.declarations.flatMap((item) => item.signatures),
			{
				customModifierTags: ["@partner"],
			},
		);
		assert.ok(classification.ok);
		const options = { classification: classification.value, customModifierTags: ["@partner"] };
		for (const [name, releaseLevels] of [
			["public", [ReleaseLevel.Public]],
			["complete", [ReleaseLevel.Public, ReleaseLevel.Internal]],
		] as const) {
			const selection = selectApiItems(classification.value, { name, releaseLevels });
			assert.ok(selection.ok);
			const result = createReviewReport(facts, ".", selection.value, options);
			assert.ok(result.ok);
			assertSnapshot(renderReviewReport(result.value), `functions.${name}.md`);
			assert.ok(Object.isFrozen(result.value.exports));
			if (name === "public") {
				assertSnapshot(
					renderReviewReport(result.value, {
						additionalTags: ["@partner"],
						includeUndocumentedNotice: false,
					}),
					"functions.configured.md",
				);
				const hidden = renderReviewReport(result.value, {
					includeReleaseTags: false,
					includeUndocumentedNotice: false,
				});
				assert.equal(hidden.includes("@public"), false);
				assert.equal(hidden.includes("@partner"), false);
				assert.equal(hidden.includes("undocumented"), false);
			}
			assert.equal(result.value.exports[0]?.name, "alias");
			assert.equal(result.value.exports[0]?.typeOnly, true);
			const reversed = {
				...facts,
				surfaces: facts.surfaces.map((surface) => ({
					...surface,
					exports: [...surface.exports].reverse(),
				})),
			};
			assert.deepEqual(createReviewReport(reversed, ".", selection.value, options), result);
			if (name === "complete") {
				const reordered = createReviewReport(
					{
						...facts,
						declarations: facts.declarations.map((item) => ({
							...item,
							signatures: [...item.signatures].reverse(),
						})),
					},
					".",
					selection.value,
					options,
				);
				assert.ok(reordered.ok);
				assert.notEqual(renderReviewReport(reordered.value), renderReviewReport(result.value));
				assert.deepEqual(
					reordered.value.exports[0]?.signatures.map((item) => item.releaseLevel),
					[ReleaseLevel.Internal, ReleaseLevel.Public],
				);
			}
			const changedSignature = createReviewReport(
				{
					...facts,
					declarations: facts.declarations.map((item) => ({
						...item,
						signatures: item.signatures.map((signature) => ({
							...signature,
							functionTypeText: "(value: boolean) => boolean",
							callSignatureText: "(value: boolean): boolean;",
						})),
					})),
				},
				".",
				selection.value,
				options,
			);
			assert.ok(changedSignature.ok);
			assert.notEqual(
				renderReviewReport(changedSignature.value),
				renderReviewReport(result.value),
			);
			const changedMetadata = createReviewReport(
				facts,
				".",
				{
					...selection.value,
					items: selection.value.items.map((item) => ({
						...item,
						releaseLevel: ReleaseLevel.Beta,
						modifierTags: ["@beta"],
					})),
				},
				options,
			);
			assert.ok(changedMetadata.ok);
			assert.notEqual(
				renderReviewReport(changedMetadata.value),
				renderReviewReport(result.value),
			);
			const changedExport = createReviewReport(
				{
					...facts,
					surfaces: facts.surfaces.map((surface) => ({
						...surface,
						exports: surface.exports.map((binding) => ({
							...binding,
							name: `${binding.name}Changed`,
							typeOnly: !binding.typeOnly,
						})),
					})),
				},
				".",
				selection.value,
				options,
			);
			assert.ok(changedExport.ok);
			assert.notEqual(
				renderReviewReport(changedExport.value),
				renderReviewReport(result.value),
			);
		}
		assert.equal(JSON.stringify(facts), before);
		assert.equal(Object.isFrozen(facts.declarations), false);
	});

	it("uses descriptive TSDoc content independently of displayed tags", () => {
		for (const [documentation, documented] of [
			[undefined, false],
			["/** */", false],
			["/** @public @sealed @input @legacy */", false],
			["/** Converts a value. @public */", true],
			["/** @public\n * @remarks Explains conversion. */", true],
			["/** @public\n * @param value - The input. */", true],
			["/** {@link https://example.com} @public */", true],
			["/** `code` @public */", true],
			["/** @public\n * @deprecated Use the replacement. */", true],
		] as const) {
			const input = {
				...facts,
				declarations: facts.declarations.map((item) => ({
					...item,
					signatures: item.signatures
						.slice(0, 1)
						.map((signature) => ({ ...signature, documentation })),
				})),
			};
			const classified = classifyApiItems(
				input.declarations.flatMap((item) => item.signatures),
				{ customModifierTags: ["@input", "@legacy"], rules: { requireReleaseLevel: false } },
			);
			assert.ok(classified.ok, JSON.stringify(classified));
			const selected = selectApiItems(classified.value, {
				name: "public",
				releaseLevels: [ReleaseLevel.Public],
				includeUntagged: true,
			});
			assert.ok(selected.ok);
			const report = createReviewReport(input, ".", selected.value, {
				classification: classified.value,
				customModifierTags: ["@input", "@legacy"],
			});
			assert.ok(report.ok);
			assert.equal(
				report.value.exports[0]?.signatures[0]?.documented,
				documented,
				documentation,
			);
			assert.equal(renderReviewReport(report.value).includes("(undocumented)"), !documented);
			const configured = renderReviewReport(report.value, {
				additionalTags: ["@sealed", "@input", "@legacy", "@deprecated"],
				includeUndocumentedNotice: false,
			});
			assert.equal(configured.includes("(undocumented)"), false);
			for (const tag of ["@sealed", "@input", "@legacy", "@deprecated"]) {
				assert.equal(renderReviewReport(report.value).includes(tag), false);
				assert.equal(configured.includes(tag), documentation?.includes(tag) ?? false);
			}
		}
	});

	it("does not export the implementation name for alias-only surfaces", () => {
		const classified = classifyApiItems(
			facts.declarations.flatMap((item) => item.signatures),
			{ customModifierTags: ["@partner"] },
		);
		assert.ok(classified.ok);
		const selected = selectApiItems(classified.value, {
			name: "public",
			releaseLevels: [ReleaseLevel.Public],
		});
		assert.ok(selected.ok);
		const input = {
			...facts,
			surfaces: facts.surfaces.map((surface) => ({
				...surface,
				exports: surface.exports.filter((binding) => binding.name === "alias"),
			})),
		};
		const report = createReviewReport(input, ".", selected.value, {
			classification: classified.value,
			customModifierTags: ["@partner"],
		});
		assert.ok(report.ok);
		assertSnapshot(renderReviewReport(report.value), "functions.alias-only.md");
	});

	it("distinguishes invalid requests, broken facts, and unsupported declarations", () => {
		const selection = { name: "public", items: [] };
		const classified = classifyApiItems(
			facts.declarations.flatMap((entry) => entry.signatures),
			{ customModifierTags: ["@partner"] },
		);
		assert.equal(classified.ok, true);
		const options = { classification: classified.value, customModifierTags: ["@partner"] };
		assert.equal(createReviewReport(facts, "missing", selection, options).ok, false);
		assert.equal(
			createReviewReport(facts, ".", { ...selection, name: " " }, options).ok,
			false,
		);
		assert.equal(
			createReviewReport(
				facts,
				".",
				{
					...selection,
					items: [{ id: "unknown", releaseLevel: undefined, modifierTags: [] }],
				},
				options,
			).ok,
			false,
		);
		assert.throws(
			() => createReviewReport({ ...facts, declarations: [] }, ".", selection, options),
			assert.AssertionError,
		);
		assert.throws(
			() =>
				createReviewReport(
					{
						...facts,
						declarations: facts.declarations.map((item) => ({
							...item,
							declarations: item.declarations.map((source) => ({
								...source,
								kind: "InterfaceDeclaration",
							})),
						})),
					},
					".",
					selection,
					options,
				),
			/not supported/,
		);
		const empty = createReviewReport(facts, ".", selection, options);
		assert.ok(empty.ok);
		assertSnapshot(renderReviewReport(empty.value), "functions.empty.md");
	});
});

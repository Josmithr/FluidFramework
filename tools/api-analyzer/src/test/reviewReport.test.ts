import { createTestAnalysisContext, getSuccessValue } from "./contextUtils.js";
import assert from "node:assert/strict";
import { TSDocParser } from "@microsoft/tsdoc";
import { describe, it } from "mocha";
import { ReleaseLevel, DiagnosticCode } from "../index.js";
import {
	createReviewReport,
	prepareReviewReport,
	renderReviewReport,
} from "../report-generation/reviewReport.js";
import type { AnalysisFacts } from "../analysis-types/facts.js";
import { assertSnapshot } from "./snapshotUtils.js";
import { completeAnalysis } from "../analysis/completeAnalysis.js";
import { mock } from "node:test";

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
			heritage: [],
			implementedDeclarations: [],
			limitations: [],
			members: [],
			exports: [],
			signatures: [
				{
					id: "text",
					callSignatureText: "(value: string): string;",
					functionTypeText: "(value: string) => string",
					reduced: {
						callSignatureText: "(value: string): string;",
						functionTypeText: "(value: string) => string",
					},
					normalized: {
						callSignatureText: "(value: string): string;",
						functionTypeText: "(value: string) => string",
					},
					documentation: "/** @public @partner */",
				},
				{
					id: "number",
					callSignatureText: "(value: number): number;",
					functionTypeText: "(value: number) => number",
					reduced: {
						callSignatureText: "(value: number): number;",
						functionTypeText: "(value: number) => number",
					},
					normalized: {
						callSignatureText: "(value: number): number;",
						functionTypeText: "(value: number) => number",
					},
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
function createInheritanceReportFacts(documentation: string | undefined): AnalysisFacts {
	const template = facts.declarations[0];
	assert(template !== undefined);
	const signature = template.signatures[0];
	assert(signature !== undefined);
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
	it("prepares reports from a completed graph without documentation processing", () => {
		const context = createTestAnalysisContext(
			createInheritanceReportFacts("/** Base content. @internal */"),
		);
		const graph = getSuccessValue(completeAnalysis(context));
		assert.equal(Object.isFrozen(graph), true);
		assert.equal(Object.isFrozen(graph.documentation), true);
		assert.equal(Object.isFrozen(graph.facts.declarations), true);

		// Copying completed data requires no compiler or parser objects and preserves report behavior.
		const detached = structuredClone(graph);
		assert.deepEqual(detached, graph);
		assert.equal(
			graph.documentation
				.find((item) => item.id === "derived-signature")
				?.documentation?.includes("Base content."),
			true,
		);
		const parse = mock.method(TSDocParser.prototype, "parseString");
		try {
			const prepared = prepareReviewReport(graph);
			assert.deepEqual(prepareReviewReport(detached), prepared);
			const report = createReviewReport(prepared, ".", {
				name: "public",
				releaseLevels: [ReleaseLevel.Public],
			});
			assert.equal(report.ok, true);
			assert.equal(report.value.exports[0]?.signatures[0]?.documented, true);
			assert.equal(parse.mock.callCount(), 0);
		} finally {
			parse.mock.restore();
		}
	});

	it("escapes report delimiters and gives unnamed aliased functions distinct local names", () => {
		const signature = {
			text: '(): "```";',
			documented: true,
			releaseLevel: ReleaseLevel.Public,
			modifierTags: ["@public"],
		};
		const first = {
			declarationId: "first",
			declarationName: "default",
			signatures: [signature],
		};
		const output = renderReviewReport({
			packageName: "example",
			surface: "`edge`",
			exports: [
				{ ...first, name: "apiFunction", typeOnly: false },
				{
					declarationId: "second",
					declarationName: "",
					signatures: [signature],
					name: "apiFunction_1",
					typeOnly: false,
				},
				{ ...first, name: "hyphen-name", typeOnly: true },
			],
		});
		assert.equal(output.includes('declare function apiFunction(): "```";'), true);
		assert.equal(output.includes('declare function apiFunction_1(): "```";'), true);
		assert.equal(output.includes('export type { apiFunction as "hyphen-name" };'), true);
		assert.equal(output.includes("export { apiFunction };"), true);
		assert.equal(output.includes("export { apiFunction_1 };"), true);
		assert.equal(output.includes('Surface: `` "`edge`" ``'), true);
		assert.equal(output.includes("````ts\n"), true);
		assert.equal(output.endsWith("\n````\n"), true);
	});

	it("detaches report records from mutable preparation state", () => {
		const input = createInheritanceReportFacts("/** Base content. @internal */");
		const context = createTestAnalysisContext(input);
		const prepared = prepareReviewReport(getSuccessValue(completeAnalysis(context)));
		const selection = { name: "public", releaseLevels: [ReleaseLevel.Public] };
		const before = createReviewReport(prepared, ".", selection);
		assert.equal(before.ok, true);
		const receiver = context.items.get("derived-signature");
		assert(receiver !== undefined);

		// Completed facts are frozen; later changes to private parser nodes cannot affect reports.
		receiver.parsed.docComment.summarySection = new TSDocParser().parseString(
			"/** */",
		).docComment.summarySection;
		assert.deepEqual(createReviewReport(prepared, ".", selection), before);
		const record = prepared.surfaces.get(".")?.exports[0];
		assert(record !== undefined);
		assert.equal(Object.isFrozen(record), true);
		assert.equal(Object.isFrozen(record.signatures[0]?.modifierTags), true);
	});

	it("validates fixed export identities during preparation", () => {
		const options = { customModifierTags: ["@partner"] };
		for (const [exports, message] of [
			[
				[{ name: "missing", target: "missing", typeOnly: false }],
				"Every export target must have a declaration fact.",
			],
			[
				[
					{ name: "alias", target: "convert-id", typeOnly: false },
					{ name: "alias", target: "convert-id", typeOnly: false },
				],
				"Entrypoint exports must have distinct names.",
			],
		] as const) {
			assert.throws(
				() =>
					prepareReviewReport(
						getSuccessValue(
							completeAnalysis(
								createTestAnalysisContext(
									{ ...facts, surfaces: [{ name: ".", exports }] },
									options,
								),
							),
						),
					),
				{ name: "AssertionError", message },
			);
		}
		assert.throws(
			() =>
				prepareReviewReport(
					getSuccessValue(
						completeAnalysis(
							createTestAnalysisContext(
								{ ...facts, surfaces: [...facts.surfaces, ...facts.surfaces] },
								options,
							),
						),
					),
				),
			{ name: "AssertionError", message: "Entrypoint facts must have distinct names." },
		);
	});

	it("reports effective inherited content without inheriting target metadata", () => {
		for (const [documentation, documented] of [
			["/** Converts a value. @deprecated Target only. @internal */", true],
			["/** @internal */", false],
			["/** */", false],
			[undefined, false],
		] as const) {
			const input = createInheritanceReportFacts(documentation);
			const before = JSON.stringify(input);
			const report = createReviewReport(
				prepareReviewReport(
					getSuccessValue(completeAnalysis(createTestAnalysisContext(input, {}))),
				),
				".",
				{
					name: "public",
					releaseLevels: [ReleaseLevel.Public],
				},
			);
			assert.equal(report.ok, true);
			assert.equal(report.value.exports[0]?.signatures[0]?.documented, documented);
			assert.deepEqual(report.value.exports[0]?.signatures[0]?.modifierTags, ["@public"]);
			assertSnapshot(
				renderReviewReport(report.value, { additionalTags: ["@deprecated"] }),
				documented ? "functions.inherited.md" : "functions.inherited-empty.md",
			);
			assert.equal(JSON.stringify(input), before);
		}
	});

	it("validates inherited API links using full original classification", () => {
		const input = createInheritanceReportFacts("/** See {@link base}. @beta @ancestorOnly */");
		const base = input.declarations[0];
		assert(base !== undefined);
		const signature = base.signatures[0];
		assert(signature?.documentationContext !== undefined);
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
		const report = createReviewReport(
			prepareReviewReport(
				getSuccessValue(completeAnalysis(createTestAnalysisContext(linked, { ...options }))),
			),
			".",
			{
				name: "public",
				releaseLevels: [ReleaseLevel.Public],
			},
		);
		assert.equal(report.ok, true);
		assert.equal(report.value.exports[0]?.signatures[0]?.documented, true);
		assert.deepEqual(report.value.exports[0]?.signatures[0]?.modifierTags, ["@public"]);
		assertSnapshot(
			renderReviewReport(report.value, { additionalTags: ["@ancestorOnly"] }),
			"functions.inherited.md",
		);

		// A modifier used only by an unselected ancestor still belongs to the parser vocabulary.
		const unconfigured = completeAnalysis(createTestAnalysisContext(linked));
		assert.equal(unconfigured.ok, false);
		assert.equal(unconfigured.diagnostics[0]?.code, DiagnosticCode.DocumentationTsdoc);
	});

	it("propagates documentation failures even when no signatures are selected", () => {
		const valid = createInheritanceReportFacts("/** Base. @internal */");
		const base = valid.declarations[0];
		const derived = valid.declarations[1];
		assert(base !== undefined);
		assert(derived !== undefined);
		const baseSignature = base.signatures[0];
		const derivedSignature = derived.signatures[0];
		assert(baseSignature?.documentationContext !== undefined);
		assert(derivedSignature?.documentationContext !== undefined);
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
			const before = JSON.stringify(input);
			{
				const result = completeAnalysis(createTestAnalysisContext(input));
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
		const options = { customModifierTags: ["@partner"] };
		const prepared = prepareReviewReport(
			getSuccessValue(completeAnalysis(createTestAnalysisContext(facts, options))),
		);
		for (const [name, releaseLevels] of [
			["public", [ReleaseLevel.Public]],
			["complete", [ReleaseLevel.Public, ReleaseLevel.Internal]],
		] as const) {
			const result = createReviewReport(prepared, ".", { name, releaseLevels });
			assert(result.ok);
			assertSnapshot(renderReviewReport(result.value), `functions.${name}.md`);
			assert(Object.isFrozen(result.value.exports));
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
			assert.deepEqual(
				createReviewReport(
					prepareReviewReport(
						getSuccessValue(completeAnalysis(createTestAnalysisContext(reversed, options))),
					),
					".",
					{ name, releaseLevels },
				),
				result,
			);
			if (name === "complete") {
				const reordered = createReviewReport(
					prepareReviewReport(
						getSuccessValue(
							completeAnalysis(
								createTestAnalysisContext(
									{
										...facts,
										declarations: facts.declarations.map((item) => ({
											...item,
											signatures: [...item.signatures].reverse(),
										})),
									},
									options,
								),
							),
						),
					),
					".",
					{ name, releaseLevels },
				);
				assert(reordered.ok);
				assert.notEqual(renderReviewReport(reordered.value), renderReviewReport(result.value));
				assert.deepEqual(
					reordered.value.exports[0]?.signatures.map((item) => item.releaseLevel),
					[ReleaseLevel.Internal, ReleaseLevel.Public],
				);
			}
			const changedSignature = createReviewReport(
				prepareReviewReport(
					getSuccessValue(
						completeAnalysis(
							createTestAnalysisContext(
								{
									...facts,
									declarations: facts.declarations.map((item) => ({
										...item,
										signatures: item.signatures.map((signature) => ({
											...signature,
											functionTypeText: "(value: boolean) => boolean",
											callSignatureText: "(value: boolean): boolean;",
											normalized: {
												callSignatureText: "(value: boolean): boolean;",
												functionTypeText: "(value: boolean) => boolean",
											},
										})),
									})),
								},
								options,
							),
						),
					),
				),
				".",
				{ name, releaseLevels },
			);
			assert(changedSignature.ok);
			assert.notEqual(
				renderReviewReport(changedSignature.value),
				renderReviewReport(result.value),
			);
			const changedMetadata = createReviewReport(
				prepareReviewReport(
					getSuccessValue(
						completeAnalysis(
							createTestAnalysisContext(
								{
									...facts,
									declarations: facts.declarations.map((declaration) => ({
										...declaration,
										signatures: declaration.signatures.map((signature) => ({
											...signature,
											documentation: signature.documentation?.replace(
												/@public|@internal/g,
												"@beta",
											),
										})),
									})),
								},
								options,
							),
						),
					),
				),
				".",
				{ name, releaseLevels: [ReleaseLevel.Beta] },
			);
			assert(changedMetadata.ok);
			assert.notEqual(
				renderReviewReport(changedMetadata.value),
				renderReviewReport(result.value),
			);
			const changedExport = createReviewReport(
				prepareReviewReport(
					getSuccessValue(
						completeAnalysis(
							createTestAnalysisContext(
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
								options,
							),
						),
					),
				),
				".",
				{ name, releaseLevels },
			);
			assert(changedExport.ok);
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
			["/** @public @sealed @override @input @legacy */", false],
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
			const report = createReviewReport(
				prepareReviewReport(
					getSuccessValue(
						completeAnalysis(
							createTestAnalysisContext(input, { customModifierTags: ["@input", "@legacy"] }),
						),
					),
				),
				".",
				{
					name: "public",
					releaseLevels: [ReleaseLevel.Public],
					includeUntagged: true,
				},
			);
			assert(report.ok);
			assert.equal(
				report.value.exports[0]?.signatures[0]?.documented,
				documented,
				documentation,
			);
			assert.equal(renderReviewReport(report.value).includes("(undocumented)"), !documented);
			const configured = renderReviewReport(report.value, {
				additionalTags: ["@sealed", "@override", "@input", "@legacy", "@deprecated"],
				includeUndocumentedNotice: false,
			});
			assert.equal(configured.includes("(undocumented)"), false);
			for (const tag of ["@sealed", "@override", "@input", "@legacy", "@deprecated"]) {
				const present = documentation?.includes(tag) ?? false;
				const defaultTag = ["@sealed", "@override", "@deprecated"].includes(tag);
				assert.equal(renderReviewReport(report.value).includes(tag), defaultTag && present);
				assert.equal(
					renderReviewReport(report.value, {}).includes(tag),
					defaultTag && present,
				);
				assert.equal(
					renderReviewReport(report.value, { includeReleaseTags: false }).includes(tag),
					defaultTag && present,
				);
				assert.equal(
					renderReviewReport(report.value, { additionalTags: [] }).includes(tag),
					false,
				);
				assert.equal(
					renderReviewReport(report.value, { additionalTags: ["@input"] }).includes(tag),
					tag === "@input" && present,
				);
				assert.equal(configured.includes(tag), documentation?.includes(tag) ?? false);
			}
		}
	});

	it("does not export the implementation name for alias-only surfaces", () => {
		const input = {
			...facts,
			surfaces: facts.surfaces.map((surface) => ({
				...surface,
				exports: surface.exports.filter((binding) => binding.name === "alias"),
			})),
		};
		const report = createReviewReport(
			prepareReviewReport(
				getSuccessValue(
					completeAnalysis(
						createTestAnalysisContext(input, { customModifierTags: ["@partner"] }),
					),
				),
			),
			".",
			{
				name: "public",
				releaseLevels: [ReleaseLevel.Public],
			},
		);
		assert(report.ok);
		assertSnapshot(renderReviewReport(report.value), "functions.alias-only.md");
	});

	it("distinguishes invalid requests, broken facts, and unsupported declarations", () => {
		const selection = { name: "public", releaseLevels: [] };
		const options = { customModifierTags: ["@partner"] };
		const prepared = prepareReviewReport(
			getSuccessValue(completeAnalysis(createTestAnalysisContext(facts, options))),
		);
		assert.equal(createReviewReport(prepared, "missing", selection).ok, false);
		const invalid = createReviewReport(prepared, ".", { ...selection, name: " " });
		assert.equal(invalid.ok, false);
		assert.equal(invalid.diagnostics[0]?.code, DiagnosticCode.SelectionConfiguration);
		assert.throws(
			() =>
				createReviewReport(
					prepareReviewReport(
						getSuccessValue(
							completeAnalysis(
								createTestAnalysisContext({ ...facts, declarations: [] }, options),
							),
						),
					),
					".",
					selection,
				),
			{ name: "AssertionError", message: "Every export target must have a declaration fact." },
		);
		assert.throws(
			() =>
				createReviewReport(
					prepareReviewReport(
						getSuccessValue(
							completeAnalysis(
								createTestAnalysisContext(
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
									options,
								),
							),
						),
					),
					".",
					selection,
				),
			/not supported/,
		);
		const empty = createReviewReport(prepared, ".", selection);
		assert(empty.ok);
		assertSnapshot(renderReviewReport(empty.value), "functions.empty.md");
	});
});

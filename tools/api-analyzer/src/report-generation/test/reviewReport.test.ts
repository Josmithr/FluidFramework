import assert from "node:assert/strict";
import { describe, it } from "mocha";
import { ReleaseLevel } from "../../analysis-types/classification.js";
import type { CompletedAnalysis } from "../../analysis-types/completedGraph.js";
import { assertSnapshot } from "../../test/snapshotUtils.js";
import { freezeData } from "../../utilities/freezeData.js";
import {
	createReviewReport,
	prepareReviewReport,
	renderReviewReport,
	type ReviewReport,
} from "../reviewReport.js";

/**
 * A completed callable graph that requires no compiler, parser, or analysis implementation.
 * The original comment is absent; resolved content and classification are supplied by analysis.
 */
const graph: CompletedAnalysis = freezeData({
	facts: {
		packageName: "example",
		compilerVersion: "test",
		surfaces: [{ name: ".", exports: [{ name: "value", target: "value", typeOnly: false }] }],
		declarations: [
			{
				id: "value",
				name: "value",
				declarations: [
					{
						packageName: "example",
						file: "index.d.ts",
						start: 0,
						kind: "FunctionDeclaration",
						text: "",
						documentation: undefined,
					},
				],
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
						id: "signature",
						callSignatureText: "(): string;",
						functionTypeText: "() => string",
						reduced: { callSignatureText: "(): string;", functionTypeText: "() => string" },
						normalized: { callSignatureText: "(): string;", functionTypeText: "() => string" },
						documentation: undefined,
					},
				],
			},
		],
	},
	classification: {
		items: [{ id: "signature", releaseLevel: ReleaseLevel.Public, modifierTags: ["@public"] }],
		modifierTags: ["@public"],
	},
	documentation: [
		{
			id: "signature",
			packageName: "example",
			documentation: "/** Inherited content. */",
			links: [],
			inheritedFrom: [],
			documented: true,
			originalBlockTags: [],
		},
	],
});

describe("Report generation from completed data", () => {
	it("omits member release annotations without hiding other annotations or standalone overload tags", () => {
		const metadata = {
			text: "",
			documented: true,
			releaseLevel: ReleaseLevel.Public,
			modifierTags: ["@public"],
		};
		const member = {
			...metadata,
			documented: false,
			modifierTags: ["@public", "@deprecated"],
			text: "value: string;",
		};
		const container = {
			...metadata,
			prefix: "class ",
			suffix: "",
			members: [
				{ ...member, text: "constructor();" },
				{ ...member, text: "static create(): Box;" },
				{ ...member, text: "get value(): string;" },
			],
		};
		const box = {
			declarationId: "box",
			declarationName: "Box",
			name: "Box",
			typeOnly: false,
			signatures: [],
			container,
		};
		const report = {
			packageName: "example",
			surface: "complete",
			exports: [
				{
					...box,
					container: {
						...container,
						augmentation: { suffix: "", members: [{ ...member, text: "(): string;" }] },
					},
				},
				{
					declarationId: "interface",
					declarationName: "Contract",
					name: "Contract",
					typeOnly: false,
					signatures: [],
					container: { ...container, prefix: "interface ", members: [member] },
				},
				{
					declarationId: "enum",
					declarationName: "Mode",
					name: "Mode",
					typeOnly: false,
					signatures: [],
					container: {
						...container,
						prefix: "enum ",
						members: [{ ...member, text: "First = 0," }],
					},
				},
				{
					declarationId: "namespace",
					declarationName: "Group",
					name: "Group",
					typeOnly: false,
					signatures: [],
					namespace: {
						...metadata,
						exports: [
							box,
							{
								declarationId: "nested",
								declarationName: "Nested",
								name: "Nested",
								typeOnly: false,
								signatures: [],
								namespace: {
									...metadata,
									exports: [
										{
											declarationId: "run",
											declarationName: "run",
											name: "run",
											typeOnly: false,
											signatures: [{ ...member, text: "(): void;" }],
										},
									],
								},
							},
						],
					},
				},
				{
					declarationId: "overloads",
					declarationName: "convert",
					name: "convert",
					typeOnly: false,
					signatures: [
						{ ...metadata, text: "(value: string): string;" },
						{
							...metadata,
							releaseLevel: ReleaseLevel.Beta,
							modifierTags: ["@beta"],
							text: "(value: number): number;",
						},
					],
				},
			],
		};
		const before = JSON.stringify(report);
		const text = renderReviewReport(report, {
			additionalTags: ["@deprecated", "@public", "@beta"],
		});
		assert.equal(renderReviewReport(report), text);
		assertSnapshot(text, "report.member-annotations.md");
		assertSnapshot(
			renderReviewReport(report, {
				includeReleaseTags: false,
				additionalTags: ["@public", "@beta"],
			}),
			"report.member-annotations-no-release-tags.md",
		);
		assert.equal(JSON.stringify(report), before);
	});

	it("places type-only exports after their complete declaration group in each scope", () => {
		const metadata = {
			text: "",
			documented: true,
			releaseLevel: ReleaseLevel.Public,
			modifierTags: [],
		};
		const box = {
			declarationId: "box",
			declarationName: "Box",
			name: "Box",
			typeOnly: false,
			signatures: [],
			container: {
				...metadata,
				prefix: "class ",
				suffix: "",
				members: [],
				augmentation: { suffix: "", members: [{ ...metadata, text: "(): string;" }] },
			},
			namespace: {
				...metadata,
				exports: [
					{
						declarationId: "mode",
						declarationName: "Mode",
						name: "Mode",
						typeOnly: true,
						signatures: [],
						container: {
							...metadata,
							prefix: "enum ",
							suffix: "",
							members: [{ ...metadata, text: "Ready = 0," }],
						},
					},
					{
						declarationId: "box",
						declarationName: "Box",
						name: "Self",
						typeOnly: false,
						signatures: [],
						namespace: { ...metadata, exports: [], reference: "box" },
					},
				],
			},
		};
		const report: ReviewReport = freezeData({
			packageName: "example",
			surface: "complete",
			exports: [
				box,
				{ ...box, name: "ZBox", typeOnly: true },
				{ ...box, name: "ABox", typeOnly: true },
				{ ...box, name: "ValueBox" },
				{
					declarationId: "overloads",
					declarationName: "convert",
					name: "ConvertType",
					typeOnly: true,
					signatures: [
						{ ...metadata, text: "(value: string): string;" },
						{ ...metadata, text: "(value: number): number;" },
					],
				},
				{
					declarationId: "count",
					declarationName: "count",
					name: "CountType",
					typeOnly: true,
					signatures: [],
					statement: { ...metadata, prefix: "const ", suffix: ": number;" },
				},
			],
		});
		const before = JSON.stringify(report);
		const text = renderReviewReport(report, { includeReleaseTags: false });
		assertSnapshot(text, "report.type-only-groups.md");
		assert.equal(renderReviewReport(report, { includeReleaseTags: false }), text);
		assert.equal(JSON.stringify(report), before);
	});

	it("directly exports type-only declarations without exposing merged values", () => {
		const metadata = {
			text: "",
			documented: true,
			releaseLevel: ReleaseLevel.Public,
			modifierTags: [],
		};
		const item = {
			declarationId: "item",
			declarationName: "Item",
			name: "Item",
			typeOnly: true,
			signatures: [],
			container: {
				...metadata,
				prefix: "interface ",
				suffix: "",
				members: [{ ...metadata, text: "next?: Item;" }],
			},
		};
		const label = {
			declarationId: "label",
			declarationName: "Label",
			name: "Label",
			typeOnly: true,
			signatures: [],
			statement: { ...metadata, prefix: "type ", suffix: " = string;" },
		};

		// Self-references and references from another type keep the original declaration name.
		const report: ReviewReport = freezeData({
			packageName: "example",
			surface: "complete",
			exports: [
				item,
				{ ...item, name: "ItemAlias" },
				label,
				{
					...label,
					declarationId: "hidden",
					declarationName: "Hidden",
					name: "Visible",
				},
				{
					declarationId: "box",
					declarationName: "Box",
					name: "Box",
					typeOnly: true,
					signatures: [],
					container: {
						...metadata,
						prefix: "class ",
						suffix: "",
						members: [{ ...metadata, text: "value: Item;" }],
					},
				},
				{
					declarationId: "scope",
					declarationName: "Scope",
					name: "Scope",
					typeOnly: true,
					signatures: [],
					namespace: { ...metadata, exports: [item, label] },
				},
				{
					...item,
					declarationId: "merged-namespace",
					declarationName: "MergedNamespace",
					name: "MergedNamespace",
					namespace: { ...metadata, exports: [label] },
				},
				{
					...item,
					declarationId: "merged-constant",
					declarationName: "MergedConstant",
					name: "MergedConstant",
					statement: { ...metadata, prefix: "const ", suffix: ": number;" },
				},
			],
		});
		const before = JSON.stringify(report);
		assertSnapshot(renderReviewReport(report), "report.type-only-names.md");
		assert.equal(JSON.stringify(report), before);
	});

	it("reserves names belonging to other declarations before assigning local names", () => {
		const signature = {
			text: "(): void;",
			documented: true,
			releaseLevel: ReleaseLevel.Public,
			modifierTags: [],
		};

		// Alias renders first, but the later exports already own Source and Source_1, requiring Source_2.
		const report = renderReviewReport({
			packageName: "example",
			surface: "complete",
			exports: [
				{
					declarationId: "aliased",
					declarationName: "Source",
					name: "Alias",
					typeOnly: true,
					signatures: [signature],
				},
				{
					declarationId: "original",
					declarationName: "Source",
					name: "Source",
					typeOnly: true,
					signatures: [signature],
				},
				{
					declarationId: "numbered",
					declarationName: "Source_1",
					name: "Source_1",
					typeOnly: false,
					signatures: [signature],
				},
			],
		});
		assertSnapshot(report, "report.name-collisions.md");
	});

	it("uses resolved content and original metadata without processing source comments", () => {
		const before = JSON.stringify(graph);
		const prepared = prepareReviewReport(graph);
		const result = createReviewReport(prepared, ".", {
			name: "public",
			releaseLevels: [ReleaseLevel.Public],
		});
		assert.equal(result.ok, true);
		assert.deepEqual(result.value.exports[0]?.signatures, [
			{
				text: "(): string;",
				documented: true,
				releaseLevel: ReleaseLevel.Public,
				modifierTags: ["@public"],
			},
		]);
		assertSnapshot(renderReviewReport(result.value), "functions.resolved.md");
		assert.equal(JSON.stringify(graph), before);
		assert.equal(Object.isFrozen(result.value.exports), true);
	});

	it("renders normalized syntax without replacing effective facts or selection identities", () => {
		// Deliberately differ from the normalized form to detect accidental use of identity text in reports.
		const input = freezeData({
			...graph,
			facts: {
				...graph.facts,
				declarations: graph.facts.declarations.map((declaration) => ({
					...declaration,
					signatures: declaration.signatures.map((signature) => ({
						...signature,
						callSignatureText: "(): ReturnType<typeof helper>;",
						functionTypeText: "() => ReturnType<typeof helper>",
					})),
				})),
			},
		});
		const before = JSON.stringify(input);
		const report = createReviewReport(prepareReviewReport(input), ".", {
			name: "public",
			releaseLevels: [ReleaseLevel.Public],
		});
		assert.equal(report.ok, true);
		assertSnapshot(renderReviewReport(report.value), "functions.resolved.md");
		assert.equal(JSON.stringify(input), before);
		assert.equal(input.facts.declarations[0]?.signatures[0]?.id, "signature");
	});

	it("keeps all members and nested exports when a container is selected", () => {
		const metadata = { documented: true, releaseLevel: ReleaseLevel.Public, modifierTags: [] };
		const member = {
			...metadata,
			id: "member",
			text: "value: string;",
			modifierTags: ["@omit"],
		};
		const prepared = {
			packageName: "example",
			classification: {
				modifierTags: ["@selected", "@omit"],
				items: [
					{ id: "namespace", releaseLevel: ReleaseLevel.Public, modifierTags: ["@selected"] },
					{ id: "class", releaseLevel: ReleaseLevel.Public, modifierTags: ["@omit"] },
					{ id: "member", releaseLevel: ReleaseLevel.Public, modifierTags: ["@omit"] },
				],
			},
			surfaces: new Map([
				[
					".",
					{
						unsupported: undefined,
						exports: [
							{
								declarationId: "namespace",
								declarationName: "Group",
								name: "Group",
								typeOnly: false,
								signatures: [],
								namespace: {
									...metadata,
									id: "namespace",
									text: "",
									exports: [
										{
											declarationId: "class",
											declarationName: "Child",
											name: "Child",
											typeOnly: false,
											signatures: [],
											container: {
												...metadata,
												id: "class",
												text: "",
												prefix: "class ",
												suffix: "",
												members: [member],
											},
										},
									],
								},
							},
						],
					},
				],
			]),
		};
		const selected = createReviewReport(prepared, ".", {
			name: "selected",
			releaseLevels: [ReleaseLevel.Public],
			requireTags: ["@selected"],
			excludeTags: ["@omit"],
		});
		assert.equal(selected.ok, true);
		assertSnapshot(renderReviewReport(selected.value), "report.selected-container.md");
		const excluded = createReviewReport(prepared, ".", {
			name: "excluded",
			releaseLevels: [ReleaseLevel.Public],
			excludeTags: ["@selected"],
		});
		assert.equal(excluded.ok, true);
		assert.deepEqual(excluded.value.exports, []);
	});

	it("applies independent selections to the same prepared records", () => {
		const prepared = prepareReviewReport(graph);
		const publicSelection = { name: "public", releaseLevels: [ReleaseLevel.Public] };
		const first = createReviewReport(prepared, ".", publicSelection);
		const empty = createReviewReport(prepared, ".", {
			name: "internal",
			releaseLevels: [ReleaseLevel.Internal],
		});
		assert.equal(empty.ok, true);
		assert.deepEqual(empty.value.exports, []);
		assert.deepEqual(createReviewReport(prepared, ".", publicSelection), first);
	});
});

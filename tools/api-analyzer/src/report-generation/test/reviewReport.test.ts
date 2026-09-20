import assert from "node:assert/strict";
import { describe, it } from "mocha";
import { ReleaseLevel } from "../../analysis-types/classification.js";
import type { CompletedAnalysis } from "../../analysis-types/completedGraph.js";
import { freezeData } from "../../utilities/freezeData.js";
import {
	createReviewReport,
	prepareReviewReport,
	renderReviewReport,
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
		assert.match(text, /\/\/ @public\nexport class Box/);
		assert.match(text, /\/\/ @public\nexport interface Contract/);
		assert.match(text, /\/\/ @public\nexport enum Mode/);
		assert.match(text, /\/\/ @public\nexport namespace Group/);
		assert.match(text, /\/\/ @public\nexport function convert\(value: string\)/);
		assert.match(text, /\/\/ @beta\nexport function convert\(value: number\)/);
		assert.doesNotMatch(text, /^ +\/\/[^\n]*@(public|beta|alpha|internal)/m);
		assert(text.includes("    // @deprecated (undocumented)\n    constructor"));
		assert(text.includes("    // @deprecated (undocumented)\n    (): string"));
		assert(
			text.includes("        // @deprecated (undocumented)\n        export function run"),
		);
		assert.doesNotMatch(
			renderReviewReport(report, {
				includeReleaseTags: false,
				additionalTags: ["@public", "@beta"],
			}),
			/@(public|beta|alpha|internal)/,
		);
		assert.equal(JSON.stringify(report), before);
	});

	it("reuses type-only export names without aliasing them to suffixed locals", () => {
		const metadata = {
			text: "",
			documented: true,
			releaseLevel: ReleaseLevel.Public,
			modifierTags: [],
		};

		// Self-references and references from another type keep the original declaration name.
		const report = renderReviewReport({
			packageName: "example",
			surface: "complete",
			exports: [
				{
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
			],
		});
		assert.match(report, /declare interface Item {/);
		assert.match(report, /declare class Box {/);
		assert.match(report, /export type { Item };/);
		assert.match(report, /export type { Box };/);
		assert.doesNotMatch(report, /Item_1|Box_1|export class Box/);
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
		assert.match(report, /declare function Source_2\(\): void;/);
		assert.match(report, /declare function Source\(\): void;/);
		assert.match(report, /export function Source_1\(\): void;/);
		assert.match(report, /export type { Source_2 as Alias };/);
		assert.match(report, /export type { Source };/);
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
		assert.equal(renderReviewReport(result.value).includes("(undocumented)"), false);
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
		assert.match(renderReviewReport(report.value), /export function value\(\): string;/);
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
		assert.match(renderReviewReport(selected.value), /class Child/);
		assert.match(renderReviewReport(selected.value), /value: string/);
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

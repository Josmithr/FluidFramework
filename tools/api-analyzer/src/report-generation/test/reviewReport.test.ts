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

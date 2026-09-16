import assert from "node:assert/strict";
import { describe, it } from "mocha";
import {
	classifyApiItems,
	createReviewReport,
	renderReviewReport,
	selectApiItems,
	ReleaseLevel,
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
				},
			],
			type: "not-for-rendering",
			memberView: "complete",
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

describe("Review report generation", () => {
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
		for (const [name, releaseLevels] of [
			["public", [ReleaseLevel.Public]],
			["complete", [ReleaseLevel.Public, ReleaseLevel.Internal]],
		] as const) {
			const selection = selectApiItems(classification.value, { name, releaseLevels });
			assert.ok(selection.ok);
			const result = createReviewReport(facts, ".", selection.value);
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
			assert.deepEqual(createReviewReport(reversed, ".", selection.value), result);
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
			);
			assert.ok(changedSignature.ok);
			assert.notEqual(
				renderReviewReport(changedSignature.value),
				renderReviewReport(result.value),
			);
			const changedMetadata = createReviewReport(facts, ".", {
				...selection.value,
				items: selection.value.items.map((item) => ({
					...item,
					releaseLevel: ReleaseLevel.Beta,
					modifierTags: ["@beta"],
				})),
			});
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
			const report = createReviewReport(input, ".", selected.value);
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
		const report = createReviewReport(input, ".", selected.value);
		assert.ok(report.ok);
		assertSnapshot(renderReviewReport(report.value), "functions.alias-only.md");
	});

	it("distinguishes invalid requests, broken facts, and unsupported declarations", () => {
		const selection = { name: "public", items: [] };
		assert.equal(createReviewReport(facts, "missing", selection).ok, false);
		assert.equal(createReviewReport(facts, ".", { ...selection, name: " " }).ok, false);
		assert.equal(
			createReviewReport(facts, ".", {
				...selection,
				items: [{ id: "unknown", releaseLevel: undefined, modifierTags: [] }],
			}).ok,
			false,
		);
		assert.throws(
			() => createReviewReport({ ...facts, declarations: [] }, ".", selection),
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
				),
			/not supported/,
		);
		const empty = createReviewReport(facts, ".", selection);
		assert.ok(empty.ok);
		assertSnapshot(renderReviewReport(empty.value), "functions.empty.md");
	});
});

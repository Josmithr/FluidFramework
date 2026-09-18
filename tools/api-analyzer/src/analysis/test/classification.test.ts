import { documentationContext } from "../../test/contextUtils.js";
import { createAnalysisContext, createDocumentationContext } from "../documentationContext.js";
import assert from "node:assert/strict";
import { describe, it } from "mocha";
import { classifyApiItems } from "../classification.js";
import {
	selectApiItems,
	type ApiClassification,
	type ApiItemMetadata,
	ReleaseLevel,
	type ApiItemSelection,
} from "../../analysis-types/classification.js";
import { DiagnosticCode } from "../../analysis-types/result.js";
import { assertAssertionError } from "../../test/assertionUtils.js";
import type { AnalysisFacts, SourceDeclarationFact } from "../../analysis-types/facts.js";

/**
 * Creates detached facts for a merged interface or an overloaded callable without compiler access.
 * @param kind - Source declaration form; method and function groups exercise overload exclusions.
 * @param comments - Separate original comments, including undefined for an untagged part.
 * @param member - Whether the merged source records belong to a property instead of the declaration.
 * @returns Facts whose only potential release conflict is in the requested source group.
 */
function mergedReleaseFacts(
	kind: string,
	comments: readonly (string | undefined)[],
	member: boolean,
): AnalysisFacts {
	const sources: SourceDeclarationFact[] = comments.map((documentation, index) => ({
		packageName: "example",
		file: `part-${index}.d.ts`,
		start: index * 100,
		kind,
		text: "",
		documentation,
	}));
	return {
		packageName: "example",
		compilerVersion: "test",
		surfaces: [],
		declarations: [
			{
				id: "merged",
				name: "Settings",
				declarations: member ? [] : sources,
				baseDeclarations: [],
				implementedDeclarations: [],
				heritage: [],
				type: "",
				memberView: "complete",
				limitations: [],
				exports: [],
				signatures: [],
				members: member
					? [
							{
								id: "merged.value",
								name: "value",
								type: "string",
								optional: false,
								readonly: false,
								signatures: [],
								declarations: sources,
							},
						]
					: [],
			},
		],
	};
}

describe("Merged release metadata", () => {
	it("requires every explicit release level to agree regardless of source order", () => {
		for (const first of ["public", "beta", "alpha", "internal"]) {
			for (const second of ["public", "beta", "alpha", "internal"]) {
				const facts = mergedReleaseFacts(
					"InterfaceDeclaration",
					[`/** @${first} */`, undefined, `/** @${second} */`],
					false,
				);
				const result = createAnalysisContext(facts, { rules: { requireReleaseLevel: false } });
				assert.equal(result.ok, first === second, `${first}, ${second}`);
			}
		}
	});

	it("rejects conflicting explicit tags with source locations and no partial result", () => {
		for (const member of [false, true]) {
			const facts = mergedReleaseFacts(
				member ? "PropertySignature" : "InterfaceDeclaration",
				["/** First part. @public */", "/** Second part. @internal */"],
				member,
			);
			const before = JSON.stringify(facts);
			for (const rules of [{}, { requireReleaseLevel: false, validateTsdocSyntax: false }]) {
				const result = createAnalysisContext(facts, { rules });
				assert.equal(result.ok, false);
				assert.equal(
					result.diagnostics[0]?.code,
					DiagnosticCode.ClassificationReleaseConflict,
				);
				assert.match(result.diagnostics[0]?.message ?? "", /Settings/);
				assert.match(result.diagnostics[0]?.message ?? "", /@public/);
				assert.match(result.diagnostics[0]?.message ?? "", /@internal/);
				assert.match(result.diagnostics[0]?.message ?? "", /part-0\.d\.ts/);
				assert.match(result.diagnostics[0]?.message ?? "", /part-1\.d\.ts/);
				assert.match(result.diagnostics[0]?.message ?? "", /tags.*agree/);
				assert.equal("value" in result, false);
			}
			assert.equal(JSON.stringify(facts), before);
		}
	});

	it("rejects distinct descriptive comments instead of choosing declaration order", () => {
		// Keep release tags equal to isolate conflicts in summaries and ancillary descriptive blocks.
		for (const comments of [
			["/** Network settings. @public */", "/** Retry settings. @public */"],
			[
				"/** Shared. @remarks First details. @public */",
				"/** Shared. @remarks Other details. @public */",
			],
		]) {
			for (const member of [false, true]) {
				// General syntax and missing-tag opt-outs must not authorize ambiguous merged documentation.
				const result = createAnalysisContext(
					mergedReleaseFacts(
						member ? "PropertySignature" : "InterfaceDeclaration",
						comments,
						member,
					),
					{ rules: { requireReleaseLevel: false, validateTsdocSyntax: false } },
				);
				assert.equal(result.ok, false);
				assert.equal(result.diagnostics[0]?.code, "documentation-merge-conflict");
				assert.match(result.diagnostics[0]?.message ?? "", /Settings/);
				assert.match(result.diagnostics[0]?.message ?? "", /part-0\.d\.ts/);
				assert.match(result.diagnostics[0]?.message ?? "", /part-1\.d\.ts/);
			}
		}
	});

	it("does not assign missing tags or treat absent descriptions and overloads as conflicts", () => {
		for (const comments of [
			["/** Shared description. @public */", "/** Shared description. @public */"],
			[undefined, "/** @public */"],
			["/** Literal `@internal` is not metadata. @public */", "/** @public */"],
		]) {
			const result = createAnalysisContext(
				mergedReleaseFacts("InterfaceDeclaration", comments, false),
			);
			assert.equal(result.ok, true, JSON.stringify(result));
			assert.deepEqual(result.value.classification.items, []);
		}

		// Callable overloads are classified per signature, never as one merged release level.
		for (const kind of ["FunctionDeclaration", "MethodDeclaration", "MethodSignature"]) {
			const result = createAnalysisContext(
				mergedReleaseFacts(
					kind,
					["/** @public */", "/** @internal */"],
					kind !== "FunctionDeclaration",
				),
			);
			assert.equal(result.ok, true, kind);
		}
	});
});

describe("Release classification and metadata selection", () => {
	it("assigns increasing numeric permissiveness from public through internal", () => {
		assert.deepEqual(
			[ReleaseLevel.Public, ReleaseLevel.Beta, ReleaseLevel.Alpha, ReleaseLevel.Internal],
			[0, 1, 2, 3],
		);
		const result = classifyApiItems(
			documentationContext(
				["public", "beta", "alpha", "internal"].map((level, index) => ({
					id: String(index),
					documentation: `/** @${level} */`,
				})),
			),
		);
		assert(result.ok, JSON.stringify(result));
		assert.deepEqual(
			result.value.items.map((item) => item.releaseLevel),
			[0, 1, 2, 3],
		);
	});

	it("requires every requested tag and lets exclusions reject otherwise matching items", () => {
		const result = classifyApiItems(
			documentationContext(
				[
					{ id: "both", documentation: "/** @public @partner @preview */" },
					{ id: "one", documentation: "/** @public @partner */" },
				],
				{ customModifierTags: ["@partner", "@preview"] },
			),
		);
		assert(result.ok);
		const selection = {
			name: "both",
			releaseLevels: [ReleaseLevel.Public] as const,
			requireTags: ["@partner", "@preview"],
		};
		const selected = selectApiItems(result.value, selection);
		assert(selected.ok);
		assert.deepEqual(
			selected.value.items.map((item) => item.id),
			["both"],
		);
		const excluded = selectApiItems(result.value, { ...selection, excludeTags: ["@partner"] });
		assert(excluded.ok);
		assert.deepEqual(excluded.value.items, []);
	});

	it("accepts absent comments and reports malformed TSDoc", () => {
		const result = classifyApiItems(
			documentationContext(
				[
					{
						id: "outer",
						documentation: "/** @public */",
					},
					{ id: "bare", documentation: undefined },
				],
				{ rules: { requireReleaseLevel: false } },
			),
		);
		assert(result.ok, JSON.stringify(result));
		assert.deepEqual(
			result.value.items.map((item) => item.releaseLevel),
			[undefined, ReleaseLevel.Public],
		);
		const malformed = classifyApiItems(
			documentationContext([{ id: "broken", documentation: "/** @public" }]),
		);
		assert.equal(malformed.ok, false);
		if (!malformed.ok) {
			assert(
				malformed.diagnostics.some(
					(diagnostic) => diagnostic.code === DiagnosticCode.ClassificationTsdoc,
				),
			);
		}
	});

	it("is independent of input order and rejects invalid selection names and levels", () => {
		const inputs = [
			{ id: "stable", documentation: "/** @public */" },
			{ id: "experimental", documentation: "/** @alpha */" },
		];
		const result = classifyApiItems(documentationContext(inputs));
		assert(result.ok);
		assert.deepEqual(result, classifyApiItems(documentationContext([...inputs].reverse())));
		const alpha = selectApiItems(result.value, {
			name: "alpha-only",
			releaseLevels: [ReleaseLevel.Alpha],
		});
		assert(alpha.ok);
		assert.deepEqual(
			alpha.value.items.map((item) => item.id),
			["experimental"],
		);
		for (const selection of [
			{ name: " ", releaseLevels: [ReleaseLevel.Public] },
			{ name: "unsupported", releaseLevels: [-1, 4] },
			{ name: "fractional", releaseLevels: [1.5] },
			{ name: "string", releaseLevels: ["public"] },
		]) {
			const invalid = selectApiItems(result.value, selection as unknown as ApiItemSelection);
			assert.equal(invalid.ok, false);
			if (!invalid.ok) {
				assert.equal(invalid.diagnostics[0]?.code, "selection-configuration");
			}
		}
	});

	// Design feature: F4. Each callable overload has its own classification.
	it("classifies mixed-release overloads independently from their comments", () => {
		const inputs = [
			{
				id: "text",
				documentation: "/** Text overload. @public */",
			},
			{
				id: "number",
				documentation: "/** Number overload. @beta */",
			},
			{
				id: "hidden",
				documentation: "/** Hidden overload. @internal */",
			},
		];
		const result = classifyApiItems(documentationContext(inputs));
		assert(result.ok, JSON.stringify(result));
		assert.deepEqual(
			result.value.items.map((item) => [item.id, item.releaseLevel]),
			[
				["hidden", ReleaseLevel.Internal],
				["number", ReleaseLevel.Beta],
				["text", ReleaseLevel.Public],
			],
		);
		assert(result.value.items[0] !== undefined);
		assert(Object.isFrozen(result.value.items[0].modifierTags));
		assert.equal(Object.isFrozen(inputs[0]), false);
	});

	// Design requirements: W4, W10. Surface rules belong to the caller.
	it("combines explicit release levels with required and excluded custom tags", () => {
		const result = classifyApiItems(
			documentationContext(
				[
					{ id: "current", documentation: "/** @public */" },
					{ id: "supported", documentation: "/** @public @partner */" },
					{ id: "preview", documentation: "/** @beta @partner */" },
					{ id: "hidden", documentation: "/** @internal @partner */" },
				],
				{ customModifierTags: ["@partner"] },
			),
		);
		assert(result.ok, JSON.stringify(result));
		const before = JSON.stringify(result.value);
		const selected = selectApiItems(result.value, {
			name: "partner",
			releaseLevels: [ReleaseLevel.Public, ReleaseLevel.Beta],
			requireTags: ["@partner"],
		});
		assert(selected.ok, JSON.stringify(selected));
		assert.deepEqual(
			selected.value.items.map((item) => item.id),
			["preview", "supported"],
		);
		const current = selectApiItems(result.value, {
			name: "current",
			releaseLevels: [ReleaseLevel.Public],
			excludeTags: ["@partner"],
		});
		assert(current.ok);
		assert.deepEqual(
			current.value.items.map((item) => item.id),
			["current"],
		);
		assert.equal(JSON.stringify(result.value), before);
		assert(Object.isFrozen(selected.value.items));
	});

	// Design requirement: W2.
	it("reports missing and conflicting release levels without partial success", () => {
		for (const [documentation, code, serializedCode] of [
			[
				undefined,
				DiagnosticCode.ClassificationReleaseMissing,
				"classification-release-missing",
			],
			[
				"/** */",
				DiagnosticCode.ClassificationReleaseMissing,
				"classification-release-missing",
			],
			[
				"/** @public @internal */",
				DiagnosticCode.ClassificationReleaseConflict,
				"classification-release-conflict",
			],
		] as const) {
			const result = classifyApiItems(
				documentationContext([{ id: "affected", documentation }]),
			);
			assert.equal(result.ok, false);
			if (!result.ok) {
				const restored = JSON.parse(JSON.stringify(result)) as typeof result;
				assert.equal(restored.diagnostics[0]?.code, serializedCode);
				assert(
					result.diagnostics.some(
						(diagnostic) =>
							diagnostic.code === code && diagnostic.message.includes("affected"),
					),
				);
				assert.equal("value" in result, false);
			}
		}
	});

	// Design requirements: W4, W10.
	it("retains untagged items only when both policy and selection permit them", () => {
		const result = classifyApiItems(
			documentationContext([{ id: "untagged", documentation: undefined }], {
				rules: { requireReleaseLevel: false },
			}),
		);
		assert(result.ok, JSON.stringify(result));
		assert(result.value.items[0] !== undefined);
		assert.equal(result.value.items[0].releaseLevel, undefined);
		const excluded = selectApiItems(result.value, {
			name: "tagged",
			releaseLevels: [ReleaseLevel.Public],
		});
		assert(excluded.ok);
		assert.deepEqual(excluded.value.items, []);
		const included = selectApiItems(result.value, {
			name: "all",
			releaseLevels: [],
			includeUntagged: true,
		});
		assert(included.ok);
		assert.equal(included.value.items.length, 1);
		const restored = JSON.parse(JSON.stringify(result.value)) as ApiClassification & {
			items: ApiItemMetadata[];
		};
		assert(restored.items[0] !== undefined);
		assert.equal(Object.hasOwn(restored.items[0], "releaseLevel"), false);
		assert.equal(restored.items[0].releaseLevel, undefined);
		restored.items.push({
			id: "public",
			releaseLevel: ReleaseLevel.Public,
			modifierTags: ["@public"],
		});
		const publicOnly = selectApiItems(restored, {
			name: "public",
			releaseLevels: [ReleaseLevel.Public],
		});
		assert(publicOnly.ok);
		assert.deepEqual(
			publicOnly.value.items.map((item) => item.id),
			["public"],
		);
		const untaggedOnly = selectApiItems(restored, {
			name: "untagged",
			releaseLevels: [],
			includeUntagged: true,
		});
		assert(untaggedOnly.ok);
		assert.deepEqual(untaggedOnly.value, { ...included.value, name: "untagged" });
	});

	it("distinguishes explicit empty comments from invalid empty strings", () => {
		const options = { rules: { requireReleaseLevel: false } };
		for (const documentation of [undefined, "/** */"]) {
			const item = { id: "item", documentation };
			const result = classifyApiItems(documentationContext([item], options));
			assert(result.ok, JSON.stringify(result));
			assert.equal(result.value.items[0]?.releaseLevel, undefined);
			assert.equal(item.documentation, documentation);
		}
		const invalid = classifyApiItems(
			documentationContext([{ id: "item", documentation: "" }], options),
		);
		assert.equal(invalid.ok, false);
		if (!invalid.ok) {
			assert(
				invalid.diagnostics.some(
					(diagnostic) => diagnostic.code === DiagnosticCode.ClassificationTsdoc,
				),
			);
		}
	});

	// Design requirement: W2.
	it("reports parser diagnostics and permits an independent syntax-rule opt-out", () => {
		const inputs = [{ id: "invalid-comment", documentation: "/** @public @unconfigured */" }];
		const failed = classifyApiItems(documentationContext(inputs));
		assert.equal(failed.ok, false);
		if (!failed.ok) {
			assert(
				failed.diagnostics.some(
					(diagnostic) =>
						diagnostic.code === DiagnosticCode.ClassificationTsdoc &&
						diagnostic.message.includes("invalid-comment"),
				),
			);
		}
		const tolerant = classifyApiItems(
			documentationContext(inputs, { rules: { validateTsdocSyntax: false } }),
		);
		assert(tolerant.ok);
		assert.equal(tolerant.value.items[0]?.releaseLevel, ReleaseLevel.Public);
		assert.deepEqual(tolerant.value.items[0]?.modifierTags, ["@public"]);
		const missing = classifyApiItems(
			documentationContext([{ id: "missing", documentation: undefined }], {
				rules: { validateTsdocSyntax: false },
			}),
		);
		assert.equal(missing.ok, false);
		if (!missing.ok) {
			assert.equal(missing.diagnostics[0]?.code, "classification-release-missing");
		}
		assert.equal(
			classifyApiItems(
				documentationContext([{ id: "conflict", documentation: "/** @public @beta */" }], {
					rules: { validateTsdocSyntax: false, requireReleaseLevel: false },
				}),
			).ok,
			false,
		);
	});

	it("rejects duplicate identifiers and invalid tag configuration", () => {
		const internalError = new assert.AssertionError({
			message: "Internal tag configuration failure",
		});
		assert.throws(
			() =>
				classifyApiItems(
					documentationContext([], {
						get customModifierTags(): readonly string[] {
							throw internalError;
						},
					}),
				),
			(error: unknown) => error === internalError,
		);
		const item = { id: "duplicate", documentation: "/** @public */" };
		assertAssertionError(
			() => classifyApiItems(documentationContext([item, item])),
			"Documentation inputs must have distinct identities.",
		);
		for (const customModifierTags of [["missing-at"], ["@public"], ["@param"]]) {
			const result = createDocumentationContext(
				[item],
				{ customModifierTags },
				DiagnosticCode.ClassificationConfiguration,
			);
			assert.equal(result.ok, false);
			if (!result.ok) {
				assert.equal(result.diagnostics[0]?.code, "classification-configuration");
			}
		}
	});

	it("rejects unknown selection tags and returns independent frozen results", () => {
		const result = classifyApiItems(
			documentationContext([{ id: "item", documentation: "/** @public */" }]),
		);
		assert(result.ok);
		const invalid = selectApiItems(result.value, {
			name: "typo",
			releaseLevels: [ReleaseLevel.Public],
			requireTags: ["@unknown"],
		});
		assert.equal(invalid.ok, false);
		if (!invalid.ok) {
			assert.equal(invalid.diagnostics[0]?.code, "selection-configuration");
		}
		const mutable = structuredClone(result.value);
		const selection = { name: "public", releaseLevels: [ReleaseLevel.Public] as const };
		const first = selectApiItems(mutable, selection);
		const second = selectApiItems(mutable, selection);
		assert.deepEqual(first, second);
		assert.equal(Object.isFrozen(mutable.items[0]), false);
		assert.equal(Object.isFrozen(selection), false);
		assert(Object.isFrozen(first));
	});
});

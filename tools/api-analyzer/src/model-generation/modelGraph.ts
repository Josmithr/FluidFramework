import { z } from "zod";
import type { CompletedAnalysis } from "../analysis-types/completedGraph.js";
import type {
	DocumentationReferenceContext,
	MemberFact,
	SignatureFact,
	SignatureText,
	SourceDeclarationFact,
} from "../analysis-types/facts.js";
import type {
	ModelGraph,
	ModelItem,
	ModelMember,
	ModelSignature,
	ModelSignatureText,
	ModelSource,
} from "../analysis-types/modelGraph.js";
import { DiagnosticCode, reportFailure, type Result } from "../analysis-types/result.js";
import type { CodeExcerpt } from "../analysis-types/excerpt.js";

const originSchema = z.strictObject({
	packageName: z.string().min(1),
	file: z.string(),
	start: z.number().int().nonnegative(),
});
const itemSchema = z.strictObject({
	id: z.string(),
	documentationId: z.string().optional(),
	declaringContainer: z.string().optional(),
	references: z.array(
		z.strictObject({ text: z.string(), target: z.string(), origin: originSchema }),
	),
});
const excerptSchema = z
	.strictObject({
		tokens: z.array(
			z.discriminatedUnion("kind", [
				z.strictObject({ kind: z.literal("Content"), text: z.string().min(1) }),
				z.strictObject({
					kind: z.literal("Reference"),
					text: z.string().min(1),
					target: z.string(),
				}),
			]),
		),
		tokenRange: z.strictObject({
			startIndex: z.number().int().nonnegative(),
			endIndex: z.number().int().nonnegative(),
		}),
	})
	.refine(
		(excerpt) =>
			excerpt.tokenRange.startIndex <= excerpt.tokenRange.endIndex &&
			excerpt.tokenRange.endIndex <= excerpt.tokens.length,
		"Excerpt token ranges must be ordered and within the token array.",
	);

// Valid bounds alone do not prove that linked tokens describe the stored display text.
const signatureTextSchema = z
	.strictObject({
		callSignatureExcerpt: excerptSchema,
		functionTypeExcerpt: excerptSchema,
		callSignatureText: z.string(),
		functionTypeText: z.string(),
	})
	.refine(
		(view) =>
			(
				[
					[view.callSignatureExcerpt, view.callSignatureText],
					[view.functionTypeExcerpt, view.functionTypeText],
				] as const
			).every(
				([excerpt, text]) =>
					excerpt.tokens
						.slice(excerpt.tokenRange.startIndex, excerpt.tokenRange.endIndex)
						.map((token) => token.text)
						.join("") === text,
			),
		"Excerpt text must match the signature view.",
	);
const sourceSchema = originSchema
	.extend({
		kind: z.string(),
		text: z.string(),
		documentation: z.string().optional(),
		excerpt: excerptSchema,
	})
	.refine(
		(source) =>
			source.excerpt.tokens
				.slice(source.excerpt.tokenRange.startIndex, source.excerpt.tokenRange.endIndex)
				.map((token) => token.text)
				.join("") === source.text,
		"Source excerpts must preserve original source text.",
	)
	.transform((value) => ({ ...value, documentation: value.documentation }));
const signatureSchema = itemSchema.extend({
	source: sourceSchema.optional(),
	effective: signatureTextSchema,
	reduced: signatureTextSchema,
	normalized: signatureTextSchema,
});
const memberSchema = itemSchema.extend({
	// Full printer output can differ from the compact type string; their text need not match exactly.
	typeExcerpt: excerptSchema,
	name: z.string(),
	referenceName: z.string().optional(),
	symbolId: z.string().optional(),
	type: z.string(),
	optional: z.boolean(),
	readonly: z.boolean().nullable(),
	sources: z.array(sourceSchema),
	signatures: z.array(signatureSchema),
});
const exportSchema = z.strictObject({
	name: z.string(),
	target: z.string(),
	typeOnly: z.boolean(),
});

/**
 * Explicit versioned declaration schema; compiler lookup contexts and mutable parser state are excluded.
 */
export const modelGraphSchema: z.ZodType<ModelGraph> = z.strictObject({
	surfaces: z.array(z.strictObject({ name: z.string(), exports: z.array(exportSchema) })),
	declarations: z.array(
		itemSchema.extend({
			name: z.string(),
			sources: z.array(sourceSchema).min(1),
			type: z.string(),
			symbolId: z.string().optional(),
			statement: z.strictObject({ prefix: z.string(), suffix: z.string() }).optional(),
			container: z
				.strictObject({
					kind: z.enum(["class", "interface", "enum"]),
					prefix: z.string(),
					suffix: z.string(),
					supported: z.boolean(),
					interfaceSuffix: z.string().optional(),
					declaredMembers: z.array(
						itemSchema.extend({
							source: sourceSchema,
							printed: z.string(),
							staticTarget: z.string().optional(),
						}),
					),
				})
				.optional(),
			memberView: z.enum(["complete", "partial"]),
			limitations: z.array(
				z.strictObject({ code: z.enum(DiagnosticCode), message: z.string() }),
			),
			members: z.array(memberSchema),
			signatures: z.array(signatureSchema),
			baseDeclarations: z.array(z.string()),
			implementedDeclarations: z.array(z.string()),
			heritage: z.array(
				z.strictObject({
					kind: z.enum(["extends", "implements"]),
					target: z.string(),
					members: z.array(memberSchema),
				}),
			),
			exports: z.array(exportSchema),
		}),
	),
});

/**
 * Projects completed facts into portable display data without serializing analysis lookup state.
 * @param graph - Completed immutable analysis.
 * @param documentationIds - Available local and external documentation identities.
 * @returns Detached declaration graph with ordered member and signature views.
 */
export function createModelGraph(
	graph: CompletedAnalysis,
	documentationIds: ReadonlySet<string>,
): ModelGraph {
	/**
	 * Selects portable identity and resolved reference fields.
	 * @param id - Item identity.
	 * @param context - Original declaration lookup context, when retained.
	 * @returns Portable item relationships.
	 */
	function createItem(
		id: string,
		context: DocumentationReferenceContext | undefined,
	): ModelItem {
		return {
			id,
			...(documentationIds.has(id) ? { documentationId: id } : {}),
			...(context?.container === undefined ? {} : { declaringContainer: context.container }),
			references: (context?.typeReferences ?? []).map((reference) => ({
				text: reference.text,
				target: reference.target,
				origin: reference.origin,
			})),
		};
	}

	/**
	 * Copies signature display views without copying parser or lookup state.
	 * @param signature - Collected effective signature.
	 * @returns Portable signature views.
	 */
	function createSignature(signature: SignatureFact): ModelSignature {
		return {
			...createItem(signature.id, signature.documentationContext),
			...(signature.source === undefined
				? {}
				: { source: createModelSource(signature.source) }),
			effective: createSignatureText(signature),
			reduced: createSignatureText(signature.reduced),
			normalized: createSignatureText(signature.normalized),
		};
	}

	/**
	 * Copies an effective member and its ordered callable views.
	 * @param member - Collected member, including instantiated heritage members.
	 * @returns Portable member shape.
	 */
	function createMember(member: MemberFact): ModelMember {
		return {
			...createItem(member.id, member.documentationContext),
			typeExcerpt: member.typeExcerpt ?? createContentExcerpt(member.type),
			name: member.name,
			...(member.referenceName === undefined ? {} : { referenceName: member.referenceName }),
			...(member.symbolId === undefined ? {} : { symbolId: member.symbolId }),
			type: member.type,
			optional: member.optional,
			readonly: member.readonly,
			sources: member.declarations.map(createModelSource),
			signatures: member.signatures.map(createSignature),
		};
	}

	// Sort declarations for stable artifacts, but preserve member, overload, and source-part order.
	return {
		surfaces: graph.facts.surfaces,
		declarations: graph.facts.declarations
			.map((declaration) => ({
				...createItem(declaration.id, declaration.documentationContext),
				name: declaration.name,
				sources: declaration.declarations.map(createModelSource),
				type: declaration.type,
				...(declaration.symbolId === undefined ? {} : { symbolId: declaration.symbolId }),
				...(declaration.statement === undefined ? {} : { statement: declaration.statement }),
				...(declaration.container === undefined
					? {}
					: {
							container: {
								...declaration.container,
								declaredMembers: declaration.container.declaredMembers.map((declared) => ({
									...createItem(declared.id, declared.documentationContext),
									source: createModelSource(declared),
									printed: declared.printed,
									...(declared.staticTarget === undefined
										? {}
										: { staticTarget: declared.staticTarget }),
								})),
							},
						}),
				memberView: declaration.memberView,
				limitations: declaration.limitations,
				members: declaration.members.map(createMember),
				signatures: declaration.signatures.map(createSignature),
				baseDeclarations: declaration.baseDeclarations,
				implementedDeclarations: declaration.implementedDeclarations,
				heritage: declaration.heritage.map((heritage) => ({
					kind: heritage.kind,
					target: heritage.target,
					members: heritage.members.map(createMember),
				})),
				exports: declaration.exports,
			}))
			.sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)),
	};
}

/**
 * Copies original source fields without leaking declaration-specific working metadata.
 * @param source - Collected original declaration.
 * @returns Portable source syntax and its captured excerpt.
 */
function createModelSource(source: SourceDeclarationFact): ModelSource {
	return {
		packageName: source.packageName,
		file: source.file,
		start: source.start,
		kind: source.kind,
		text: source.text,
		documentation: source.documentation,
		excerpt: source.excerpt ?? createContentExcerpt(source.text),
	};
}

/**
 * Copies captured excerpts, supplying content-only tokens for synthetic internal facts.
 * @param view - Detached compiler display view.
 * @returns Explicit portable text and excerpt fields.
 */
function createSignatureText(view: SignatureText): ModelSignatureText {
	return {
		callSignatureText: view.callSignatureText,
		functionTypeText: view.functionTypeText,
		callSignatureExcerpt:
			view.callSignatureExcerpt ?? createContentExcerpt(view.callSignatureText),
		functionTypeExcerpt:
			view.functionTypeExcerpt ?? createContentExcerpt(view.functionTypeText),
	};
}

/**
 * Supplies a content-only excerpt for synthetic internal inputs without compiler capture.
 * @param text - Displayed text, without inferred reference targets.
 * @returns A whole-text excerpt.
 */
function createContentExcerpt(text: string): CodeExcerpt {
	return {
		tokens: text === "" ? [] : [{ kind: "Content", text }],
		tokenRange: { startIndex: 0, endIndex: text === "" ? 0 : 1 },
	};
}

/**
 * Lists portable items in structural order, including instantiated heritage views.
 * @param graph - Portable declaration graph.
 * @returns Items that can reference documentation or declaring containers.
 */
export function collectModelItems(graph: ModelGraph): readonly ModelItem[] {
	return graph.declarations.flatMap((declaration) => [
		declaration,
		...declaration.signatures,
		...(declaration.container?.declaredMembers ?? []),
		...[
			declaration.members,
			...declaration.heritage.map((heritage) => heritage.members),
		].flatMap((members) => members.flatMap((member) => [member, ...member.signatures])),
	]);
}

/**
 * Validates graph identities separately from JSON shape and documentation syntax.
 * @param graph - Schema-validated portable graph.
 * @param documentationIds - Available documentation identities, including recorded externals.
 * @param packageName - Package used in diagnostics.
 * @returns Success or an actionable graph-integrity diagnostic.
 */
export function validateModelGraph(
	graph: ModelGraph,
	documentationIds: ReadonlySet<string>,
	packageName: string,
): Result {
	// The schema validates record shapes. These indexes establish that relationships reach stored records.
	const declarations = new Set(graph.declarations.map((declaration) => declaration.id));
	const references: string[] = [];
	const excerpts: CodeExcerpt[] = [];
	const items: ModelItem[] = [];
	let duplicate =
		declarations.size !== graph.declarations.length ||
		new Set(graph.surfaces.map((surface) => surface.name)).size !== graph.surfaces.length;
	for (const surface of graph.surfaces) {
		duplicate ||=
			new Set(surface.exports.map((binding) => binding.name)).size !== surface.exports.length;
		references.push(...surface.exports.map((binding) => binding.target));
	}
	for (const declaration of graph.declarations) {
		excerpts.push(
			...declaration.sources.map((source) => source.excerpt),
			...(declaration.container?.declaredMembers.map((member) => member.source.excerpt) ?? []),
		);
		items.push(
			declaration,
			...declaration.signatures,
			...(declaration.container?.declaredMembers ?? []),
		);
		references.push(
			...declaration.baseDeclarations,
			...declaration.implementedDeclarations,
			...declaration.exports.map((binding) => binding.target),
			...declaration.heritage.map((heritage) => heritage.target),
			...(declaration.container?.declaredMembers.flatMap((member) =>
				member.staticTarget === undefined ? [] : [member.staticTarget],
			) ?? []),
		);

		// Declared and inherited views may share sources. Check identities within each receiving view.
		for (const members of [
			declaration.members,
			...declaration.heritage.map((heritage) => heritage.members),
		]) {
			duplicate ||= new Set(members.map((member) => member.id)).size !== members.length;
			for (const member of members) {
				excerpts.push(...member.sources.map((source) => source.excerpt));
				items.push(member, ...member.signatures);
			}
		}
	}

	// All items passed the strict shape schema before these shape-based member/signature checks.
	for (const item of items) {
		if (item.declaringContainer !== undefined) {
			references.push(item.declaringContainer);
		}
		references.push(...item.references.map((reference) => reference.target));
		if ("typeExcerpt" in item) {
			references.push(
				...(item as ModelMember).typeExcerpt.tokens.flatMap((token) =>
					token.kind === "Reference" ? [token.target] : [],
				),
			);
		}
		if ("effective" in item && "reduced" in item && "normalized" in item) {
			const signature = item as ModelSignature;
			if (signature.source !== undefined) {
				excerpts.push(signature.source.excerpt);
			}
			for (const view of [signature.effective, signature.reduced, signature.normalized]) {
				for (const excerpt of [view.callSignatureExcerpt, view.functionTypeExcerpt]) {
					references.push(
						...excerpt.tokens.flatMap((token) =>
							token.kind === "Reference" ? [token.target] : [],
						),
					);
				}
			}
		}
	}

	// Validate every stored token target, including tokens outside a selected excerpt range.
	for (const excerpt of excerpts) {
		references.push(
			...excerpt.tokens.flatMap((token) => (token.kind === "Reference" ? [token.target] : [])),
		);
	}
	const invalid = items.find(
		(item) =>
			item.documentationId !== undefined &&
			(!documentationIds.has(item.documentationId) || item.documentationId !== item.id),
	);
	const missing = references.find((id) => !declarations.has(id));
	return duplicate || invalid !== undefined || missing !== undefined
		? reportFailure(
				DiagnosticCode.DependencyModel,
				`Dependency ${packageName}: incomplete declaration graph or inconsistent identity ${invalid?.id ?? missing ?? "(duplicate)"}. Regenerate its model.`,
			)
		: { ok: true };
}

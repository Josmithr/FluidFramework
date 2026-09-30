import assert from "node:assert/strict";
import type { CodeExcerpt, ExcerptToken } from "../analysis-types/excerpt.js";
import type {
	DeclarationSyntax,
	DeclarationExportFact,
	DeclarationSyntaxFacts,
	DocumentationSyntax,
	SyntaxRange,
} from "../analysis-types/declarationSyntax.js";
import type { RollupData } from "./rollupTypes.js";
import type { ExportFact } from "../analysis-types/facts.js";

/**
 * A generator-owned replacement over original source coordinates.
 */
interface SyntaxEdit extends SyntaxRange {
	/**
	 * Tokens replacing the original range.
	 */
	readonly tokens: readonly ExcerptToken[];
}

/**
 * Prepares local output policy from neutral source and binding facts.
 * @param facts - Original package syntax, unaffected by this operation.
 * @returns Invocation-owned rollup inputs.
 */
export function prepareDeclarationSyntax(facts: DeclarationSyntaxFacts): RollupData {
	return {
		...(facts.sideEffectImports === undefined
			? {}
			: { sideEffectImports: facts.sideEffectImports }),
		reservedNames: facts.lexicalNames,
		imports: facts.imports,
		surfaces: facts.surfaces.map((surface) => ({
			...surface,
			exports: surface.exports.map(({ outsideSuite, ...binding }) => ({
				...prepareExportBinding(binding),
				untrimmed: outsideSuite,
			})),
		})),
		declarations: facts.declarations.map((declaration) => {
			const localAugmentation = declaration.moduleAugmentationMembers !== undefined;
			const moduleScope =
				declaration.globalAugmentation === true ||
				(declaration.moduleAugmentation !== undefined && !localAugmentation);

			// Local augmentation parts are already captured under their merged target identities.
			// Keep the module's export bindings for type queries, but do not emit its original wrapper.
			return {
				id: declaration.id,
				...(moduleScope ? { moduleScope: true as const } : {}),
				name:
					declaration.name === ""
						? "moduleNamespace"
						: declaration.fragments.some(
									(fragment) => fragment.syntax.anonymousNameOffset !== undefined,
								)
							? "defaultExport"
							: declaration.name,
				fragments: (localAugmentation ? [] : declaration.fragments).map((fragment) => ({
					signatures: fragment.signatures,
					excerpt: prepareDeclarationFragment(
						fragment.syntax,
						declaration.id,
						declaration.name,
						moduleScope,
					),
				})),
				...(declaration.exports === undefined
					? {}
					: { exports: declaration.exports.map(prepareExportBinding) }),
				...(declaration.documentation === undefined
					? {}
					: { documentation: declaration.documentation.map(renderDocumentation).join("\n") }),
				...(declaration.fragments.some((fragment) => !fragment.syntax.isDeclarationFile)
					? {
							unsupported:
								"Declaration rollups require declaration-file inputs. Build declarations before analysis.",
						}
					: {}),
				...(declaration.moduleAugmentation?.startsWith(".") === true && !localAugmentation
					? {
							unsupported:
								"Relative module augmentations require a captured package-owned target and supported member declarations.",
						}
					: {}),
			};
		}),
		...(facts.packageDocumentation === undefined
			? {}
			: { packageDocumentation: renderDocumentation(facts.packageDocumentation) }),
	};
}

/**
 * Preserves cross-package bindings as re-exports until selection requires a local declaration.
 * @param binding - Resolved identity and original module reference.
 * @returns Generator-owned export binding.
 */
function prepareExportBinding(binding: DeclarationExportFact): ExportFact {
	const { moduleReference, ...resolved } = binding;
	return {
		...resolved,
		...(moduleReference === undefined ? {} : { external: moduleReference }),
	};
}

/**
 * Applies declaration output rules to captured syntax.
 * @remarks
 * This operation does not parse source text or resolve identities again.
 * @param syntax - Original source and compiler-derived boundaries.
 * @param id - Declaration identity for an anonymous default name.
 * @param name - Preferred name for an anonymous default declaration.
 * @param moduleScope - Whether to retain augmentation syntax outside the shared namespace. Defaults to false.
 * @returns Output tokens that keep their recorded reference identities.
 */
export function prepareDeclarationFragment(
	syntax: DeclarationSyntax,
	id: string,
	name: string,
	moduleScope = false,
): CodeExcerpt {
	// Global and external module augmentations remain at module scope.
	// Keep their declare keyword and do not add an export keyword.
	const edits: SyntaxEdit[] = moduleScope
		? []
		: [
				{
					start: syntax.declarationStart,
					end: syntax.declarationStart,
					tokens: [{ kind: "Content", text: "export " }],
				},
			];
	for (const modifier of syntax.modifiers) {
		if (!moduleScope && ["export", "default", "declare"].includes(modifier.keyword)) {
			edits.push({ start: modifier.range.start, end: modifier.trailingEnd, tokens: [] });
		}
	}
	for (const comment of syntax.comments) {
		for (const range of comment.packageDocumentation
			? [comment.range]
			: comment.privateRemarks) {
			edits.push({ ...range, tokens: [] });
		}
	}
	for (const imported of syntax.importTypes) {
		edits.push({
			...imported.prefix,
			tokens: imported.isTypeOf ? [{ kind: "Content", text: "typeof " }] : [],
		});
	}

	// In export { Name }, the local reference can change, but the public name must not change.
	for (const range of syntax.shorthandExports ?? []) {
		const text = syntax.excerpt.tokens.map((token) => token.text).join("");
		edits.push({
			start: range.end,
			end: range.end,
			tokens: [{ kind: "Content", text: ` as ${text.slice(range.start, range.end)}` }],
		});
	}

	// A module type query without a qualifier occupies one reference token.
	// Replacing that token removes the original typeof keyword, so add the keyword here.
	for (const range of syntax.moduleQueries ?? []) {
		edits.push({
			start: range.start,
			end: range.start,
			tokens: [{ kind: "Content", text: "typeof " }],
		});
	}

	// Rename only the enclosing root.
	// Keep the member names unchanged so each path still refers to the same declaration.
	for (const reference of syntax.referencePaths ?? []) {
		let offset = 0;
		const token = syntax.excerpt.tokens.find((candidate) => {
			const start = offset;
			offset += candidate.text.length;
			return start === reference.range.start && offset === reference.range.end;
		});
		assert(
			token?.kind === "Reference",
			"Member paths must belong to complete reference tokens.",
		);
		edits.push({
			...reference.range,
			tokens: [
				token,
				{ kind: "Content", text: reference.path.map((member) => `.${member}`).join("") },
			],
		});
	}
	if (syntax.variable !== undefined) {
		const { list, binding } = syntax.variable;
		edits.push(
			{ start: list.start, end: binding.start, tokens: [] },
			{ start: binding.end, end: list.end, tokens: [] },
		);
	}
	if (syntax.anonymousNameOffset !== undefined) {
		edits.push({
			start: syntax.anonymousNameOffset,
			end: syntax.anonymousNameOffset,
			tokens: [
				{ kind: "Content", text: " " },
				{ kind: "Reference", text: name, target: id },
			],
		});
	}
	return applySyntaxEdits(syntax.excerpt, edits);
}

/**
 * Omits private sections using parser-resolved ranges while preserving other comment text.
 * @param documentation - Original comment and section boundaries.
 * @returns Publishable comment text.
 */
function renderDocumentation(documentation: DocumentationSyntax): string {
	let text = documentation.text;
	for (const range of [...documentation.privateRemarks].sort(
		(left, right) => right.start - left.start,
	)) {
		text = text.slice(0, range.start) + text.slice(range.end);
	}
	return text;
}

/**
 * Applies ordered, non-overlapping edits to original tokens without losing reference targets.
 * @param excerpt - Complete original source tokens.
 * @param edits - Generator-owned transformations over original character coordinates.
 * @returns Edited excerpt with a complete token range.
 */
function applySyntaxEdits(excerpt: CodeExcerpt, edits: readonly SyntaxEdit[]): CodeExcerpt {
	const tokens: ExcerptToken[] = [];
	let position = 0;
	let tokenStart = 0;
	let tokenIndex = 0;
	const length = excerpt.tokens.reduce((total, token) => total + token.text.length, 0);

	/**
	 * Copies or skips original tokens up to a source offset.
	 * @param end - Exclusive source offset.
	 * @param retain - Whether traversed source belongs in the output.
	 */
	function consume(end: number, retain: boolean): void {
		while (position < end) {
			const token = excerpt.tokens[tokenIndex];
			assert(token !== undefined, "Syntax edits must stay within original tokens.");
			const tokenEnd = tokenStart + token.text.length;
			const next = Math.min(end, tokenEnd);
			if (retain) {
				assert(
					token.kind === "Content" || (position === tokenStart && next === tokenEnd),
					"Syntax edits must not split reference tokens.",
				);
				tokens.push({
					...token,
					text: token.text.slice(position - tokenStart, next - tokenStart),
				});
			}
			position = next;
			if (position === tokenEnd) {
				tokenStart = tokenEnd;
				tokenIndex++;
			}
		}
	}

	// At the same offset, insert text before removing text.
	// This order lets export replace an original leading modifier.
	// All positions refer to the original excerpt, not to the output under construction.
	for (const edit of [...edits].sort(
		(left, right) => left.start - right.start || left.end - right.end,
	)) {
		assert(
			edit.start >= position && edit.end >= edit.start && edit.end <= length,
			"Syntax edits must be ordered, in range, and non-overlapping.",
		);
		consume(edit.start, true);
		tokens.push(...edit.tokens);
		consume(edit.end, false);
	}
	consume(length, true);
	return { tokens, tokenRange: { startIndex: 0, endIndex: tokens.length } };
}

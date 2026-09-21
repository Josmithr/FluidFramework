import assert from "node:assert/strict";
import { visitEachChild, type Node } from "typescript/unstable/ast";
import { createIdentifier } from "typescript/unstable/ast/factory";
import {
	isIdentifier,
	isTypeReferenceNode,
	isTypeQueryNode,
	isExpressionWithTypeArguments,
	isImportTypeNode,
	isMappedTypeNode,
	isConditionalTypeNode,
	isInferTypeNode,
} from "typescript/unstable/ast/is";
import type { CodeExcerpt, ExcerptToken } from "../analysis-types/excerpt.js";

/**
 * One resolved occurrence in a displayed string, measured in UTF-16 code units.
 */
export interface ExcerptReference {
	/**
	 * Inclusive start offset in UTF-16 code units.
	 */
	readonly start: number;

	/**
	 * Exclusive end offset in UTF-16 code units.
	 */
	readonly end: number;

	/**
	 * Producer-resolved declaration identity.
	 */
	readonly target: string;
}

/**
 * Builds a detached excerpt without parsing text or resolving names.
 * @param text - Complete displayed text.
 * @param references - Ordered, disjoint reference occurrences within the text.
 * @returns Tokens whose concatenated text exactly matches the input.
 */
export function createCodeExcerpt(
	text: string,
	references: readonly ExcerptReference[],
): CodeExcerpt {
	const tokens: ExcerptToken[] = [];
	let offset = 0;
	for (const reference of references) {
		assert(
			reference.start >= offset &&
				reference.end > reference.start &&
				reference.end <= text.length,
			"Excerpt reference ranges must be ordered, disjoint, and within the text.",
		);
		if (reference.start > offset) {
			tokens.push({ kind: "Content", text: text.slice(offset, reference.start) });
		}
		tokens.push({
			kind: "Reference",
			text: text.slice(reference.start, reference.end),
			target: reference.target,
		});
		offset = reference.end;
	}
	if (offset < text.length) {
		tokens.push({ kind: "Content", text: text.slice(offset) });
	}
	return { tokens, tokenRange: { startIndex: 0, endIndex: tokens.length } };
}

/**
 * Captures exact print positions by replacing resolved reference names on a copied AST.
 * @remarks
 * Compiler and lookup effects are explicit callbacks; input nodes are never changed.
 * A reconstruction check rejects any printer transformation that would invalidate token boundaries.
 * @param node - Compiler-produced syntax for the requested display view.
 * @param print - Compiler printing operation with consistent options.
 * @param resolve - Original-scope compiler lookup, with locally bound type-parameter names excluded.
 * @returns Printed text with producer-resolved reference tokens.
 */
export function printCodeExcerpt(
	node: Node,
	print: (node: Node) => string,
	resolve: (name: Node, bound: ReadonlySet<string>, reference: Node) => string | undefined,
): CodeExcerpt {
	const text = print(node).trim();

	// Do not confuse an existing identifier or literal with a marker inserted into the copied tree.
	let prefix = "__api_excerpt_reference_";
	while (text.includes(prefix)) {
		prefix += "_";
	}
	const replacements: { marker: string; text: string; target: string }[] = [];

	/**
	 * Replaces only semantically resolved names, retaining lexical binder scope for nested signatures.
	 * @param current - Current AST node.
	 * @param bound - Type parameters bound by enclosing generated syntax.
	 * @returns A transformed node or the unchanged input node.
	 */
	function visit(current: Node, bound: ReadonlySet<string>): Node {
		if (isConditionalTypeNode(current)) {
			// Inferred parameters bind only the true branch. Nested conditionals own their infer scopes.
			const inferred = new Set(bound);
			const pending = [current.extendsType as Node];
			while (pending.length > 0) {
				const child = pending.pop();
				assert(child !== undefined, "Pending infer nodes must be available.");
				if (isInferTypeNode(child)) {
					inferred.add(child.typeParameter.name.text);
				}
				if (!isConditionalTypeNode(child)) {
					child.forEachChild((descendant) => {
						pending.push(descendant);
					});
				}
			}
			return visitEachChild(current, (child) =>
				visit(child, child === current.trueType ? inferred : bound),
			);
		}
		if (isMappedTypeNode(current)) {
			// The key's constraint uses the outer scope; its name binds the mapped result and key remapping.
			const mapped = new Set([...bound, current.typeParameter.name.text]);
			return visitEachChild(current, (child) =>
				visit(child, child === current.typeParameter ? bound : mapped),
			);
		}
		const local = new Set(bound);
		if ("typeParameters" in current && Array.isArray(current.typeParameters)) {
			for (const parameter of current.typeParameters as readonly { readonly name: Node }[]) {
				if (isIdentifier(parameter.name)) {
					local.add(parameter.name.text);
				}
			}
		}
		const name = isTypeReferenceNode(current)
			? current.typeName
			: isTypeQueryNode(current)
				? current.exprName
				: isExpressionWithTypeArguments(current)
					? current.expression
					: isImportTypeNode(current)
						? current.qualifier
						: undefined;
		const target = name === undefined ? undefined : resolve(name, local, current);
		if (name !== undefined && target !== undefined) {
			const marker = `${prefix}${replacements.length}__`;
			replacements.push({ marker, text: print(name).trim(), target });
			return visitEachChild(current, (child) =>
				child === name ? createIdentifier(marker) : visit(child, local),
			);
		}
		return visitEachChild(current, (child) => visit(child, local));
	}

	// The printer determines occurrence positions. No source offset is reused for generated syntax.
	const marked = print(visit(node, new Set())).trim();
	const spans: ExcerptReference[] = [];
	let offset = 0;
	let reconstructed = "";
	for (const replacement of replacements) {
		const position = marked.indexOf(replacement.marker, offset);
		assert(position >= offset, "The compiler printer must preserve reference marker order.");
		reconstructed += marked.slice(offset, position);

		// Measure the span after restoring prior names: marker lengths differ from the names they replace.
		const start = reconstructed.length;
		reconstructed += replacement.text;
		spans.push({ start, end: reconstructed.length, target: replacement.target });
		offset = position + replacement.marker.length;
	}
	reconstructed += marked.slice(offset);

	// Fail if marker substitution affected formatting; otherwise the spans could annotate different text.
	assert.equal(
		reconstructed,
		text,
		"Excerpt tokens must preserve the compiler's printed text.",
	);
	return createCodeExcerpt(text, spans);
}

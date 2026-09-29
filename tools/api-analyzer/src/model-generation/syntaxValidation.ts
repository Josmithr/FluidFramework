import type { DeclarationSyntax, SyntaxRange } from "../analysis-types/declarationSyntax.js";

/**
 * Checks source boundaries without parsing declaration text or resolving references.
 * @param syntax - Shape-validated original source record.
 * @returns Whether all boundaries agree with the stored source and reference tokens.
 */
export function hasValidSyntaxRanges(syntax: DeclarationSyntax): boolean {
	const text = syntax.excerpt.tokens.map((token) => token.text).join("");
	const references: SyntaxRange[] = [];
	let offset = 0;
	for (const token of syntax.excerpt.tokens) {
		if (token.kind === "Reference") {
			references.push({ start: offset, end: offset + token.text.length });
		}
		offset += token.text.length;
	}
	const inBounds = (range: SyntaxRange): boolean =>
		range.start >= 0 && range.start <= range.end && range.end <= text.length;
	const outsideReference = (position: number): boolean =>
		!references.some((range) => range.start < position && position < range.end);
	const regions: SyntaxRange[] = [
		...syntax.modifiers.map((modifier) => ({
			start: modifier.range.start,
			end: modifier.trailingEnd,
		})),
		...syntax.comments.map((comment) => comment.range),
		...syntax.importTypes.map((imported) => imported.prefix),
	];
	if (
		syntax.excerpt.tokenRange.startIndex !== 0 ||
		syntax.excerpt.tokenRange.endIndex !== syntax.excerpt.tokens.length ||
		syntax.declarationStart >= text.length ||
		!outsideReference(syntax.declarationStart) ||
		syntax.modifiers.some(
			(modifier) =>
				!inBounds(modifier.range) ||
				modifier.range.end > modifier.trailingEnd ||
				text.slice(modifier.range.start, modifier.range.end) !== modifier.keyword ||
				!/^\s*$/.test(text.slice(modifier.range.end, modifier.trailingEnd)),
		) ||
		syntax.comments.some(
			(comment) =>
				!inBounds(comment.range) ||
				!text.slice(comment.range.start, comment.range.end).startsWith("/**") ||
				!text.slice(comment.range.start, comment.range.end).endsWith("*/") ||
				comment.privateRemarks.some(
					(range) =>
						!inBounds(range) ||
						range.start < comment.range.start ||
						range.end > comment.range.end,
				),
		) ||
		regions.some(
			(range) =>
				!inBounds(range) ||
				references.some(
					(reference) => reference.start < range.end && range.start < reference.end,
				) ||
				(range.start < syntax.declarationStart && syntax.declarationStart < range.end),
		)
	) {
		return false;
	}
	const ordered = [...regions].sort((left, right) => left.start - right.start);
	if (
		ordered.some((range, index) => index > 0 && range.start < (ordered[index - 1]?.end ?? 0))
	) {
		return false;
	}
	for (const comment of syntax.comments) {
		if (
			comment.privateRemarks.some(
				(range, index) =>
					index > 0 && range.start < (comment.privateRemarks[index - 1]?.end ?? 0),
			)
		) {
			return false;
		}
	}
	if (syntax.variable !== undefined) {
		const { list, binding } = syntax.variable;
		if (
			!inBounds(list) ||
			!inBounds(binding) ||
			binding.start < list.start ||
			binding.end > list.end ||
			![list.start, list.end, binding.start, binding.end].every(outsideReference)
		) {
			return false;
		}
	}
	const anonymousOffset = syntax.anonymousNameOffset;
	return (
		anonymousOffset === undefined ||
		(anonymousOffset >= syntax.declarationStart &&
			anonymousOffset <= text.length &&
			outsideReference(anonymousOffset) &&
			!regions.some((range) => range.start < anonymousOffset && anonymousOffset < range.end))
	);
}

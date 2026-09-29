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

	if (!hasValidSourceRanges(syntax, text, references, regions)) {
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

/**
 * Checks captured ranges against the original source text and reference tokens.
 *
 * @remarks
 * The excerpt must cover all tokens, and the declaration must start before the end of the text and outside reference interiors.
 * Each relocation range must match a whole reference token so an edit cannot split a name.
 * Each relocation range list must be ordered and must not overlap itself.
 * Modifier text must match its keyword and have only whitespace before its trailing boundary.
 * Comment ranges must have TSDoc delimiters and contain their private remarks.
 * Removable regions must stay within the text and must not overlap references or contain the declaration start.
 * Removing a reference would also remove its identity.
 * The caller checks overlap between removable regions, private-remark ordering, variable bindings, and anonymous-name offsets.
 *
 * @param syntax - Shape-validated original source record.
 * @param text - Concatenated text of all excerpt tokens.
 * @param references - Reference-token ranges in that text.
 * @param regions - Modifier ranges including trailing whitespace, comment ranges, and import prefixes.
 * @returns Whether these source checks pass. This does not validate all syntax boundaries.
 */
function hasValidSourceRanges(
	syntax: DeclarationSyntax,
	text: string,
	references: readonly SyntaxRange[],
	regions: readonly SyntaxRange[],
): boolean {
	const inBounds = (range: SyntaxRange): boolean =>
		range.start >= 0 && range.start <= range.end && range.end <= text.length;
	const outsideReference = (position: number): boolean =>
		!references.some((range) => range.start < position && position < range.end);

	// The excerpt must cover every token, and the declaration start must not split a reference.
	if (
		syntax.excerpt.tokenRange.startIndex !== 0 ||
		syntax.excerpt.tokenRange.endIndex !== syntax.excerpt.tokens.length ||
		syntax.declarationStart >= text.length ||
		!outsideReference(syntax.declarationStart)
	) {
		return false;
	}

	// Relocation edits must use whole references in source order without overlap in each list.
	if (
		[
			syntax.shorthandExports ?? [],
			syntax.moduleQueries ?? [],
			syntax.referencePaths?.map((reference) => reference.range) ?? [],
		].some((ranges) =>
			ranges.some(
				(range, index) =>
					!references.some(
						(reference) => reference.start === range.start && reference.end === range.end,
					) ||
					(index > 0 && range.start < (ranges[index - 1]?.end ?? 0)),
			),
		)
	) {
		return false;
	}

	// A modifier range must match its keyword; removal may include only trailing whitespace.
	if (
		syntax.modifiers.some(
			(modifier) =>
				!inBounds(modifier.range) ||
				modifier.range.end > modifier.trailingEnd ||
				text.slice(modifier.range.start, modifier.range.end) !== modifier.keyword ||
				!/^\s*$/.test(text.slice(modifier.range.end, modifier.trailingEnd)),
		)
	) {
		return false;
	}

	// Private remarks must stay inside a comment with complete TSDoc delimiters.
	if (
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
		)
	) {
		return false;
	}

	// Removing a region must not erase a reference or contain the declaration start.
	if (
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
	return true;
}

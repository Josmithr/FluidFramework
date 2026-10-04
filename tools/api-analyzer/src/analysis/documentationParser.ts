import {
	DocBlock,
	DocExcerpt,
	type DocNode,
	type TextRange,
	type TSDocParser,
} from "@microsoft/tsdoc";
import type { SyntaxRange } from "../analysis-types/declarationSyntax.js";

/**
 * Parses user-facing documentation without analyzing private sections.
 *
 * @remarks
 * Uses the official parser to locate private blocks, then blanks their content before semantic parsing.
 * Preserves offsets, public blocks, and global modifier tags.
 * Repeats for duplicate private blocks because TSDoc retains only the last such block.
 * Comments without private blocks require only one parse.
 *
 * @param parser - Parser configured with the invocation's tag vocabulary.
 * @param text - Original comment, which is not modified.
 * @returns Parser output containing only user-facing documentation and its diagnostics.
 */
export function parseDocumentation(
	parser: TSDocParser,
	text: string,
): ReturnType<TSDocParser["parseString"]> {
	return parseDocumentationWithRanges(parser, text).parsed;
}

/**
 * Captures private source ranges and parses the remaining user-facing documentation.
 * @param parser - Parser configured with the invocation's tag vocabulary.
 * @param text - Original comment, which is not modified.
 * @returns Semantic parser output and private ranges in the original source coordinates.
 */
export function parseDocumentationWithRanges(
	parser: TSDocParser,
	text: string,
): {
	/**
	 * Parser output with private content excluded.
	 */
	readonly parsed: ReturnType<TSDocParser["parseString"]>;

	/**
	 * Private content ranges, excluding comment delimiters and global modifier tags.
	 */
	readonly privateRemarks: readonly SyntaxRange[];
} {
	const privateRemarks: SyntaxRange[] = [];
	let visibleText = text;
	let result = parser.parseString(text);
	while (result.docComment.privateRemarks !== undefined) {
		const ranges = getPrivateSectionRanges(result, result.docComment.privateRemarks);
		for (const range of ranges.reverse()) {
			visibleText =
				visibleText.slice(0, range.start) +
				" ".repeat(range.end - range.start) +
				visibleText.slice(range.end);
		}
		privateRemarks.push(...ranges);
		result = parser.parseString(visibleText);
	}
	return { parsed: result, privateRemarks };
}

/**
 * Locates private content, including inline tags hoisted to the comment root by TSDoc.
 * @param parsed - Official parser output with original source positions.
 * @param privateBlock - The private block retained by the parser.
 * @returns Private source ranges excluding comment trivia and global modifier tags.
 */
function getPrivateSectionRanges(
	parsed: ReturnType<TSDocParser["parseString"]>,
	privateBlock: DocBlock,
): SyntaxRange[] {
	const start = getDocumentationStart(privateBlock.blockTag);
	const end = Math.min(
		parsed.lines.at(-1)?.end ?? parsed.sourceRange.end,
		...getDocumentationBlockStarts(parsed.docComment).filter((position) => position > start),
	);
	const preserved = parsed.docComment.modifierTagSet.nodes
		.flatMap(getDocumentationRanges)
		.sort((left, right) => left.pos - right.pos);
	const ranges: SyntaxRange[] = [];
	for (const line of parsed.lines) {
		let position = Math.max(start, line.pos);
		const limit = Math.min(end, line.end);
		for (const modifier of preserved) {
			if (modifier.pos >= limit || modifier.end <= position) {
				continue;
			}
			if (modifier.pos > position) {
				ranges.push({ start: position, end: modifier.pos });
			}
			position = modifier.end;
		}
		if (position < limit) {
			ranges.push({ start: position, end: limit });
		}
	}
	return ranges;
}

/**
 * Finds block boundaries, including parameter blocks nested in TSDoc collections.
 * @param node - Parsed documentation subtree.
 * @returns Original block-tag offsets in traversal order.
 */
function getDocumentationBlockStarts(node: DocNode): number[] {
	return node instanceof DocBlock
		? [getDocumentationStart(node.blockTag)]
		: node.getChildNodes().flatMap(getDocumentationBlockStarts);
}

/**
 * Finds the first source excerpt in a parsed documentation node.
 * @param node - Node with source excerpts from the official parser.
 * @returns The first source offset, or infinity for a synthetic node without excerpts.
 */
function getDocumentationStart(node: DocNode): number {
	return Math.min(...getDocumentationRanges(node).map((range) => range.pos));
}

/**
 * Collects the original source ranges of a documentation node.
 * @param node - Parsed documentation node.
 * @returns Source ranges of its excerpts, in traversal order.
 */
function getDocumentationRanges(node: DocNode): TextRange[] {
	return node instanceof DocExcerpt
		? [node.content.getContainingTextRange()]
		: node.getChildNodes().flatMap(getDocumentationRanges);
}

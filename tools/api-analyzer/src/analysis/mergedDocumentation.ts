import {
	DocBlock,
	DocParamBlock,
	type DocComment,
	type DocSection,
	type TSDocParser,
} from "@microsoft/tsdoc";

/**
 * Combines declaration comments in compiler order using IntelliSense-style content selection.
 *
 * @remarks
 * Equal summaries and equal tag contributions retain their first occurrence and its original nodes.
 * Distinct summaries and block content are appended; modifier tags are a deduplicated union.
 * New containers own the combined content without mutating the original comments.
 * Release conflicts are validated separately against all original declarations.
 *
 * @param parser - Parser with the invocation's configured tag vocabulary.
 * @param comments - Valid original comments in compiler declaration order.
 * @param includeInheritance - Retain a single inheritance request. Defaults to true; false builds metadata-only merge inputs before per-contribution resolution.
 * @returns Combined documentation, or undefined when distinct inheritance requests cannot be represented.
 */
export function mergeDocumentationComments(
	parser: TSDocParser,
	comments: readonly DocComment[],
	includeInheritance = true,
): DocComment | undefined {
	const result = parser.parseString("/** */").docComment;
	const summaries = new Set<string>();
	const blocks = new Map<string, DocBlock>();
	const contributions = new Map<string, Set<string>>();
	let inheritance: string | undefined;
	for (const comment of comments) {
		appendDistinctSection(parser, result.summarySection, comment.summarySection, summaries);
		for (const tag of comment.modifierTagSet.nodes) {
			result.modifierTagSet.addTag(tag);
		}
		if (includeInheritance && comment.inheritDocTag !== undefined) {
			const reference = comment.inheritDocTag.declarationReference?.emitAsTsdoc() ?? "";
			if (inheritance !== undefined && reference !== inheritance) {
				return undefined;
			}
			inheritance = reference;
			result.inheritDocTag ??= comment.inheritDocTag;
		}
		for (const block of [
			...comment.getChildNodes().filter((node): node is DocBlock => node instanceof DocBlock),
			...comment.params,
			...comment.typeParams,
		]) {
			const key = JSON.stringify([
				block.blockTag.tagNameWithUpperCase,
				block instanceof DocParamBlock ? block.parameterName : undefined,
			]);
			const seen = contributions.get(key) ?? new Set<string>();
			contributions.set(key, seen);
			const repeated =
				comment.customBlocks.includes(block) || comment.seeBlocks.includes(block);
			let target = repeated ? undefined : blocks.get(key);
			if (target === undefined) {
				target =
					block instanceof DocParamBlock
						? new DocParamBlock({
								configuration: result.configuration,
								blockTag: block.blockTag,
								parameterName: block.parameterName,
							})
						: new DocBlock({ configuration: result.configuration, blockTag: block.blockTag });
				if (!appendDistinctSection(parser, target.content, block.content, seen)) {
					continue;
				}
				blocks.set(key, target);
				attachDocumentationBlock(result, target);
			} else {
				appendDistinctSection(parser, target.content, block.content, seen);
			}
		}
	}
	return result;
}

/**
 * Attaches a new block to the category defined by its tag.
 *
 * @param target - Invocation-owned combined comment.
 * @param block - New block whose children retain original source nodes.
 */
function attachDocumentationBlock(target: DocComment, block: DocBlock): void {
	switch (block.blockTag.tagNameWithUpperCase) {
		case "@REMARKS": {
			target.remarksBlock = block;
			break;
		}
		case "@RETURNS": {
			target.returnsBlock = block;
			break;
		}
		case "@DEPRECATED": {
			target.deprecatedBlock = block;
			break;
		}
		case "@PRIVATEREMARKS": {
			target.privateRemarks = block;
			break;
		}
		case "@SEE": {
			// TSDoc 0.16 has no public see-block mutator; preserve its category and link traversal order.
			target._appendSeeBlock(block);
			break;
		}
		default: {
			if (block instanceof DocParamBlock) {
				(block.blockTag.tagNameWithUpperCase === "@TYPEPARAM"
					? target.typeParams
					: target.params
				).add(block);
			} else {
				target.appendCustomBlock(block);
			}
		}
	}
}

/**
 * Appends a distinct source section without changing its original nodes or reference scope.
 *
 * @param parser - Configured parser used to normalize section text for comparison.
 * @param target - Invocation-owned section receiving the original child nodes.
 * @param source - Original section whose content is compared as one contribution.
 * @param seen - Normalized contributions already appended to this target.
 * @returns Whether this contribution was new, including a first empty tag contribution.
 */
function appendDistinctSection(
	parser: TSDocParser,
	target: DocSection,
	source: DocSection,
	seen: Set<string>,
): boolean {
	const comparison = parser.parseString("/** */").docComment;
	comparison.summarySection = source;
	const text = comparison.emitAsTsdoc();
	if (seen.has(text)) {
		return false;
	}
	seen.add(text);
	target.appendNodes(source.nodes);
	return true;
}

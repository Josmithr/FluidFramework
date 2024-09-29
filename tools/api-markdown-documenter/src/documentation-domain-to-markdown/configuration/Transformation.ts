/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	Break as MdastBreak,
	RootContent as MdastRootContent,
	ThematicBreak as MdastThematicBreak,
} from "mdast";
import {
	DocumentationNodeType,
	type DocumentationNode,
	type BlockQuoteNode,
	type CodeSpanNode,
	type FencedCodeBlockNode,
	type HeadingNode,
	type LinkNode,
	type SectionNode,
	type OrderedListNode,
	type ParagraphNode,
	type PlainTextNode,
	type SpanNode,
	type TableCellNode,
	type TableNode,
	type TableRowNode,
	type UnorderedListNode,
} from "../../documentation-domain/index.js";
import {
	blockQuoteToMarkdown,
	codeSpanToMarkdown,
	fencedCodeBlockToMarkdown,
	headingToMarkdown,
	sectionToMarkdown,
	linkToMarkdown,
	orderedListToMarkdown,
	paragraphToMarkdown,
	plainTextToMarkdown,
	spanToMarkdown,
	tableToMarkdown,
	tableCellToMarkdown,
	tableRowToMarkdown,
	unorderedListToMarkdown,
} from "../default-transformations/index.js";
import type { TransformationContext } from "../TransformationContext.js";

/**
 * Markdown AST content.
 *
 * @public
 */
export type MdastTree = MdastRootContent | MdastRootContent[];

/**
 * Configuration for transforming {@link DocumentationNode}s to {@link https://github.com/syntax-tree/mdast | mdast},
 * specified by {@link DocumentationNode."type"}.
 *
 * @remarks
 *
 * The system supplies a suite of default transformations for all nodes of types {@link DocumentationNodeType}.
 * For any other custom {@link DocumentationNode}s, transformations must be specified or the system will throw an error
 * when handling an unknown node kind.
 *
 * @public
 */
// Prefer index signature for documentation, since it allows documenting the key name.
// eslint-disable-next-line @typescript-eslint/consistent-indexed-object-style
export interface Transformations {
	/**
	 * Maps from a {@link DocumentationNode}'s {@link DocumentationNode."type"} to a transformation implementation
	 * for that kind of node.
	 */
	[documentationNodeKind: string]: Transformation;
}

/**
 * Transformation from a {@link DocumentationNode} to a {@link https://github.com/syntax-tree/mdast | Markdown syntax tree}.
 *
 * @param node - The input node to be transformed.
 * @param context - Transformation context, including custom transformation implementations.
 *
 * @public
 */
export type Transformation = (node: DocumentationNode, context: TransformationContext) => MdastTree;

// Constants used in transformations below as an allocation optimization.
const mdastLineBreak: MdastBreak = { type: "break" };
const mdastHorizontalRule: MdastThematicBreak = { type: "thematicBreak" };

/**
 * Default {@link DocumentationNode} to {@link https://github.com/syntax-tree/mdast | mdast} transformations.
 */
export const defaultTransformations: Transformations = {
	[DocumentationNodeType.BlockQuote]: (node, context) =>
		blockQuoteToMarkdown(node as BlockQuoteNode, context),
	[DocumentationNodeType.CodeSpan]: (node, context) =>
		codeSpanToMarkdown(node as CodeSpanNode, context),
	[DocumentationNodeType.FencedCode]: (node, context) =>
		fencedCodeBlockToMarkdown(node as FencedCodeBlockNode, context),
	[DocumentationNodeType.Heading]: (node, context) =>
		headingToMarkdown(node as HeadingNode, context),
	[DocumentationNodeType.LineBreak]: () => mdastLineBreak,
	[DocumentationNodeType.Link]: (node, context) => linkToMarkdown(node as LinkNode, context),
	[DocumentationNodeType.Section]: (node, context) =>
		sectionToMarkdown(node as SectionNode, context),
	[DocumentationNodeType.HorizontalRule]: () => mdastHorizontalRule,
	[DocumentationNodeType.OrderedList]: (node, context) =>
		orderedListToMarkdown(node as OrderedListNode, context),
	[DocumentationNodeType.Paragraph]: (node, context) =>
		paragraphToMarkdown(node as ParagraphNode, context),
	[DocumentationNodeType.PlainText]: (node, context) =>
		plainTextToMarkdown(node as PlainTextNode, context),
	[DocumentationNodeType.Span]: (node, context) => spanToMarkdown(node as SpanNode, context),
	[DocumentationNodeType.Table]: (node, context) => tableToMarkdown(node as TableNode, context),
	[DocumentationNodeType.TableCell]: (node, context) =>
		tableCellToMarkdown(node as TableCellNode, context),
	[DocumentationNodeType.TableRow]: (node, context) =>
		tableRowToMarkdown(node as TableRowNode, context),
	[DocumentationNodeType.UnorderedList]: (node, context) =>
		unorderedListToMarkdown(node as UnorderedListNode, context),
};

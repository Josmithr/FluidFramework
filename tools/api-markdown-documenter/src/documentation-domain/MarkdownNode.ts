/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { Root as MdastRoot } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { DocumentationLiteralNodeBase, type DocumentationNode } from "./DocumentationNode";
import { DocumentationNodeType } from "./DocumentationNodeType";

/**
 * Plain text.
 *
 * @remarks
 *
 * Must not contain any line breaks.
 *
 * To include line breaks in your text, use {@link LineBreakNode} in a container node like
 * {@link SpanNode} or {@link ParagraphNode}.
 *
 * @public
 */
export class MarkdownNode
	extends DocumentationLiteralNodeBase<MdastRoot>
	implements DocumentationNode
{
	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	public readonly type = DocumentationNodeType.Markdown;

	/**
	 * {@inheritDoc DocumentationNode.singleLine}
	 */
	public readonly singleLine: boolean;

	public constructor(rawMarkdown: string) {
		const mdastRoot = fromMarkdown(rawMarkdown);
		super(mdastRoot);

		// TODO: verify this
		this.singleLine = !rawMarkdown.includes("\n\n");
	}
}

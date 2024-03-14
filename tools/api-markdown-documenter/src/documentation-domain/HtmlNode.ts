/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
	type MultiLineDocumentationNode,
	DocumentationParentNodeBase,
	type DocumentationNode,
} from "./DocumentationNode.js";
import { DocumentationNodeType } from "./DocumentationNodeType.js";

/**
 * {@link HtmlNode} {@link DocumentationNode.data}.
 *
 * @public
 */
export interface HtmlNodeProperties {
	tag: string;
	attributes: readonly string[]; // TODO: Can we reduce this to a record or something more fine grained?
}

/**
 * A grouping of text content, potentially spanning multiple lines.
 *
 * @example Markdown
 *
 * ```md
 * Some content...
 *
 * Some more content...
 *
 * ```
 *
 * Note that a paragraph in Markdown will always include a trailing newline.
 *
 * @example HTML
 *
 * ```html
 * <p>
 * 	Some content...
 *
 * 	Some more content...
 * </p>
 * ```
 *
 * @public
 */
export class HtmlNode
	extends DocumentationParentNodeBase<DocumentationNode, HtmlNodeProperties>
	implements MultiLineDocumentationNode<HtmlNodeProperties>, HtmlNodeProperties
{
	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	public readonly type = DocumentationNodeType.Html;

	/**
	 * {@inheritDoc DocumentationNode.singleLine}
	 */
	public override get singleLine(): false {
		return false;
	}

	/**
	 * {@inheritDoc HtmlNodeProperties.tag}
	 */
	public get tag(): string {
		return this.data.tag;
	}

	/**
	 * {@inheritDoc HtmlNodeProperties.attributes}
	 */
	public get attributes(): readonly string[] {
		return this.data.attributes;
	}

	public constructor(children: DocumentationNode[], data: HtmlNodeProperties) {
		super(children, data);
	}
}

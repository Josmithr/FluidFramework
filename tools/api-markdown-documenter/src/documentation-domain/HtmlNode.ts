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
 * {@link HtmlSpanNode} {@link DocumentationNode.data}.
 *
 * @public
 */
export interface HtmlSpanProperties {
	/**
	 * The HTML tag name.
	 *
	 * @example
	 * "div" for a "<div>...</div>" tree.
	 */
	tag: string;
	/**
	 * TODO (include format)
	 */
	attributes: readonly string[];
}

/**
 * TODO
 *
 * @public
 */
export class HtmlSpanNode
	extends DocumentationParentNodeBase<DocumentationNode, HtmlSpanProperties>
	implements MultiLineDocumentationNode<HtmlSpanProperties>, HtmlSpanProperties
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
	 * {@inheritDoc HtmlSpanProperties.tag}
	 */
	public get tag(): string {
		return this.data.tag;
	}

	/**
	 * {@inheritDoc HtmlSpanProperties.attributes}
	 */
	public get attributes(): readonly string[] {
		return this.data.attributes;
	}

	public constructor(children: DocumentationNode[], data: HtmlSpanProperties) {
		super(children, data);
	}
}

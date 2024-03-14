/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
	type DocumentationNode,
	DocumentationParentNodeBase,
	type MultiLineDocumentationNode,
} from "./DocumentationNode.js";
import { DocumentationNodeType } from "./DocumentationNodeType.js";

/**
 * {@link EmbeddedHtmlSpanNode} {@link DocumentationNode.data}.
 *
 * @public
 */
export interface EmbeddedHtmlSpanProperties {
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
export class EmbeddedHtmlSpanNode
	extends DocumentationParentNodeBase<DocumentationNode, EmbeddedHtmlSpanProperties>
	implements MultiLineDocumentationNode<EmbeddedHtmlSpanProperties>, EmbeddedHtmlSpanProperties
{
	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	public readonly type = DocumentationNodeType.EmbeddedHtmlSpan;

	/**
	 * {@inheritDoc DocumentationNode.singleLine}
	 */
	public override get singleLine(): false {
		return false;
	}

	/**
	 * {@inheritDoc EmbeddedHtmlSpanProperties.tag}
	 */
	public get tag(): string {
		return this.data.tag;
	}

	/**
	 * {@inheritDoc EmbeddedHtmlSpanProperties.attributes}
	 */
	public get attributes(): readonly string[] {
		return this.data.attributes;
	}

	public constructor(children: DocumentationNode[], data: EmbeddedHtmlSpanProperties) {
		super(children, data);
	}
}

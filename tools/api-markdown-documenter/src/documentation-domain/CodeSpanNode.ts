/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	DocumentationLiteralNodeBase,
	type SingleLineDocumentationNode,
} from "./DocumentationNode.js";
import { DocumentationNodeType } from "./DocumentationNodeType.js";

/**
 * Represents a simple, single-line code span.
 *
 * @example Markdown
 *
 * ```md
 * `Foo`
 * ```
 *
 * @example HTML
 *
 * ```html
 * <code>Foo</code>
 * ```
 *
 * @public
 */
export class CodeSpanNode
	extends DocumentationLiteralNodeBase<string>
	implements SingleLineDocumentationNode
{
	/**
	 * Static singleton representing an empty Code Span node.
	 */
	public static readonly Empty: CodeSpanNode = new CodeSpanNode("");

	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	public readonly type = DocumentationNodeType.CodeSpan;

	/**
	 * {@inheritDoc DocumentationNode.singleLine}
	 */
	public readonly singleLine = true;

	/**
	 * {@inheritDoc DocumentationNode.isEmpty}
	 */
	public get isEmpty(): boolean {
		return this.value.length === 0;
	}

	public constructor(text: string) {
		super(text);
	}
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	DocumentationLiteralNodeBase,
	type MultiLineDocumentationNode,
} from "./DocumentationNode.js";
import { DocumentationNodeType } from "./DocumentationNodeType.js";

/**
 * A fenced code block, with an optional associated code language.
 *
 * @example Markdown
 *
 * ```md
 * \`\`\`typescript
 * const foo = "bar";
 * \`\`\`
 * ```
 *
 * @example HTML
 *
 * ```html
 * <code>
 * 	const foo = "bar";
 * </code>
 * ```
 *
 * @public
 */
export class FencedCodeBlockNode
	extends DocumentationLiteralNodeBase<string>
	implements MultiLineDocumentationNode
{
	/**
	 * {@inheritDoc DocumentationNode."type"}
	 */
	public readonly type = DocumentationNodeType.FencedCode;

	/**
	 * (optional) Code language to associated with the code block.
	 */
	public readonly language?: string;

	/**
	 * {@inheritDoc DocumentationNode.singleLine}
	 */
	public readonly singleLine = false;

	/**
	 * {@inheritDoc DocumentationNode.isEmpty}
	 */
	public get isEmpty(): boolean {
		return this.value.length === 0;
	}

	public constructor(value: string, language?: string) {
		super(value);
		this.language = language;
	}
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { InlineCode } from "mdast";
import { inlineCode } from "mdast-builder";

import type { CodeSpanNode } from "../../index.js";
import type { TransformationContext } from "../TransformationContext.js";

/**
 * Transform a {@link BlockQuoteNode} to HTML.
 *
 * @param node - The node to render.
 * @param context - See {@link TransformationContext}.
 */
export function codeSpanToMarkdown(node: CodeSpanNode, context: TransformationContext): InlineCode {
	return inlineCode(node.value) as InlineCode;
}

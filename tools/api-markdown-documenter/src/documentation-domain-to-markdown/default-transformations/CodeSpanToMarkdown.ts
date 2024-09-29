/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { InlineCode as MdastInlineCode } from "mdast";
import { inlineCode } from "mdast-builder";

import type { CodeSpanNode } from "../../index.js";
import type { TransformationContext } from "../TransformationContext.js";
import { applyFormatting } from "./Utilities.js";
import type { MdastTree } from "../configuration/index.js";

/**
 * Transform a {@link BlockQuoteNode} to Markdown.
 *
 * @param node - The node to render.
 * @param context - See {@link TransformationContext}.
 */
export function codeSpanToMarkdown(node: CodeSpanNode, context: TransformationContext): MdastTree {
	const transformed = inlineCode(node.value) as MdastInlineCode;

	// Code spans can have formatting in Markdown, so we need to apply it here.
	return applyFormatting(transformed, context);
}

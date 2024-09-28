/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Blockquote } from "mdast";
import { blockquote } from "mdast-builder";

import type { BlockQuoteNode } from "../../index.js";
import type { TransformationContext } from "../TransformationContext.js";
import { documentationNodesToMarkdown } from "../ToMarkdown.js";

/**
 * Transform a {@link BlockQuoteNode} to HTML.
 *
 * @param node - The node to render.
 * @param context - See {@link TransformationContext}.
 */
export function blockQuoteToMarkdown(
	node: BlockQuoteNode,
	context: TransformationContext,
): Blockquote {
	const transformedChildren = documentationNodesToMarkdown(node.children, context);
	return blockquote(transformedChildren) as Blockquote;
}

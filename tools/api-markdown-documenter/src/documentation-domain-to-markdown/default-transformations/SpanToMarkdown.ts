/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { RootContent as MdastTree, Delete, Emphasis, Strong } from "mdast";

import type { SpanNode } from "../../documentation-domain/index.js";
import type { TransformationContext } from "../TransformationContext.js";
import { documentationNodesToMarkdown } from "../ToMarkdown.js";
import { emphasis, strike, strong } from "mdast-builder";

/**
 * Transform a {@link SpanNode} to HTML.
 *
 * @param node - The node to render.
 * @param context - See {@link TransformationContext}.
 */
export function spanToMarkdown(
	node: SpanNode,
	context: TransformationContext,
): MdastTree | MdastTree[] {
	const transformedChildren = documentationNodesToMarkdown(node.children, context);

	if (node.textFormatting === undefined) {
		return transformedChildren;
	}

	let result: MdastTree | MdastTree[] = transformedChildren;

	// The ordering in which we wrap here is effectively arbitrary, but impacts the order of the tags in the output.
	// Note if you're editing: tests may implicitly rely on this ordering.
	if (node.textFormatting.strikethrough === true) {
		result = strike(result) as Delete;
	}
	if (node.textFormatting.italic === true) {
		result = emphasis(result) as Emphasis;
	}
	if (node.textFormatting.bold === true) {
		result = strong(result) as Strong;
	}

	return result;
}

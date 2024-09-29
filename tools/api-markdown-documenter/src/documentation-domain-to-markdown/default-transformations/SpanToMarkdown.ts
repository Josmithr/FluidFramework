/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { RootContent as MdastTree } from "mdast";

import type { SpanNode } from "../../documentation-domain/index.js";
import type { TransformationContext } from "../TransformationContext.js";
import { documentationNodesToMarkdown } from "../ToMarkdown.js";

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
	const childContext = { ...context, ...node.textFormatting };
	return documentationNodesToMarkdown(node.children, childContext);
}

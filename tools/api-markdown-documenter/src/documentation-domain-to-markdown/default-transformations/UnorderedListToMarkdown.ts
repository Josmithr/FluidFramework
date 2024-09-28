/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { List } from "mdast";

import type { UnorderedListNode } from "../../documentation-domain/index.js";
import type { TransformationContext } from "../TransformationContext.js";
import { transformListChildren } from "./Utilities.js";

/**
 * Transform a {@link UnorderedListNode} to HTML.
 *
 * @param node - The node to render.
 * @param context - See {@link TransformationContext}.
 */
export function unorderedListToMarkdown(
	node: UnorderedListNode,
	context: TransformationContext,
): List {
	const transformedChildren = transformListChildren(node.children, context);
	return {
		type: "list",
		ordered: false,
		children: transformedChildren,
	};
}

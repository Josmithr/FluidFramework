/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { List as MdastList } from "mdast";

import type { OrderedListNode } from "../../documentation-domain/index.js";
import type { TransformationContext } from "../TransformationContext.js";
import { transformListChildren } from "./Utilities.js";

/**
 * Transform a {@link OrderedListNode} to HTML.
 *
 * @param node - The node to render.
 * @param context - See {@link TransformationContext}.
 */
export function orderedListToMarkdown(
	node: OrderedListNode,
	context: TransformationContext,
): MdastList {
	const transformedChildren = transformListChildren(node.children, context);
	return {
		type: "list",
		ordered: true,
		children: transformedChildren,
	};
}

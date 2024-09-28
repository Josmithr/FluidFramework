/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Link as MdastLink } from "mdast";
import type { LinkNode } from "../../documentation-domain/index.js";
import type { TransformationContext } from "../TransformationContext.js";
import { documentationNodesToMarkdown } from "../ToMarkdown.js";
import { link } from "mdast-builder";

/**
 * Transforms a {@link LinkNode} to Markdown.
 *
 * @param node - The node to render.
 * @param context - See {@link TransformationContext}.
 */
export function linkToMarkdown(node: LinkNode, context: TransformationContext): MdastLink {
	const transformedChildren = documentationNodesToMarkdown(node.children, context);
	return link(node.target, undefined, transformedChildren) as MdastLink;
}

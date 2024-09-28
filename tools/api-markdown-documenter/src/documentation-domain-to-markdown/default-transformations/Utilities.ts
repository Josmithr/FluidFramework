/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ListItem as MdastListItem } from "mdast";

import type { DocumentationNode } from "../../documentation-domain/index.js";
import type { TransformationContext } from "../TransformationContext.js";
import { documentationNodeToMarkdown } from "../ToMarkdown.js";
import { listItem } from "mdast-builder";

/**
 * Transforms a list of {@link DocumentationNode}s under a List into a series of {@link MdastListItem}.
 */
export function transformListChildren(
	children: DocumentationNode[],
	context: TransformationContext,
): MdastListItem[] {
	return children.map((child) => {
		return listItem(documentationNodeToMarkdown(child, context)) as MdastListItem;
	});
}

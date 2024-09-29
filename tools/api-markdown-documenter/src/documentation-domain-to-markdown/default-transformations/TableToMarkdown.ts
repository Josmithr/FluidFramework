/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Table as MdastTable, RootContent as MdastRootContent } from "mdast";
import type { TableNode } from "../../documentation-domain/index.js";
import type { TransformationContext } from "../TransformationContext.js";
import { table } from "mdast-builder";
import { documentationNodesToMarkdown, documentationNodeToMarkdown } from "../ToMarkdown.js";

/**
 * Transform a {@link TableNode} to HTML.
 *
 * @param node - The node to render.
 * @param context - See {@link TransformationContext}.
 *
 * @remarks Will render as HTML when in an HTML context, or within another table context.
 */
export function tableToMarkdown(node: TableNode, context: TransformationContext): MdastTable {
	const transformedChildren: MdastRootContent[] = [];
	if (node.headerRow === undefined) {
		throw new Error("TableNode must have a header row in order to be converted to MDAST.");
	}

	// MDAST tables require a header row.
	// TODO: I guess our tables should require headers too? All of the production code provides one already.
	transformedChildren.push(...documentationNodeToMarkdown(node.headerRow, context));

	if (node.children.length > 0) {
		transformedChildren.push(...documentationNodesToMarkdown(node.children, context));
	}

	const output = table(undefined, transformedChildren) as MdastTable;
	// mdast-builder likes to explicitly set the `align` property to `null` when it's not provided.
	// But this makes testing annoying, so we'll remove it.
	// If we ever add alignment support in the future, we'll need to not do this.
	delete output.align;
	return output;
}

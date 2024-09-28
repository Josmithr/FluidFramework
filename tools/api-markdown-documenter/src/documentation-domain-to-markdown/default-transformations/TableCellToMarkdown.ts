/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TableCell as MdastTableCell } from "mdast";
import { type TableCellNode } from "../../documentation-domain/index.js";
import type { TransformationContext } from "../TransformationContext.js";
import { documentationNodesToMarkdown } from "../ToMarkdown.js";
import { tableCell } from "mdast-builder";

/**
 * Transform a {@link TableCellNode} to HTML.
 *
 * @param node - The node to render.
 * @param context - See {@link TransformationContext}.
 */
export function tableCellToMarkdown(
	node: TableCellNode,
	context: TransformationContext,
): MdastTableCell {
	const transformedChildren = documentationNodesToMarkdown(node.children, context);
	return tableCell(transformedChildren) as MdastTableCell;
}

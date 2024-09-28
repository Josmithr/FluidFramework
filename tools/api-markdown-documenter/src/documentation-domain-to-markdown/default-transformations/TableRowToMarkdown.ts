/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { TableRow as MdastTableRow } from "mdast";

import type { TableRowNode } from "../../documentation-domain/index.js";
import type { TransformationContext } from "../TransformationContext.js";
import { tableRow } from "mdast-builder";
import { documentationNodesToMarkdown } from "../ToMarkdown.js";

/**
 * Transform a {@link TableRowNode} to HTML.
 *
 * @param node - The node to render.
 * @param context - See {@link TransformationContext}.
 */
export function tableRowToMarkdown(
	node: TableRowNode,
	context: TransformationContext,
): MdastTableRow {
	const transformedChildren = documentationNodesToMarkdown(node.children, context);
	return tableRow(transformedChildren) as MdastTableRow;
}

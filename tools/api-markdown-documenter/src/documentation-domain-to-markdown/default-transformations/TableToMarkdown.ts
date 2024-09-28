/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	Table as MdastTable,
	RootContent as MdastRootContent,
	TableCell,
	TableRow,
} from "mdast";
import type { TableNode } from "../../documentation-domain/index.js";
import type { TransformationContext } from "../TransformationContext.js";
import { table } from "mdast-builder";
import { documentationNodesToMarkdown, documentationNodeToMarkdown } from "../ToMarkdown.js";

/**
 * A cell containing separator string, used to separate table header rows from body rows.
 */
export const tableSeparatorRowCell: TableCell = {
	type: "tableCell",
	children: [{ type: "text", value: "---" }],
};

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
	if (node.headerRow !== undefined) {
		transformedChildren.push(...documentationNodeToMarkdown(node.headerRow, context));

		// Mdast doesn't support a formal "header row" concept.
		// To separate a header from the body, we need to push a row of separator cells.
		const headerRowLength = node.headerRow.children.length;
		const separatorRowCells: TableCell[] = Array.from(
			{ length: headerRowLength },
			() => tableSeparatorRowCell,
		);
		const separatorRow: TableRow = {
			type: "tableRow",
			children: separatorRowCells,
		};
		transformedChildren.push(separatorRow);
	}

	if (node.children.length > 0) {
		transformedChildren.push(...documentationNodesToMarkdown(node.children, context));
	}

	return table(undefined, transformedChildren) as MdastTable;
}

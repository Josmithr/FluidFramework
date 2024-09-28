/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Table as MdastTable, TableCell as MdastTableCell } from "mdast";
import {
	TableBodyCellNode,
	TableBodyRowNode,
	TableHeaderCellNode,
	TableHeaderRowNode,
	TableNode,
} from "../../documentation-domain/index.js";
import { assertTransformation } from "./Utilities.js";

const headerSeparatorCell: MdastTableCell = {
	type: "tableCell",
	children: [{ type: "text", value: "---" }],
};

describe("Table to Markdown transformation tests", () => {
	it("Empty table", () => {
		assertTransformation(TableNode.Empty, { type: "table", children: [] });
	});

	it("Simple table without header", () => {
		const input = new TableNode([
			new TableBodyRowNode([
				TableBodyCellNode.createFromPlainText("Cell 1A"),
				TableBodyCellNode.createFromPlainText("Cell 1B"),
				TableBodyCellNode.createFromPlainText("Cell 1C"),
			]),
			new TableBodyRowNode([
				TableBodyCellNode.createFromPlainText("Cell 2A"),
				TableBodyCellNode.createFromPlainText("Cell 2B"),
			]),
		]);

		const expected: MdastTable = {
			type: "table",
			children: [
				{
					type: "tableRow",
					children: [
						{ type: "tableCell", children: [{ type: "text", value: "Cell 1A" }] },
						{ type: "tableCell", children: [{ type: "text", value: "Cell 1B" }] },
						{ type: "tableCell", children: [{ type: "text", value: "Cell 1C" }] },
					],
				},
				{
					type: "tableRow",
					children: [
						{ type: "tableCell", children: [{ type: "text", value: "Cell 2A" }] },
						{ type: "tableCell", children: [{ type: "text", value: "Cell 2B" }] },
					],
				},
			],
		};

		assertTransformation(input, expected);
	});

	it("Simple table with header", () => {
		const input = new TableNode(
			[
				new TableBodyRowNode([
					TableBodyCellNode.createFromPlainText("Cell 1A"),
					TableBodyCellNode.createFromPlainText("Cell 1B"),
				]),
				new TableBodyRowNode([
					TableBodyCellNode.createFromPlainText("Cell 2A"),
					TableBodyCellNode.createFromPlainText("Cell 2B"),
					TableBodyCellNode.createFromPlainText("Cell 2C"),
				]),
			],
			/* headingRow: */ new TableHeaderRowNode([
				TableHeaderCellNode.createFromPlainText("Header A"),
				TableHeaderCellNode.createFromPlainText("Header B"),
				TableHeaderCellNode.createFromPlainText("Header C"),
			]),
		);

		const expected: MdastTable = {
			type: "table",
			children: [
				{
					type: "tableRow",
					children: [
						{ type: "tableCell", children: [{ type: "text", value: "Header A" }] },
						{ type: "tableCell", children: [{ type: "text", value: "Header B" }] },
						{ type: "tableCell", children: [{ type: "text", value: "Header C" }] },
					],
				},
				{
					type: "tableRow",
					children: [headerSeparatorCell, headerSeparatorCell, headerSeparatorCell],
				},
				{
					type: "tableRow",
					children: [
						{ type: "tableCell", children: [{ type: "text", value: "Cell 1A" }] },
						{ type: "tableCell", children: [{ type: "text", value: "Cell 1B" }] },
					],
				},
				{
					type: "tableRow",
					children: [
						{ type: "tableCell", children: [{ type: "text", value: "Cell 2A" }] },
						{ type: "tableCell", children: [{ type: "text", value: "Cell 2B" }] },
						{ type: "tableCell", children: [{ type: "text", value: "Cell 2C" }] },
					],
				},
			],
		};

		assertTransformation(input, expected);
	});
});

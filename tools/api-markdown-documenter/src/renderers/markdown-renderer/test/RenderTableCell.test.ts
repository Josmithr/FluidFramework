/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { expect } from "chai";

import {
	ParagraphNode,
	PlainTextNode,
	SpanNode,
	TableBodyCellNode,
	TableHeaderCellNode,
} from "../../../documentation-domain";
import { testRender } from "./Utilities";

describe("Table Markdown rendering tests", () => {
	describe("Standard context", () => {
		it("Empty table cell", () => {
			expect(testRender(TableBodyCellNode.Empty)).to.equal("");
			expect(testRender(TableHeaderCellNode.Empty)).to.equal("");
		});

		it("Simple table cell", () => {
			const input = TableBodyCellNode.createFromPlainText("Hello World!");

			const result = testRender(input);

			const expected = ["Hello World!"].join("\n");

			expect(result).to.equal(expected);
		});

		it("Cell with complex, multi-line content", () => {
			const input = new TableBodyCellNode([
				new ParagraphNode([
					new PlainTextNode("Hello world!\n"),
					new ParagraphNode([
						SpanNode.createFromPlainText("Meaning of life", { bold: true }),
						new PlainTextNode(": "),
						SpanNode.createFromPlainText("42", { italic: true }),
					]),
				]),
			]);

			const result = testRender(input);

			// Since the contents are multi-line, the table cell will fall back to HTML rendering.
			// Additionally, since we're in a Markdown table, the contents of the cell *must* be on a single line.
			const expected = [
				"<p>",
				"Hello world!",
				"<br>",
				"<p>",
				"<span>",
				"<b>",
				"Meaning of life",
				"</b>",
				"</span>",
				": ",
				"<span>",
				"<i>",
				"42",
				"</i>",
				"</span>",
				"</p>",
				"</p>",
			].join("");

			expect(result).to.equal(expected);
		});
	});
});

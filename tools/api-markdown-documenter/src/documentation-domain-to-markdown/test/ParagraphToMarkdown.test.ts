/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Paragraph as MdastParagraph } from "mdast";
import { ParagraphNode, PlainTextNode } from "../../documentation-domain/index.js";
import { assertTransformation } from "./Utilities.js";

describe("ParagraphNode to Markdown tests", () => {
	it("Empty paragraph", () => {
		assertTransformation(ParagraphNode.Empty, { type: "paragraph", children: [] });
	});

	it("Simple paragraph", () => {
		const text1 = "This is some text. ";
		const text2 = "This is more text!";

		const input = new ParagraphNode([new PlainTextNode(text1), new PlainTextNode(text2)]);

		const expected: MdastParagraph = {
			type: "paragraph",
			children: [
				{ type: "text", value: text1 },
				{ type: "text", value: text2 },
			],
		};
		assertTransformation(input, expected);
	});
});

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { BlockContent, Blockquote } from "mdast";
import { BlockQuoteNode, LineBreakNode, PlainTextNode } from "../../documentation-domain/index.js";
import { assertTransformation } from "./Utilities.js";

describe("BlockQuote to Markdown transformation tests", () => {
	it("Empty BlockQuote", () => {
		assertTransformation(BlockQuoteNode.Empty, { type: "blockquote", children: [] });
	});

	it("Simple BlockQuote", () => {
		const input = new BlockQuoteNode([
			new PlainTextNode("Here's a block quote. "),
			new PlainTextNode("It sure is something!"),
			new LineBreakNode(),
			new PlainTextNode("-BlockQuote"),
		]);

		const expected: Blockquote = {
			type: "blockquote",
			children: [
				// TODO: verify these are okay
				{ type: "text", value: "Here's a block quote. " } as unknown as BlockContent,
				{ type: "text", value: "It sure is something!" } as unknown as BlockContent,
				{ type: "break" } as unknown as BlockContent,
				{ type: "text", value: "-BlockQuote" } as unknown as BlockContent,
			],
		};
		assertTransformation(input, expected);
	});
});

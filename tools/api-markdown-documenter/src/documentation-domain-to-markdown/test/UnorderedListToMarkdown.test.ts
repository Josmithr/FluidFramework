/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { BlockContent as MdastBlockContent, List as MdastList } from "mdast";
import { UnorderedListNode } from "../../documentation-domain/index.js";
import { assertTransformation } from "./Utilities.js";

describe("UnorderedListNode to Markdown transformation tests", () => {
	it("Empty list", () => {
		assertTransformation(UnorderedListNode.Empty, {
			type: "list",
			ordered: false,
			children: [],
		});
	});

	it("Simple list", () => {
		const text1 = "Item 1";
		const text2 = "Item 2";
		const text3 = "Item 3";

		const input = UnorderedListNode.createFromPlainTextEntries([text1, text2, text3]);

		const expected: MdastList = {
			type: "list",
			ordered: false,
			children: [
				// TODO: verify this is okay
				{
					type: "listItem",
					children: [{ type: "text", value: text1 } as unknown as MdastBlockContent],
				},
				{
					type: "listItem",
					children: [{ type: "text", value: text2 } as unknown as MdastBlockContent],
				},
				{
					type: "listItem",
					children: [{ type: "text", value: text3 } as unknown as MdastBlockContent],
				},
			],
		};

		assertTransformation(input, expected);
	});
});

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { BlockContent as MdastBlockContent, List as MdastList } from "mdast";
import { assertTransformation } from "./Utilities.js";
import { OrderedListNode } from "../../documentation-domain/index.js";

describe("OrderedListNode to Markdown transformation tests", () => {
	it("Empty list", () => {
		assertTransformation(OrderedListNode.Empty, {
			type: "list",
			ordered: true,
			children: [],
		});
	});

	it("Simple list", () => {
		const text1 = "Item 1";
		const text2 = "Item 2";
		const text3 = "Item 3";

		const input = OrderedListNode.createFromPlainTextEntries([text1, text2, text3]);

		const expected: MdastList = {
			type: "list",
			ordered: true,
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

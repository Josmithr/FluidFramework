/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Link as MdastLink } from "mdast";
import { LinkNode, PlainTextNode } from "../../documentation-domain/index.js";
import { assertTransformation } from "./Utilities.js";

describe("Link to Markdown transformation tests", () => {
	it("Can render a simple LinkNode", () => {
		const linkText = "Some Website";
		const linkTarget = "https://www.bing.com";
		const input = new LinkNode([new PlainTextNode(linkText)], linkTarget);

		const expected: MdastLink = {
			type: "link",
			url: linkTarget,
			children: [{ type: "text", value: linkText }],
		};
		assertTransformation(input, expected);
	});
});

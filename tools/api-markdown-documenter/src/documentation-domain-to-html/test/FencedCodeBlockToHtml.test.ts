/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { h } from "hastscript";
import { FencedCodeBlockNode } from "../../documentation-domain/index.js";
import { assertTransformation } from "./Utilities.js";

describe("FencedCodeBlock to HTMLtransformation tests", () => {
	it("Simple FencedCodeBlock", () => {
		const input = new FencedCodeBlockNode("console.log('hello world');", "typescript");

		// Note: HTML <code> elements don't support a language specification like Markdown fenced code blocks do.
		const expected = h("code", [{ type: "text", value: "console.log('hello world');" }]);

		assertTransformation(input, expected);
	});
});

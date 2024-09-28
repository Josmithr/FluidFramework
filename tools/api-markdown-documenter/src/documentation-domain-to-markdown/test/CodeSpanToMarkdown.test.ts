/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { InlineCode } from "mdast";
import { CodeSpanNode } from "../../documentation-domain/index.js";
import { assertTransformation } from "./Utilities.js";

describe("CodeSpan HTML rendering tests", () => {
	it("Empty CodeSpan", () => {
		assertTransformation(CodeSpanNode.Empty, {type: "code", value: ""});
	});

	it("Simple CodeSpan", () => {
		const input = new CodeSpanNode("console.log('hello world');");
		const expected: InlineCode = { type: "inlineCode", value: "console.log('hello world');" };

		assertTransformation(input, expected);
	});
});

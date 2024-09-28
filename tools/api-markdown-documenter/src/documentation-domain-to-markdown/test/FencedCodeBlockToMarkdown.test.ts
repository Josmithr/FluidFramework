/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Code } from "mdast";

import { FencedCodeBlockNode } from "../../documentation-domain/index.js";
import { assertTransformation } from "./Utilities.js";

describe("FencedCodeBlock HTML rendering tests", () => {
	it("Simple FencedCodeBlock", () => {
		const input = new FencedCodeBlockNode("console.log('hello world');", "typescript");

		const expected: Code = {
			type: "code",
			value: "console.log('hello world');",
			lang: "typescript",
		};

		assertTransformation(input, expected);
	});
});

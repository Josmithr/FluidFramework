/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Nodes as HastNodes } from "hast";
import { PlainTextNode } from "../../documentation-domain/index.js";
import { assertTransformation } from "./Utilities.js";

describe("PlainText to HTMLtransformation tests", () => {
	it("Empty text", () => {
		assertTransformation(PlainTextNode.Empty, { type: "text", value: "" });
	});

	it("Simple text", () => {
		assertTransformation(new PlainTextNode("This is some text!"), {
			type: "text",
			value: "This is some text!",
		});
	});

	it("Text with special characters", () => {
		assertTransformation(new PlainTextNode("Hello\t World! 😁é \t "), {
			type: "text",
			value: "Hello\t World! 😁é \t ",
		});
	});

	it("HTML content (escaped: true)", () => {
		const input = new PlainTextNode("This is some <b>bold</b> text!", /* escaped: */ true);
		const expected: HastNodes = { type: "raw", value: "This is some <b>bold</b> text!" };
		assertTransformation(input, expected);
	});
});

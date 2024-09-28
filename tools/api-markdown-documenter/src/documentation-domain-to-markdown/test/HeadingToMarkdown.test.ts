/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Html as MdastHtml, Heading as MdastHeading } from "mdast";
import { HeadingNode } from "../../documentation-domain/index.js";
import { assertTransformation } from "./Utilities.js";
import type { MdastTree } from "../configuration/index.js";

describe("HeadingNode to Markdown transformation tests", () => {
	describe("With ID", () => {
		it("Default level", () => {
			const input = HeadingNode.createFromPlainText("Foo", "foo-id");
			const expected: MdastHtml = { type: "html", value: '<h1 id="foo-id">Foo</h1>' };
			assertTransformation(input, expected);
		});

		it("Dynamic heading level (within limit)", () => {
			// Heading levels are dynamic depending on context (depth in the document tree).
			// Verify that the specified starting heading level in the config is respected when transforming the heading.
			const input = HeadingNode.createFromPlainText("Foo", "foo-id");
			const expected: MdastHtml = { type: "html", value: '<h4 id="foo-id">Foo</h4>' };
			assertTransformation(input, expected, { startingHeadingLevel: 4 });
		});

		it("Dynamic heading level (beyond limit)", () => {
			// HTML supports heading levels 1-6.
			// As a policy, if we have a heading nested deeper than that, we transform the content to bold text with an
			// anchor tag above it.
			const input = HeadingNode.createFromPlainText("Foo", "foo-id");
			const expected: MdastHtml = { type: "html", value: '<a name="foo-id"></a><b>Foo</b>' };
			assertTransformation(input, expected, { startingHeadingLevel: 7 });
		});
	});

	describe("Without ID", () => {
		it("Default level", () => {
			const input = HeadingNode.createFromPlainText("Foo");
			const expected: MdastHeading = {
				type: "heading",
				depth: 1,
				children: [{ type: "text", value: "Foo" }],
			};
			assertTransformation(input, expected);
		});

		it("Dynamic heading level (within limit)", () => {
			// Heading levels are dynamic depending on context (depth in the document tree).
			// Verify that the specified starting heading level in the config is respected when transforming the heading.
			const input = HeadingNode.createFromPlainText("Foo");
			const expected: MdastHeading = {
				type: "heading",
				depth: 4,
				children: [{ type: "text", value: "Foo" }],
			};
			assertTransformation(input, expected, { startingHeadingLevel: 4 });
		});

		it("Dynamic heading level (beyond limit)", () => {
			// HTML supports heading levels 1-6.
			// As a policy, if we have a heading nested deeper than that, we transform the content to bold text with an
			// anchor tag above it.
			const input = HeadingNode.createFromPlainText("Foo");
			const expected: MdastTree = {
				type: "strong",
				children: [{ type: "text", value: "Foo" }],
			};
			assertTransformation(input, expected, { startingHeadingLevel: 7 });
		});
	});
});

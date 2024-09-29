/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";
import type { Root } from "mdast";
import { toMarkdown } from "mdast-util-to-markdown";

describe("mdast-util-to-markdown acceptance tests", () => {
	it("Simple document", () => {
		const document: Root = {
			type: "root",
			children: [
				{
					type: "heading",
					depth: 1,
					children: [{ type: "text", value: "Sample Document" }],
				},
				{
					type: "paragraph",
					children: [
						{ type: "text", value: "This is a sample document. " },
						{ type: "text", value: "It has very basic content.\t" },
					],
				},
				{
					type: "heading",
					depth: 2,
					children: [{ type: "text", value: "Section Heading" }],
				},
				{
					type: "paragraph",
					children: [
						{ type: "text", value: "This is text inside of a paragraph. " },
						{
							type: "text",
							value: "It is also inside of a hierarchical section node. ",
						},
						{
							type: "emphasis",
							children: [{ type: "text", value: "That's real neat-o." }],
						},
					],
				},
			],
		};

		const result = toMarkdown(document, {});

		expect(result).to.equal(
			"# Sample Document\n\nThis is a sample document. It has very basic content.&#x9;\n\n## Section Heading\n\nThis is text inside of a paragraph. It is also inside of a hierarchical section node. *That's real neat-o.*\n",
		);
	});
});

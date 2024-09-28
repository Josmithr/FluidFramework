/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";
import {
	DocumentNode,
	HeadingNode,
	ParagraphNode,
	PlainTextNode,
	SectionNode,
	SpanNode,
} from "../../documentation-domain/index.js";
import { documentToMarkdown } from "../ToMarkdown.js";
import type { Root } from "mdast";

describe("Document to Markdown transformation tests", () => {
	it("Simple document", () => {
		const document = new DocumentNode({
			children: [
				new SectionNode(
					[
						new ParagraphNode([
							new PlainTextNode("This is a sample document. "),
							new PlainTextNode("It has very basic content.\t"),
						]),
						new SectionNode(
							[
								new ParagraphNode([
									new PlainTextNode("This is text inside of a paragraph. "),
									new PlainTextNode(
										"It is also inside of a hierarchical section node. ",
									),
									SpanNode.createFromPlainText("That's real neat-o.", {
										italic: true,
									}),
								]),
							],
							HeadingNode.createFromPlainText("Section Heading"),
						),
					],
					HeadingNode.createFromPlainText("Sample Document"),
				),
			],
			documentPath: "./test",
		});

		const result = documentToMarkdown(document, {});

		const expected: Root = {
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

		// const expected = h(undefined, [
		// 	{ type: "doctype" },
		// 	h("html", { lang: "en" }, [
		// 		h("head", [
		// 			// eslint-disable-next-line unicorn/text-encoding-identifier-case
		// 			h("meta", { charset: "utf-8" }),
		// 		]),
		// 		h("body", [
		// 			h("section", [
		// 				h("h1", "Sample Document"),
		// 				h("p", ["This is a sample document. ", "It has very basic content.\t"]),
		// 				h("section", [
		// 					h("h2", "Section Heading"),
		// 					h("p", [
		// 						"This is test inside of a paragraph. ",
		// 						"It is also inside of a hierarchical section node. ",
		// 						h("span", [h("i", "That's real neat-o.")]),
		// 					]),
		// 				]),
		// 			]),
		// 		]),
		// 	]),
		// ]);

		expect(result).to.deep.equal(expected);
	});
});

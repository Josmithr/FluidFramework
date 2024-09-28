/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { RootContent as MdastRootContent } from "mdast";
import {
	HeadingNode,
	HorizontalRuleNode,
	ParagraphNode,
	SectionNode,
} from "../../documentation-domain/index.js";
import { assertTransformation } from "./Utilities.js";

describe("HierarchicalSection to Markdown transformation tests", () => {
	it("Simple section", () => {
		const input = new SectionNode(
			[
				ParagraphNode.createFromPlainText("Foo"),
				HorizontalRuleNode.Singleton,
				ParagraphNode.createFromPlainText("Bar"),
			],
			/* heading: */ HeadingNode.createFromPlainText("Hello World", /* id: */ "heading-id"),
		);

		const expected: MdastRootContent[] = [
			{
				type: "html",
				value: '<h1 id="heading-id">Hello World</h1>',
			},
			{ type: "paragraph", children: [{ type: "text", value: "Foo" }] },
			{ type: "thematicBreak" },
			{ type: "paragraph", children: [{ type: "text", value: "Bar" }] },
		];

		assertTransformation(input, expected);
	});

	// TODO: the structure here doesn't really make sense for Markdown.
	// It might make more sense to *require* headings for `SectionNode`s.
	// That would force cleaner input structure.
	it("Nested section", () => {
		const input = new SectionNode(
			[
				new SectionNode(
					[ParagraphNode.createFromPlainText("Foo")],
					/* heading: */ HeadingNode.createFromPlainText(
						"Sub-Heading",
						/* id: */ "sub-heading",
					),
				),

				new SectionNode(
					[
						new SectionNode(
							[ParagraphNode.createFromPlainText("Bar")],
							/* heading: */ HeadingNode.createFromPlainText(
								"Sub-Sub-Heading",
								/* No ID */
							),
						),
					],
					/* heading: */ undefined,
				),
			],
			/* heading: */ HeadingNode.createFromPlainText(
				"Root Heading",
				/* id: */ "root-heading",
			),
		);

		const expected: MdastRootContent[] = [
			{
				type: "html",
				value: '<h1 id="root-heading">Root Heading</h1>',
			},
			{
				type: "paragraph",
				children: [{ type: "text", value: "Foo" }],
			},
			{
				type: "html",
				value: '<h2 id="sub-heading">Sub-Heading</h2>',
			},
			{
				type: "paragraph",
				children: [{ type: "text", value: "Bar" }],
			},
			{ type: "heading", depth: 3, children: [{ type: "text", value: "Sub-Sub-Heading" }] },
		];

		assertTransformation(input, expected);
	});
});

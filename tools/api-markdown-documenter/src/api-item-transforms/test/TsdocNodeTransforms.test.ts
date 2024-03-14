/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";
import {
	DocNodeKind,
	type DocNode,
	type DocPlainText,
	type DocHtmlStartTag,
	type DocHtmlEndTag,
} from "@microsoft/tsdoc";
import { extractHtmlSpans, type HtmlSpan } from "../TsdocNodeTransforms.js";

describe("TsdocNodeTransforms", () => {
	describe("extractHtmlSpans", () => {
		it("Simple", () => {
			const input: DocNode[] = [
				{
					kind: DocNodeKind.PlainText,
					text: "Hello, ",
				} as unknown as DocPlainText,
				{
					kind: DocNodeKind.HtmlStartTag,
					name: "b",
					htmlAttributes: [],
					selfClosing: false,
				} as unknown as DocHtmlStartTag,
				{
					kind: DocNodeKind.PlainText,
					text: "world",
				} as unknown as DocPlainText,
				{
					kind: DocNodeKind.HtmlEndTag,
					name: "b",
				} as unknown as DocHtmlEndTag,
				{
					kind: DocNodeKind.PlainText,
					text: "!",
				} as unknown as DocPlainText,
			];

			const expected: (DocNode | HtmlSpan)[] = [
				input[0],
				{
					tag: "b",
					attributes: [],
					children: [input[2]],
				},
				input[4],
			];

			const result = extractHtmlSpans(input);

			expect(result.length).to.equal(3);
			expect(result).to.deep.equal(expected);
		});

		it("Nested", () => {
			const input: DocNode[] = [
				{
					kind: DocNodeKind.HtmlStartTag,
					name: "div",
					htmlAttributes: [],
					selfClosing: false,
				} as unknown as DocHtmlStartTag,
				{
					kind: DocNodeKind.HtmlStartTag,
					name: "h1",
					htmlAttributes: [],
					selfClosing: false,
				} as unknown as DocHtmlStartTag,
				{
					kind: DocNodeKind.PlainText,
					text: "Foo",
				} as unknown as DocPlainText,
				{
					kind: DocNodeKind.HtmlEndTag,
					name: "h1",
				} as unknown as DocHtmlEndTag,
				{
					kind: DocNodeKind.HtmlStartTag,
					name: "p",
					htmlAttributes: [],
					selfClosing: false,
				} as unknown as DocHtmlStartTag,
				{
					kind: DocNodeKind.PlainText,
					text: "Bar",
				} as unknown as DocPlainText,
				{
					kind: DocNodeKind.HtmlEndTag,
					name: "p",
				} as unknown as DocHtmlEndTag,
				{
					kind: DocNodeKind.HtmlEndTag,
					name: "div",
				} as unknown as DocHtmlEndTag,
			];

			const expected: (DocNode | HtmlSpan)[] = [
				{
					tag: "div",
					attributes: [],
					children: [
						{
							tag: "h1",
							attributes: [],
							children: [input[2]],
						},
						{
							tag: "p",
							attributes: [],
							children: [input[5]],
						},
					],
				},
			];

			const result = extractHtmlSpans(input);

			expect(result.length).to.equal(1);
			expect(result).to.deep.equal(expected);
		});
	});
});

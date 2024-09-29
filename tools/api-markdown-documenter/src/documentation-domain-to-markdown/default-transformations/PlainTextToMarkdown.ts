/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { PlainTextNode } from "../../documentation-domain/index.js";
import type { TransformationContext } from "../TransformationContext.js";
import { applyFormatting } from "./Utilities.js";
import type { MdastTree } from "../configuration/index.js";

/**
 * Transform a {@link PlainTextNode} to HTML.
 *
 * @param node - The node to render.
 * @param context - See {@link TransformationContext}.
 */
export function plainTextToMarkdown(
	node: PlainTextNode,
	context: TransformationContext,
): MdastTree {
	// TODO: don't escape text that's already escaped.

	const anyFormatting =
		context.bold === true || context.italic === true || context.strikethrough === true;

	if (!anyFormatting) {
		return applyFormatting(
			{
				type: "text",
				value: node.value,
			},
			context,
		);
	}

	// We will render leading and trailing whitespace *outside* of any formatting to prevent potential issues.
	const { leadingWhitespace, body, trailingWhitespace } = splitLeadingAndTrailingWhitespace(
		node.value,
	);

	const result: MdastTree = [];

	if (leadingWhitespace) {
		result.push({
			type: "text",
			value: leadingWhitespace,
		});
	}

	const formattedBody = applyFormatting(
		{
			type: "text",
			value: body,
		},
		context,
	);
	result.push(formattedBody);

	if (trailingWhitespace) {
		result.push({
			type: "text",
			value: trailingWhitespace,
		});
	}

	return result;
}

interface SplitTextResult {
	leadingWhitespace: string;
	body: string;
	trailingWhitespace: string;
}

function splitLeadingAndTrailingWhitespace(text: string): SplitTextResult {
	// split out the [ leading whitespace, body, trailing whitespace ]
	const [, leadingWhitespace, body, trailingWhitespace]: string[] =
		text.match(/^(\s*)(.*?)(\s*)$/) ?? [];

	return {
		leadingWhitespace,
		body,
		trailingWhitespace,
	};
}

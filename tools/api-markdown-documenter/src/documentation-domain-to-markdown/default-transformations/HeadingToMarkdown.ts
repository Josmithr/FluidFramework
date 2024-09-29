/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Html as MdastHtml, Heading as MdastHeading, Strong as MdastStrong } from "mdast";
import { heading as createHeading, strong as createStrong } from "mdast-builder";

import type { HeadingNode } from "../../documentation-domain/index.js";
import type { TransformationContext } from "../TransformationContext.js";
import { documentationNodesToMarkdown } from "../ToMarkdown.js";
import type { MdastTree } from "../configuration/index.js";

/**
 * Maximum heading level supported by most systems.
 *
 * @remarks This corresponds with the max HTML heading level.
 */
const maxHeadingLevel = 6;

/**
 * Transforms a {@link HeadingNode} to HTML.
 *
 * @param node - The node to render.
 * @param context - See {@link TransformationContext}.
 *
 * @remarks
 *
 * Observes {@link RenderContext.headingLevel} to determine the heading level to use.
 */
export function headingToMarkdown(
	headingNode: HeadingNode,
	context: TransformationContext,
): MdastTree {
	const { headingLevel } = context;

	const output: MdastTree = [];

	// Standard Markdown headings don't support IDs by default.
	// To support linking, we place an HTML anchor tag immediately above it.
	if (headingNode.id !== undefined) {
		const anchorHtml: MdastHtml = { type: "html", value: `<a name="${headingNode.id}"></a>` };
		output.push(anchorHtml);
	}

	const transformedChildren = documentationNodesToMarkdown(headingNode.children, context);

	if (headingLevel <= maxHeadingLevel) {
		// If the heading does not have an ID, and the level is within the max heading level,
		// leverage Markdown heading syntax as normal.
		const heading: MdastHeading = createHeading(
			headingLevel,
			transformedChildren,
		) as MdastHeading;
		output.push(heading);
	} else {
		// If the heading level is beyond the max heading level, transform the content to bold text.
		const strong: MdastStrong = createStrong(transformedChildren) as MdastStrong;
		output.push(strong);
	}

	return output;
}

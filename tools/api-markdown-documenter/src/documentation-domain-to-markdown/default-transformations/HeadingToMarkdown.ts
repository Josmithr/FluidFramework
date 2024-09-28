/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Heading as MdastHeading, Strong as MdastStrong } from "mdast";
import { toHtml } from "hast-util-to-html";

import type { HeadingNode } from "../../documentation-domain/index.js";
import { documentationNodeToHtml } from "../../documentation-domain-to-html/index.js";
import type { TransformationContext } from "../TransformationContext.js";
import { heading, strong } from "mdast-builder";
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

	// Markdown headings don't support IDs by default.
	// If the heading has an ID, we will leverage HTML heading syntax instead of Markdown.

	if (headingNode.id !== undefined) {
		// If the heading has an ID, leverage HTML heading syntax.
		const html = documentationNodeToHtml(headingNode, { startingHeadingLevel: headingLevel });
		const htmlString = toHtml(html);
		return { type: "html", value: htmlString };
	}

	const transformedChildren = documentationNodesToMarkdown(headingNode.children, context);

	if (headingLevel <= maxHeadingLevel) {
		// If the heading does not have an ID, and the level is within the max heading level,
		// leverage Markdown heading syntax as normal.
		return heading(headingLevel, transformedChildren) as MdastHeading;
	}

	// If the heading level is beyond the max heading level, transform the content to bold text.
	return strong(transformedChildren) as MdastStrong;
}

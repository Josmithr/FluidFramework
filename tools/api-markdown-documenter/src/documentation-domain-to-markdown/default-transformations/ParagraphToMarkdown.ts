/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Paragraph as MdastParagraph } from "mdast";
import type { ParagraphNode } from "../../documentation-domain/index.js";
import type { TransformationContext } from "../TransformationContext.js";
import { paragraph } from "mdast-builder";
import { documentationNodesToMarkdown } from "../ToMarkdown.js";

/**
 * Transform a {@link ParagraphNode} to HTML.
 *
 * @param node - The node to render.
 * @param context - See {@link TransformationContext}.
 */
export function paragraphToMarkdown(
	node: ParagraphNode,
	context: TransformationContext,
): MdastParagraph {
	const transformedChildren = documentationNodesToMarkdown(node.children, context);
	return paragraph(transformedChildren) as MdastParagraph;
}

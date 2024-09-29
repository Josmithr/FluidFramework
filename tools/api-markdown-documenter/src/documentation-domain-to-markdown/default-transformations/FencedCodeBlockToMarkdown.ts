/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Code as MdastCode } from "mdast";
import type { FencedCodeBlockNode } from "../../documentation-domain/index.js";
import type { TransformationContext } from "../TransformationContext.js";
import { code } from "mdast-builder";

/**
 * Transform a {@link FencedCodeBlockNode} to HTML.
 *
 * @param node - The node to render.
 * @param context - See {@link TransformationContext}.
 */
export function fencedCodeBlockToMarkdown(
	node: FencedCodeBlockNode,
	context: TransformationContext,
): MdastCode {
	// Note: we can ignore user-specified text formatting here, because fenced code blocks cannot be formatted in Markdown.
	return code(node.language ?? "", node.value) as MdastCode;
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { Element as HastElement } from "hast";
import { h } from "hastscript";

import { type FencedCodeBlockNode } from "../../documentation-domain/index.js";
import type { TransformationContext } from "../TransformationContext.js";

/**
 * Transform a {@link FencedCodeBlockNode} to HTML.
 *
 * @param node - The node to render.
 * @param context - See {@link TransformationContext}.
 */
export function fencedCodeBlockToHtml(
	node: FencedCodeBlockNode,
	context: TransformationContext,
): HastElement {
	// Note that HTML <code> tags don't support language attributes, so we don't pass anything through here.
	// Also note: fenced code blocks are not intended to be formatted, so we will ignore formatting in the output here.
	return h("code", {}, node.value);
}

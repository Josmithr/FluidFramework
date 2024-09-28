/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type FencedCodeBlockNode } from "../../../documentation-domain/index.js";
import type { DocumentWriter } from "../../DocumentWriter.js";
import type { RenderContext } from "../RenderContext.js";
import { renderTextUnderTag } from "../Utilities.js";

/**
 * Renders a {@link FencedCodeBlockNode} as HTML.
 *
 * @param node - The node to render.
 * @param writer - Writer context object into which the document contents will be written.
 * @param context - See {@link RenderContext}.
 */
export function renderFencedCodeBlock(
	node: FencedCodeBlockNode,
	writer: DocumentWriter,
	context: RenderContext,
): void {
	// The writer implementation wants to santize line breaks, but we need to preserve them here.
	// Convert line breaks to `<br>` tags.
	const modifiedText = node.value.replace(/(\r?\n)/g, "$1<br>$1");
	renderTextUnderTag(modifiedText, "code", writer, context);
}

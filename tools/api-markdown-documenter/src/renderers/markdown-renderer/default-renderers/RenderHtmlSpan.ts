/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { HtmlSpanNode } from "../../../documentation-domain/index.js";
import type { DocumentWriter } from "../../DocumentWriter.js";
import type { RenderContext } from "../RenderContext.js";
import { renderNodeWithHtmlSyntax } from "../Utilities.js";

/**
 * Renders a {@link HtmlSpanNode}.
 *
 * @param node - The node to render.
 * @param writer - Writer context object into which the document contents will be written.
 * @param context - See {@link RenderContext}.
 *
 * @remarks Will render as embedded HTML.
 */
export function renderHtmlSpan(
	node: HtmlSpanNode,
	writer: DocumentWriter,
	context: RenderContext,
): void {
	renderNodeWithHtmlSyntax(node, writer, context);
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { HtmlSpanNode } from "../../../documentation-domain/index.js";
import type { DocumentWriter } from "../../DocumentWriter.js";
import { renderNodes } from "../Render.js";
import type { RenderContext } from "../RenderContext.js";

/**
 * Renders a {@link HtmlSpanNode}.
 *
 * @param node - The node to render.
 * @param writer - Writer context object into which the document contents will be written.
 * @param context - See {@link RenderContext}.
 */
export function renderHtmlSpan(
	node: HtmlSpanNode,
	writer: DocumentWriter,
	context: RenderContext,
): void {
	const attributesPostfix = node.attributes.length === 0 ? "" : ` ${node.attributes.join(" ")}`;
	writer.write(`<${node.tag}${attributesPostfix}>`);
	if (context.prettyFormatting !== false) {
		writer.ensureNewLine();
		writer.increaseIndent();
	}
	renderNodes(node.children, writer, {
		...context,
	});
	if (context.prettyFormatting !== false) {
		writer.ensureNewLine();
		writer.decreaseIndent();
	}
	writer.write(`</${node.tag}>`);
}

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
	// TODO: verify escaped-ness
	return applyFormatting(
		{
			type: "text",
			value: node.text,
		},
		context,
	);
}

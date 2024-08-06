/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { DocNode } from "@microsoft/tsdoc";

import type { TransformationContext } from "./Configuration.js";

/**
 * Utilities for working with TSDoc {@link https://github.com/microsoft/tsdoc/blob/main/tsdoc/src/nodes/DocNode.ts| DocNode}s.
 */

/**
 * Transforms a TSDoc {@link https://github.com/microsoft/tsdoc/blob/main/tsdoc/src/nodes/DocNode.ts| DocNode} with the provided transformations.
 *
 * @remarks
 *
 * The set of supported `DocNode` kinds here is based on what appears in `ApiItem`s generated by API-Extractor.
 * This set may need to be updated if/when API-Extractor changes its output format.
 *
 * @throws If no transformation is specified for the `node`'s kind.
 *
 * @public
 */
export function transformTsdocNode<TOut>(
	node: DocNode,
	context: TransformationContext<TOut>,
): TOut {
	if (context.transformations[node.kind] === undefined) {
		throw new Error(
			`Encountered a DocNode without a corresponding transformation. Type: "${node.kind}". Please provide a transformation for this type.`,
		);
	}
	return context.transformations[node.kind](node, context);
}

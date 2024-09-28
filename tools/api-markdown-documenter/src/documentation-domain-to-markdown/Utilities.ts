/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { RootContent as MdastRootContent } from "mdast";
import type { MdastTree } from "./configuration/index.js";

/**
 * Normalizes a Markdown AST tree to an array of root content nodes.
 */
export function normalizeMdastTree(input: MdastTree): MdastRootContent[] {
	if (!Array.isArray(input)) {
		return [input];
	}

	const result: MdastRootContent[] = [];
	for (const inner of input) {
		result.push(...normalizeMdastTree(inner));
	}

	return result;
}

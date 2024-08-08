/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	FieldKind,
	type JsonableTree,
	type SimpleFieldSchema,
	type SimpleNodeSchema,
	type SimpleTreeSchema,
} from "@fluidframework/tree/internal";

import type { VisualizeChildData } from "./DataVisualization.js";
import type { VisualTreeNode } from "./VisualTree.js";

/**
 * TODO
 */
export async function visualizeTree(
	tree: JsonableTree,
	schema: SimpleTreeSchema,
	visualizeChildData: VisualizeChildData,
): Promise<VisualTreeNode> {
	// TODO: is root always required?
	return visualizeTreeField(
		tree,
		{ kind: FieldKind.Required, allowedTypes: schema.allowedTypes },
		{
			definitions: schema.definitions,
			visualizeChildData,
		},
	);
}

interface TreeWalkContext {
	definitions: ReadonlyMap<string, SimpleNodeSchema>;
	visualizeChildData: VisualizeChildData;
}

async function visualizeTreeField(
	field: JsonableTree,
	schema: SimpleFieldSchema,
	context: TreeWalkContext,
): Promise<VisualTreeNode> {
	throw new Error("TODO");
}

// async function visualizeTreeNode(
// 	field: JsonableTree,
// 	schema: SimpleNodeSchema,
// 	context: TreeWalkContext,
// ): Promise<VisualTreeNode> {
// 	throw new Error("TODO");
// }

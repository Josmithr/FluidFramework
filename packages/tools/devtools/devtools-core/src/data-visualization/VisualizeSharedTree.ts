/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils/internal";
import {
	FieldKind,
	NodeKind,
	type JsonableTree,
	type SimpleArrayNodeSchema,
	type SimpleFieldSchema,
	type SimpleLeafNodeSchema,
	type SimpleMapNodeSchema,
	type SimpleNodeSchema,
	type SimpleObjectNodeSchema,
	type SimpleTreeSchema,
	ValueSchema,
} from "@fluidframework/tree/internal";

import type { VisualizeChildData } from "./DataVisualization.js";
import { VisualNodeKind, type Primitive, type VisualChildNode, type VisualTreeNode, type VisualValueNode } from "./VisualTree.js";

/**
 * TODO
 */
export async function visualizeTree(
	tree: JsonableTree[],
	schema: SimpleTreeSchema,
	visualizeChildData: VisualizeChildData,
): Promise<VisualChildNode> {
	return visualizeTreeField(
		tree,
		// TODO: is root always required?
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
	field: JsonableTree[],
	fieldSchema: SimpleFieldSchema,
	context: TreeWalkContext,
): Promise<VisualChildNode> {
	const nodeSchema = getNodeSchema(field.type, context.definitions);
	const result = await visualizeTreeNode(field, nodeSchema, context);
	const tooltip = createFieldSchemaTooltip(field.type, fieldSchema);
	return {
		...result,
		tooltipContents: { schema: tooltip },
	};
}

async function visualizeTreeNode(
	node: JsonableTree[],
	nodeSchema: SimpleNodeSchema,
	context: TreeWalkContext,
): Promise<VisualChildNode> {
	const nodeKind = nodeSchema.kind;
	switch (nodeKind) {
		case NodeKind.Array: {
			return visualizeArrayNode(node, nodeSchema, context);
		}
		case NodeKind.Leaf: {
			return visualizeLeafNode(node, nodeSchema, context);
		}
		case NodeKind.Map: {
			return visualizeMapNode(node, nodeSchema, context);
		}
		case NodeKind.Object: {
			return visualizeObjectNode(node, nodeSchema, context);
		}
		default: {
			unreachableCase(nodeKind);
		}
	}
}

async function visualizeArrayNode(node: JsonableTree[], nodeSchema: SimpleArrayNodeSchema, context: TreeWalkContext): Promise<VisualTreeNode> {
	throw new Error("TODO");
}

async function visualizeLeafNode(node: JsonableTree, nodeSchema: SimpleLeafNodeSchema, context: TreeWalkContext): Promise<VisualChildNode> {
	if (nodeSchema.leafKind === ValueSchema.FluidHandle) {
		return context.visualizeChildData(node.value);
	}

	return {
		nodeKind: VisualNodeKind.ValueNode,
		value: node.value as Primitive,
	};
}

async function visualizeMapNode(node: JsonableTree, nodeSchema: SimpleMapNodeSchema, context: TreeWalkContext): Promise<VisualTreeNode> {
	throw new Error("TODO");
}

async function visualizeObjectNode(node: JsonableTree, nodeSchema: SimpleObjectNodeSchema, context: TreeWalkContext): Promise<VisualTreeNode> {
	const fields = node.fields;
	assert(fields !== undefined, "Expected Object node to have fields.");

	const children: Record<string, VisualChildNode> = {};
	for (const [fieldName, field] of Object.entries(fields)) {
		const fieldSchema = nodeSchema.fields[fieldName];
		assert(fieldSchema !== undefined, "Expected field schema to be defined.");

		children[fieldName] = await visualizeTreeField(field, fieldSchema, context);
	}
}

function visualizeAllowedTypes(
	allowedTypes: ReadonlySet<string>,
): VisualChildNode {
	assert(allowedTypes.size > 0, "Allowed types set must not be empty.");

	if (allowedTypes.size === 1) {
		return {
			value: [...allowedTypes][0],
			nodeKind: VisualNodeKind.ValueNode,
		};
	}

	const result: Record<string, VisualValueNode> = {};
	let i = 0;
	for (const allowedType of allowedTypes) {
		result[i++] = {
			nodeKind: VisualNodeKind.ValueNode,
			value: allowedType,
		};
	}

	return {
		children: result,
		nodeKind: VisualNodeKind.TreeNode,
	};
}

function createFieldSchemaTooltip(
	schemaIdentifier: string,
	fieldSchema: SimpleFieldSchema
): VisualTreeNode {
	const allowedTypes = visualizeAllowedTypes(fieldSchema.allowedTypes);
	const children: Record<string, VisualChildNode> = {
		name: {
			nodeKind: VisualNodeKind.ValueNode,
			value: schemaIdentifier,
		},
		kind: {
			nodeKind: VisualNodeKind.ValueNode,
			value: fieldKindToString(fieldSchema.kind),
		},
		allowedTypes,
	};
	return {
		nodeKind: VisualNodeKind.TreeNode,
		children,
	};
}



function fieldKindToString(fieldKind: FieldKind): string {
	switch(fieldKind) {
		case FieldKind.Required: {
			return "required";
		}
		case FieldKind.Optional: {
			return "optional";
		}
		case FieldKind.Identifier: {
			return "identifier";
		}
		default: {
			unreachableCase(fieldKind);
		}
	}
}

function getNodeSchema(identifier: string, definitions: ReadonlyMap<string, SimpleNodeSchema>): SimpleNodeSchema {
	const schema = definitions.get(identifier);
	if (schema === undefined) {
		throw new Error(`Node schema with identifier "${identifier}" not found`);
	}
	return schema;
}

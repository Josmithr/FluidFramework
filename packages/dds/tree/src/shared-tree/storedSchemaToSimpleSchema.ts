/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import {
	EmptyKey,
	LeafNodeStoredSchema,
	MapNodeStoredSchema,
	Multiplicity,
	ObjectNodeStoredSchema,
	type SchemaPolicy,
	type TreeFieldStoredSchema,
	type TreeNodeStoredSchema,
	type TreeStoredSchema,
} from "../core/index.js";
import {
	FieldKind,
	NodeKind,
	type SimpleArrayNodeSchema,
	type SimpleFieldSchema,
	type SimpleLeafNodeSchema,
	type SimpleMapNodeSchema,
	type SimpleNodeSchema,
	type SimpleObjectNodeSchema,
	type SimpleTreeSchema,
} from "../simple-tree/index.js";
import { fail } from "../util/index.js";

/**
 * Converts a stored schema to a form that more closely resembles our simple-tree view schema.
 *
 * @internal
 */
export function storedSchemaToSimpleSchema(
	storedSchema: TreeStoredSchema,
	schemaPolicy: SchemaPolicy,
): SimpleTreeSchema {
	const definitions = new Map<string, SimpleNodeSchema>();
	for (const [type, nodeSchema] of storedSchema.nodeSchema) {
		definitions.set(type, toSimpleNodeSchema(nodeSchema, schemaPolicy));
	}

	const transformedRootFieldSchema = toSimpleFieldSchema(
		storedSchema.rootFieldSchema,
		schemaPolicy,
	);

	return {
		allowedTypes: transformedRootFieldSchema.allowedTypes,
		definitions,
	};
}

function toSimpleFieldSchema(
	fieldSchema: TreeFieldStoredSchema,
	schemaPolicy: SchemaPolicy,
): SimpleFieldSchema {
	const allowedTypes = new Set<string>();
	for (const type of fieldSchema.types ?? []) {
		allowedTypes.add(type);
	}

	const fieldKindData = schemaPolicy.fieldKinds.get(fieldSchema.kind);
	assert(fieldKindData !== undefined, "Encountered field without kind policy.");

	assert(
		fieldKindData.multiplicity === Multiplicity.Optional ||
			fieldKindData.multiplicity === Multiplicity.Single,
		"Encountered object field with unexpected multiplicity.",
	);

	return {
		// TODO: identifiers?
		kind:
			fieldKindData.multiplicity === Multiplicity.Optional
				? FieldKind.Optional
				: FieldKind.Required,
		allowedTypes,
	};
}

function toSimpleNodeSchema(
	schema: TreeNodeStoredSchema,
	schemaPolicy: SchemaPolicy,
): SimpleNodeSchema {
	if (schema instanceof ObjectNodeStoredSchema) {
		return toSimpleObjectNodeSchema(schema, schemaPolicy);
	} else if (schema instanceof MapNodeStoredSchema) {
		return toSimpleMapNodeSchema(schema);
	} else if (schema instanceof LeafNodeStoredSchema) {
		return toSimpleLeafNodeSchema(schema);
	} else {
		fail("Encountered an unknown node schema type.");
	}
}

function toSimpleObjectNodeSchema(
	schema: ObjectNodeStoredSchema,
	schemaPolicy: SchemaPolicy,
): SimpleObjectNodeSchema | SimpleArrayNodeSchema {
	if (schema.objectNodeFields.size === 1 && schema.objectNodeFields.has(EmptyKey)) {
		// Array case
		const allowedTypes = new Set<string>();
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		for (const type of schema.objectNodeFields.get(EmptyKey)!.types ?? []) {
			allowedTypes.add(type);
		}
		return {
			kind: NodeKind.Array,
			allowedTypes,
		} satisfies SimpleArrayNodeSchema;
	} else {
		// Object case
		const fields: Record<string, SimpleFieldSchema> = {};
		for (const [fieldKey, fieldSchema] of schema.objectNodeFields) {
			fields[fieldKey] = toSimpleFieldSchema(fieldSchema, schemaPolicy);
		}
		return {
			kind: NodeKind.Object,
			fields,
		} satisfies SimpleObjectNodeSchema;
	}
}

function toSimpleMapNodeSchema(schema: MapNodeStoredSchema): SimpleMapNodeSchema {
	const allowedTypes = new Set<string>();
	for (const type of schema.mapFields.types ?? []) {
		allowedTypes.add(type);
	}
	return {
		kind: NodeKind.Map,
		allowedTypes,
	};
}

function toSimpleLeafNodeSchema(schema: LeafNodeStoredSchema): SimpleLeafNodeSchema {
	return {
		kind: NodeKind.Leaf,
		leafKind: schema.leafValue,
	};
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TreeStoredSchema } from "../core/index.js";
import type { SimpleTreeSchema } from "../simple-tree/index.js";

/**
 * Converts a stored schema to a form that more closely resembles our simple-tree view schema.
 */
export function storedSchemaToSimpleSchema(storedSchema: TreeStoredSchema): SimpleTreeSchema {
	throw new Error("TODO");
}

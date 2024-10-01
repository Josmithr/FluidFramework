/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * The `attributable-map` library provides interfaces and implementing classes for map-like distributed data structures.
 *
 * @packageDocumentation
 */

export {
	ISerializableValue,
	ISerializedValue,
	ISharedMap,
	ISharedMapEvents,
	IValueChanged,
} from "./interfaces.js";
export { LocalValueMaker, ILocalValue } from "./localValues.js";
export { AttributableMap } from "./map.js";

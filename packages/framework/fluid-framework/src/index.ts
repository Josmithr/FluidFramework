/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * The **fluid-framework** package bundles a collection of Fluid Framework client libraries for easy use
 * when paired with a corresponding service client library (for example,
 * `\@fluidframework/azure-client` or `\@fluidframework/tinylicious-client`).
 *
 * @packageDocumentation
 */

export type { ICriticalContainerError } from "@fluidframework/container-definitions";
export { AttachState, ContainerErrorType } from "@fluidframework/container-definitions";
export { DriverErrorType } from "@fluidframework/driver-definitions";
export { ConnectionState } from "@fluidframework/container-loader";
export type {
	ContainerSchema,
	DataObjectClass,
	IConnection,
	IFluidContainer,
	IFluidContainerEvents,
	IMember,
	IRootDataObject,
	IServiceAudience,
	IServiceAudienceEvents,
	LoadableObjectClass,
	LoadableObjectClassRecord,
	LoadableObjectCtor,
	LoadableObjectRecord,
	MemberChangedListener,
	SharedObjectClass,
} from "@fluidframework/fluid-static";
export type {
	ICreateInfo,
	IDirectory,
	IDirectoryClearOperation,
	IDirectoryCreateSubDirectoryOperation,
	IDirectoryDataObject,
	IDirectoryDeleteOperation,
	IDirectoryDeleteSubDirectoryOperation,
	IDirectoryEvents,
	IDirectoryKeyOperation,
	IDirectoryNewStorageFormat,
	IDirectoryOperation,
	IDirectorySetOperation,
	IDirectoryStorageOperation,
	IDirectorySubDirectoryOperation,
	IDirectoryValueChanged,
	ILocalValue,
	ISerializableValue,
	ISerializedValue,
	ISharedDirectory,
	ISharedDirectoryEvents,
	ISharedMap,
	ISharedMapEvents,
	IValueChanged,
} from "@fluidframework/map";
export {
	DirectoryFactory,
	LocalValueMaker,
	MapFactory,
	SharedDirectory,
	SharedMap,
} from "@fluidframework/map";
export type {
	DeserializeCallback,
	IInterval,
	IIntervalCollectionEvent,
	IIntervalHelpers,
	IJSONRunSegment,
	IMapMessageLocalMetadata,
	IIntervalCollection,
	IntervalLocator,
	ISequenceDeltaRange,
	ISerializableInterval,
	ISerializedInterval,
	ISharedIntervalCollection,
	ISharedSegmentSequenceEvents,
	ISharedString,
	IValueOpEmitter,
	SerializedIntervalDelta,
	SharedStringSegment,
} from "@fluidframework/sequence";
export {
	getTextAndMarkers,
	Interval,
	intervalLocatorFromEndpoint,
	IntervalType,
	SequenceDeltaEvent,
	SequenceEvent,
	SequenceInterval,
	SequenceMaintenanceEvent,
	SharedIntervalCollection,
	SharedIntervalCollectionFactory,
	SharedSegmentSequence,
	SharedSequence,
	SharedString,
	SharedStringFactory,
	SubSequence,
} from "@fluidframework/sequence";

// Re-export the tree package as a single namespace member "tree".
// This helps reduce clutter in this package's global scope.
// Consumers can import tree APIs via `import foo from "fluid-framework/tree".
import * as tree from "@fluid-experimental/tree2";
// eslint-disable-next-line unicorn/prefer-export-from
export { tree };

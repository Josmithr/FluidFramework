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

export type {
	ContainerWarning,
	IAudience,
	IConnectionDetails,
	IContainer,
	IContainerEvents,
	ICriticalContainerError,
	IDeltaManager,
	IDeltaManagerEvents,
	IDeltaSender,
	IDeltaQueue,
	IDeltaQueueEvents,
	IFluidCodeDetails,
	IFluidCodeDetailsConfig,
	IFluidPackage,
	IFluidPackageEnvironment,
	ConnectionState as ConnectionStateType, // TODO
	ReadOnlyInfo,
} from "@fluidframework/container-definitions";
export { AttachState, ContainerErrorType } from "@fluidframework/container-definitions";
export {
	DriverErrorType,
	DriverErrorTypes,
	type IAnyDriverError,
	type IDriverErrorBase,
	type IResolvedUrl,
} from "@fluidframework/driver-definitions";
export { ConnectionState } from "@fluidframework/container-loader";
export type {
	ContainerSchema,
	DataObjectClass,
	IConnection,
	IFluidContainer,
	IFluidContainerEvents,
	IMember,
	InitialObjects,
	IProvideRootDataObject,
	IRootDataObject,
	IServiceAudience,
	IServiceAudienceEvents,
	LoadableObjectClass,
	LoadableObjectClassRecord,
	LoadableObjectCtor,
	LoadableObjectRecord,
	MemberChangedListener,
	Myself,
	SharedObjectClass,
} from "@fluidframework/fluid-static";
export {
	DOProviderContainerRuntimeFactory,
	FluidContainer,
	ServiceAudience,
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
	InteriorSequencePlace,
	IntervalIndex,
	IntervalLocator,
	IntervalOpType,
	ISequenceDeltaRange,
	ISerializableInterval,
	ISerializedInterval,
	ISharedIntervalCollection,
	ISharedSegmentSequenceEvents,
	ISharedString,
	IValueOpEmitter,
	SequencePlace,
	SerializedIntervalDelta,
	SharedStringSegment,
} from "@fluidframework/sequence";
export {
	getTextAndMarkers,
	Interval,
	intervalLocatorFromEndpoint,
	IntervalStickiness,
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
	Side,
	SubSequence,
} from "@fluidframework/sequence";

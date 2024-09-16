/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IContainerExperimental } from "@fluidframework/container-loader/internal";
import { assert } from "@fluidframework/core-utils/internal";
import type { IFluidContainer } from "@fluidframework/fluid-static";
import { isInternalFluidContainer } from "@fluidframework/fluid-static/internal";
import type { IContainerRuntimeBase } from "@fluidframework/runtime-definitions/internal";

import type { IPresence } from "./presence.js";
import type { IEphemeralRuntime } from "./presenceDatastoreManager.js";
import { createPresenceManager } from "./presenceManager.js";

import type {
	ContainerExtensionStore,
	IContainerExtension,
	IExtensionMessage,
	IExtensionRuntime,
} from "@fluid-experimental/presence/internal/container-definitions/internal";

function isContainerExtensionStore(
	manager: ContainerExtensionStore | IContainerRuntimeBase | IContainerExperimental,
): manager is ContainerExtensionStore {
	return (manager as ContainerExtensionStore).acquireExtension !== undefined;
}

/**
 * @internal
 */
export interface IPresenceManager
	extends IPresence,
		Pick<Required<IContainerExtension<[]>>, "processSignal"> {}

/**
 * Common Presence manager for a container
 */
class ContainerPresenceManager implements IContainerExtension<never> {
	public readonly extension: IPresenceManager;
	public readonly interface = this;

	public constructor(runtime: IExtensionRuntime) {
		// TODO create the appropriate ephemeral runtime (map address must be in submitSignal, etc.)
		this.extension = createPresenceManager(runtime as unknown as IEphemeralRuntime);
	}

	public onNewContext(): void {
		// No-op
	}

	public static readonly extensionId = "dis:bb89f4c0-80fd-4f0c-8469-4f2848ee7f4a";

	public processSignal(address: string, message: IExtensionMessage, local: boolean): void {
		this.extension.processSignal(address, message, local);
	}
}

/**
 * Acquire an IPresence from a Fluid Container
 * @param fluidContainer - Fluid Container to acquire the map from
 * @returns the IPresence
 *
 * @alpha
 */
export function acquirePresence(fluidContainer: IFluidContainer): IPresence {
	assert(
		isInternalFluidContainer(fluidContainer),
		0xa2f /* IFluidContainer was not recognized. Only Containers generated by the Fluid Framework are supported. */,
	);
	const innerContainer = fluidContainer.container;

	assert(
		isContainerExtensionStore(innerContainer),
		0xa39 /* Container does not support extensions. Use acquirePresenceViaDataObject. */,
	);

	const pm = innerContainer.acquireExtension(
		ContainerPresenceManager.extensionId,
		ContainerPresenceManager,
	);
	return pm;
}

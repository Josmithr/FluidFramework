/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type ITelemetryBaseEvent } from "@fluidframework/core-interfaces";

/**
 * Interface for telemetry events with a timestamp. Specific to the Fluid Devtools.
 *
 * @internal
 */
// TODO: fix now
// eslint-disable-next-line @typescript-eslint/naming-convention
export interface ITimestampedTelemetryEvent {
	/**
	 * The contents of the telemetry event.
	 */
	logContent: ITelemetryBaseEvent;

	/**
	 * The timestamp at which the event was logged. {@link Date#now}. i.e. MM/DD/YYYY, HH:MM:SS AM/PM.
	 */
	timestamp: number;
}

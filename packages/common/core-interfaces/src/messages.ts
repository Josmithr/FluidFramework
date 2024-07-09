/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @internal
 */
// TODO: Rename this to conform to our naming conventions
// eslint-disable-next-line @typescript-eslint/naming-convention
export interface ISignalEnvelope {
	/**
	 * The target for the envelope, undefined for the container
	 */
	address?: string;

	/**
	 * Identifier for the signal being submitted.
	 */
	clientSignalSequenceNumber: number;

	/**
	 * The contents of the envelope
	 */
	contents: {
		type: string;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		content: any;
	};
}

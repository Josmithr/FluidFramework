/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Server } from "node:http";

/**
 * "Promisifies" `Server.close`.
 */
export async function closeServer(server: Server): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		server.close((error) => {
			if (error === undefined) {
				resolve();
			} else {
				reject(error);
			}
		});
	});
}

/**
 * Returns a promise that resolves after `timeMs`.
 * @param timeMs - Time in milliseconds to wait.
 */
export const delay = async (timeMs: number): Promise<void> =>
	new Promise((resolve) => setTimeout(() => resolve(), timeMs));

/**
 * Waits until a condition is true or the timeout expires.
 * @param condition - The condition to poll.
 * @param description - A description of the condition included in the timeout error.
 * @param timeoutMs - The maximum time to wait in milliseconds. Defaults to 2000 milliseconds.
 */
export async function waitForCondition(
	condition: () => boolean,
	description: string,
	timeoutMs = 2000,
): Promise<void> {
	const timeoutAt = Date.now() + timeoutMs;
	while (!condition()) {
		if (Date.now() >= timeoutAt) {
			throw new Error(`Timed out waiting for ${description}`);
		}
		await delay(10);
	}
}

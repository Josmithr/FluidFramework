/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert/strict";
import { describe, it } from "mocha";
import { serializeWorkerError } from "../fluidBuild/tasks/workers/workerError.js";
import { WorkerPool } from "../fluidBuild/tasks/workers/workerPool.js";

describe("serializeWorkerError", () => {
	it("serializes Error fields", () => {
		const error = new Error("boom");

		assert.deepEqual(serializeWorkerError(error), {
			name: "Error",
			message: "boom",
			stack: error.stack,
		});
	});

	it("ignores primitive and nullish thrown values", () => {
		assert.deepEqual(serializeWorkerError("boom"), {});
		assert.deepEqual(serializeWorkerError(null), {});
		assert.deepEqual(serializeWorkerError(undefined), {});
	});

	it("ignores non-string error fields", () => {
		assert.deepEqual(
			serializeWorkerError({
				name: 123,
				message: {},
				stack: undefined,
			}),
			{
				name: undefined,
				message: undefined,
				stack: undefined,
			},
		);
	});
});

describe("Worker command requests", () => {
	for (const useWorkerThreads of [false, true]) {
		it(`preserves legacy error results in ${useWorkerThreads ? "thread" : "process"} workers`, async () => {
			const pool = new WorkerPool(useWorkerThreads, Number.POSITIVE_INFINITY);
			try {
				for (const command of ["first", "second"]) {
					const result = await pool.runOnWorker("unknown-worker", command, process.cwd());
					assert.equal(result.code, -1);
					assert.equal(result.error?.message, "Invalid workerName unknown-worker");
				}
			} finally {
				pool.reset();
			}
		}).timeout(10000);
	}
});

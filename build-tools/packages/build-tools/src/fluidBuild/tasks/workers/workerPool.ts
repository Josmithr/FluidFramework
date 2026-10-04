/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type ChildProcess, fork } from "node:child_process";
import type { EventEmitter } from "node:events";
import { freemem } from "node:os";
import type { Readable } from "node:stream";
import { Worker } from "node:worker_threads";

import type { WorkerExecResult, WorkerRequest } from "./worker.js";

// Resolve the worker entry point relative to this module so it loads as ESM
// (the nearest package.json declares "type": "module").
const workerUrl = new URL("./worker.js", import.meta.url);

/**
 * Structured worker result together with console output captured for that request.
 */
export interface WorkerExecResultWithOutput extends WorkerExecResult {
	/**
	 * Standard output captured while the request was active.
	 */
	stdout: string;
	/**
	 * Standard error captured while the request was active.
	 */
	stderr: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Matches Node's EventEmitter listener type.
type EventListener = (...args: any[]) => void;

export class WorkerPool {
	private readonly threadWorkerPool: Worker[] = [];
	private readonly processWorkerPool: ChildProcess[] = [];
	constructor(
		public readonly useWorkerThreads: boolean,
		private readonly memoryUsageLimit: number,
	) {}

	private getThreadWorker(): Worker {
		let worker: Worker | undefined = this.threadWorkerPool.pop();
		if (!worker) {
			worker = new Worker(workerUrl, { stdout: true, stderr: true });
		}
		return worker;
	}

	private getProcessWorker(): ChildProcess {
		let worker: ChildProcess | undefined = this.processWorkerPool.pop();
		if (!worker) {
			worker = fork(
				workerUrl,
				this.memoryUsageLimit !== Number.POSITIVE_INFINITY ? ["--memoryUsage"] : undefined,
				{ silent: true },
			);
		}
		return worker;
	}

	/**
	 * Runs a structured request through the existing worker pool.
	 * @param message - Typed request dispatched by the worker entrypoint.
	 * @returns The worker result and captured output.
	 * @throws If communication or worker execution terminates before a result arrives.
	 */
	public runOnWorker(message: WorkerRequest): Promise<WorkerExecResultWithOutput>;
	/**
	 * Runs an existing command-based request without changing its handler protocol.
	 * @param workerName - Registered command worker name.
	 * @param command - Command string interpreted by that worker.
	 * @param cwd - Target package working directory.
	 * @returns The worker result and captured output.
	 * @throws If communication or worker execution terminates before a result arrives.
	 */
	public runOnWorker(
		workerName: string,
		command: string,
		cwd: string,
	): Promise<WorkerExecResultWithOutput>;
	public async runOnWorker(
		request: string | WorkerRequest,
		command?: string,
		cwd?: string,
	): Promise<WorkerExecResultWithOutput> {
		let workerMessage: WorkerRequest;
		if (typeof request === "string") {
			if (command === undefined || cwd === undefined) {
				throw new Error("Command worker requests require a command and working directory");
			}
			workerMessage = { workerName: request, command, cwd };
		} else {
			workerMessage = request;
		}
		let activeWorker: Worker | ChildProcess | undefined;
		const cleanup: (() => void)[] = [];
		const installTemporaryListener = (
			object: EventEmitter | Readable,
			event: string,
			handler: EventListener,
		): void => {
			object.on(event, handler);
			cleanup.push(() => object.off(event, handler));
		};
		const setupWorker = (
			worker: Worker | ChildProcess,
			res: (value: WorkerExecResultWithOutput) => void,
			reject: (error: Error) => void,
		): void => {
			let stdout = "";
			let stderr = "";

			if (worker.stdout) {
				installTemporaryListener(worker.stdout, "data", (chunk: string | Buffer) => {
					stdout += chunk;
				});
			}
			if (worker.stderr) {
				installTemporaryListener(worker.stderr, "data", (chunk: string | Buffer) => {
					stderr += chunk;
				});
			}

			installTemporaryListener(worker, "message", (result: WorkerExecResult) => {
				res({ ...result, stdout, stderr });
			});
			// Thread workers have no IPC disconnect event; exit and error must also settle the pending request.
			installTemporaryListener(worker, "error", (error: Error) => reject(error));
			installTemporaryListener(worker, "exit", (code: number) =>
				reject(new Error(`Worker exited before returning a result (code ${code})`)),
			);
		};
		try {
			if (this.useWorkerThreads) {
				const worker = this.getThreadWorker();
				activeWorker = worker;
				const res = await new Promise<WorkerExecResultWithOutput>((res, reject) => {
					setupWorker(worker, res, reject);
					worker.postMessage(workerMessage);
				});
				this.threadWorkerPool.push(worker);
				return res;
			} else {
				const worker = this.getProcessWorker();
				activeWorker = worker;
				const res = await new Promise<WorkerExecResultWithOutput>((res, rej) => {
					const setupErrorListener = (event: string): void => {
						installTemporaryListener(worker, event, () => {
							rej(new Error(`Worker ${event}`));
						});
					};

					setupWorker(worker, res, rej);

					setupErrorListener("close");
					setupErrorListener("disconnect");
					worker.send(workerMessage);
				});

				// Workers accumulate memory use over time.
				// Since recreating workers fixes this, but takes time,
				// recreate them only when the memory use becomes too high.

				const freeMemory = freemem();
				// As a heuristic to avoid memory pressure, lower threshold if running out of memory.
				const currentMemoryLimit = Math.min(this.memoryUsageLimit, freeMemory / 2);
				const bytesPerGiB = 1024 * 1024 * 1024;

				if (
					// Don't keep worker if using more than currentMemoryLimit bytes of memory.
					(res.memoryUsage?.rss ?? 0) > currentMemoryLimit ||
					// In case memoryUsage is not available,
					// or as a last resort when something other than this worker is using up all the memory
					// kill the worker if there is less than 4 GB of memory free.
					freeMemory < 4 * bytesPerGiB
				) {
					// This typically happens around 21 times in a full clean build of client, and much less if any in an incremental build,
					// so it should not be too verbose to log.
					console.info(
						`Freeing worker ${worker.pid} due to memory pressure. Free memory: ${freeMemory / bytesPerGiB} GiB, rss: ${res.memoryUsage?.rss ? res.memoryUsage?.rss / bytesPerGiB : undefined} GiB, memoryUsageLimit: ${this.memoryUsageLimit / bytesPerGiB} GiB, currentMemoryLimit: ${currentMemoryLimit / bytesPerGiB} GiB`,
					);
					worker.kill();
				} else {
					this.processWorkerPool.push(worker);
				}
				return res;
			}
		} catch (error) {
			// Failed workers are not returned to the pool, and callers decide whether any retry is permitted.
			if (activeWorker instanceof Worker) {
				await activeWorker.terminate();
			} else {
				activeWorker?.kill();
			}
			throw error;
		} finally {
			cleanup.forEach((value) => value());
		}
	}

	public reset(): void {
		this.threadWorkerPool.forEach((worker) => {
			worker.terminate();
		});
		this.threadWorkerPool.length = 0;

		this.processWorkerPool.forEach((worker) => {
			worker.kill();
		});
		this.processWorkerPool.length = 0;
	}
}

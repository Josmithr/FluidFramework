/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { parentPort } from "worker_threads";

import type { ApiAnalyzerTaskSettings } from "../../apiAnalyzerTaskConfig.js";
import type { ApiAnalyzerInvocation } from "../apiAnalyzerRunner.js";
import { apiAnalyzerWorker } from "./apiAnalyzerWorker.js";
import { apiExtractorWorker } from "./apiExtractorWorker.js";
import { lint } from "./eslintWorker.js";
import { compile, fluidCompile } from "./tscWorker.js";
import { serializeWorkerError, type WorkerError } from "./workerError.js";

/**
 * Existing command-based worker request.
 */
export interface WorkerMessage {
	/**
	 * Registered command worker implementation to invoke.
	 */
	workerName: string;
	/**
	 * Command string interpreted by the selected legacy handler.
	 */
	command: string;
	/**
	 * Target package working directory.
	 */
	cwd: string;
}

/**
 * Structured request for analyzer execution without a CLI command.
 */
export interface ApiAnalyzerWorkerMessage {
	/**
	 * Selects the programmatic analyzer handler.
	 */
	readonly workerName: "api-analyzer";
	/**
	 * Absolute target package directory used for tool and configuration resolution.
	 */
	readonly cwd: string;
	/**
	 * Normalized analyzer settings, sent as data rather than reparsed command text.
	 */
	readonly settings: ApiAnalyzerTaskSettings;
	/**
	 * Report mode and output profile supplied by the build invocation.
	 */
	readonly invocation: ApiAnalyzerInvocation;
}

/**
 * Supported legacy command requests and programmatic analyzer requests.
 */
export type WorkerRequest = WorkerMessage | ApiAnalyzerWorkerMessage;

/**
 * Serializable task outcome shared by process and thread transports.
 */
export interface WorkerExecResult {
	/**
	 * Zero for success, nonzero for a failed execution or comparison.
	 */
	code: number;
	/**
	 * Operational failure information. Retry policy belongs to the caller, not the transport.
	 * @defaultValue No operational exception; a nonzero code may still indicate an expected failure.
	 */
	error?: WorkerError;
	/**
	 * Process memory usage used to decide whether the worker should be recycled.
	 * @defaultValue Not collected.
	 */
	memoryUsage?: NodeJS.MemoryUsage;
	/**
	 * Expected operation diagnostics transferred independently of buffered console output.
	 * @defaultValue No structured diagnostics.
	 */
	diagnostics?: readonly string[];
}

const workers: { [key: string]: (message: WorkerMessage) => Promise<WorkerExecResult> } = {
	"tsc": compile,
	"fluid-tsc": fluidCompile,
	"eslint": lint,
	"api-extractor": apiExtractorWorker,
};

let collectMemoryUsage = false;

async function messageHandler(msg: WorkerRequest): Promise<WorkerExecResult> {
	let res: WorkerExecResult;
	try {
		if ("settings" in msg) {
			res = await apiAnalyzerWorker(msg);
		} else {
			const worker = workers[msg.workerName];
			if (worker) {
				// await here so that if the promise is rejected, the try/catch will catch it
				res = await worker(msg);
			} else {
				throw new Error(`Invalid workerName ${msg.workerName}`);
			}
		}
	} catch (e) {
		// The caller owns retry policy; analyzer failures must never replay partially completed writes.
		res = {
			// Non-object and non-string fields remain undefined, preserving the existing IPC shape.
			error: serializeWorkerError(e),
			code: -1,
		};
	}
	return collectMemoryUsage ? { ...res, memoryUsage: process.memoryUsage() } : res;
}

if (parentPort) {
	parentPort.on("message", (message: WorkerRequest) => {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		messageHandler(message).then(parentPort!.postMessage.bind(parentPort));
	});
} else if (process.send) {
	collectMemoryUsage = process.argv.includes("--memoryUsage");
	process.on("message", (message: WorkerRequest) => {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		messageHandler(message).then(process.send!.bind(process));
	});
	process.on("uncaughtException", (error) => {
		console.error(`ERROR: Uncaught exception. ${error.message}\n${error.stack}`);
		process.exit(-1);
	});
	process.on("unhandledRejection", (reason) => {
		console.error(`ERROR: Unhandled promise rejection. ${reason}`);
		process.exit(-1);
	});
	process.on("beforeExit", () => {
		console.error("ERROR: Process exited");
		process.exit(-1);
	});
} else {
	throw new Error("Invalid worker invocation");
}

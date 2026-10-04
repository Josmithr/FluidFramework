/* Terminates a worker after a partial write; a mistaken direct retry is observable without exiting the test runner. */
import { appendFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isMainThread } from "node:worker_threads";

export { ReleaseLevel } from "./index.mjs";

/**
 * Records execution and a partial file before terminating the worker.
 * @param _configuration - Unused analyzer configuration.
 * @param directory - Absolute fixture package directory.
 * @throws If invoked directly, where terminating the test process would hide an incorrect retry.
 */
export async function analyzeAPIs(_configuration, directory) {
	await appendFile(path.join(directory, "calls.txt"), "analysis\n");
	await writeFile(path.join(directory, "partial.txt"), "partial output");
	if (isMainThread && process.send === undefined) {
		throw new Error("Unexpected direct execution of worker-exit fixture");
	}
	// eslint-disable-next-line unicorn/no-process-exit -- Intentionally tests worker termination before a result is sent.
	process.exit(23);
}

/* Reproduces an analyzer exception after recording execution, so retries are observable. */
import { appendFile } from "node:fs/promises";
import path from "node:path";

export { ReleaseLevel } from "./index.mjs";

/**
 * Records one call and throws an operational error instead of returning analysis.
 * @param _configuration - Unused analyzer configuration.
 * @param directory - Absolute fixture package directory.
 * @throws Always, after the execution log has been updated.
 */
export async function analyzeAPIs(_configuration, directory) {
	await appendFile(path.join(directory, "calls.txt"), "analysis\n");
	throw new Error("Fixture analyzer operational failure");
}

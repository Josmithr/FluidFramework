import { readFile } from "node:fs/promises";
import { findPackageJSON } from "node:module";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { type ApiAnalyzerModule, runApiAnalyzer } from "../apiAnalyzerRunner.js";
import type { ApiAnalyzerWorkerMessage, WorkerExecResult } from "./worker.js";
import { serializeWorkerError } from "./workerError.js";

/**
 * Loads the analyzer selected by the target package, independently of the worker's working directory.
 *
 * @remarks
 * Requires a package-relative string at `exports["."].import` and checks the runtime API exports.
 * The loaded analyzer owns validation of analysis settings and generated artifacts.
 *
 * @param directory - Absolute target package directory used for package resolution.
 * @returns The package-local ESM analyzer module.
 * @throws If the package cannot be resolved, loaded, or does not expose the required runner API.
 */
export async function loadApiAnalyzer(directory: string): Promise<ApiAnalyzerModule> {
	// Resolve from the target package, not from the worker module or its inherited working directory.
	const manifestPath = findPackageJSON(
		"api-analyzer",
		pathToFileURL(path.join(directory, "package.json")),
	);
	if (manifestPath === undefined) {
		throw new Error(`Install and build api-analyzer in ${directory} before running this task`);
	}
	const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
		/**
		 * Package identity, required to match the requested analyzer.
		 * @defaultValue Missing; manifest validation fails.
		 */
		name?: string;
		/**
		 * Package export map used to select the root ESM entrypoint.
		 * @defaultValue Missing; entrypoint validation fails.
		 */
		exports?: {
			/**
			 * Root entrypoint conditions.
			 * @defaultValue Missing; entrypoint validation fails.
			 */
			"."?: {
				/**
				 * Package-relative import entrypoint beginning with `./`.
				 * @defaultValue Missing; entrypoint validation fails.
				 */
				import?: string;
			};
		};
	};
	const entrypoint = manifest.exports?.["."]?.import;
	if (
		manifest.name !== "api-analyzer" ||
		typeof entrypoint !== "string" ||
		!entrypoint.startsWith("./")
	) {
		throw new Error(`Unsupported api-analyzer import entrypoint in ${manifestPath}`);
	}
	// A file URL also handles absolute Windows paths and URL-sensitive characters consistently.
	const module: unknown = await import(
		pathToFileURL(path.resolve(path.dirname(manifestPath), entrypoint)).href
	);
	if (
		module === null ||
		typeof module !== "object" ||
		!("analyzeAPIs" in module) ||
		typeof module.analyzeAPIs !== "function"
	) {
		throw new Error(`api-analyzer at ${manifestPath} does not export analyzeAPIs`);
	}
	if (
		!("ReleaseLevel" in module) ||
		module.ReleaseLevel === null ||
		typeof module.ReleaseLevel !== "object" ||
		["Public", "Beta", "Alpha", "Internal"].some(
			(key) => typeof Reflect.get(module.ReleaseLevel as object, key) !== "number",
		)
	) {
		throw new Error(`api-analyzer at ${manifestPath} does not export ReleaseLevel`);
	}
	return module as ApiAnalyzerModule;
}

/**
 * Executes the same analyzer workflow directly or inside a worker, without command fallback.
 *
 * @param message - Normalized settings, explicit output policy, and target package directory.
 * @returns Success, report-comparison diagnostics, or a serialized operational failure.
 */
export async function apiAnalyzerWorker(
	message: ApiAnalyzerWorkerMessage,
): Promise<WorkerExecResult> {
	try {
		const diagnostics = await runApiAnalyzer(
			message.settings,
			message.invocation,
			message.cwd,
			await loadApiAnalyzer(message.cwd),
		);
		return { code: diagnostics.length === 0 ? 0 : 1, diagnostics };
	} catch (error) {
		return {
			code: 1,
			error: serializeWorkerError(error instanceof Error ? error : new Error(String(error))),
		};
	}
}

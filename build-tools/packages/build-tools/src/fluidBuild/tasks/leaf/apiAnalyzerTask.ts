/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { findPackageJSON } from "node:module";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { ExecAsyncResult } from "../../../common/utils.js";
import type { BuildContext } from "../../buildContext.js";
import type { BuildPackage } from "../../buildGraph.js";
import { replaceRepoRootTokens } from "../../fluidBuildConfig.js";
import type { ApiAnalyzerTaskConfig, GitIgnoreSetting } from "../../fluidTaskDefinitions.js";
import { options } from "../../options.js";
import {
	type ApiAnalyzerModule,
	getOutputPath,
	readOwnedFiles,
	runApiAnalyzer,
} from "../apiAnalyzerRunner.js";
import { globWithGitignore } from "../taskUtils.js";
import { LeafWithGlobInputOutputDoneFileTask } from "./leafTask.js";

/**
 * Loads the target package's import-only analyzer without falling back to the build tool's dependencies.
 *
 * @remarks
 * Requires the current analyzer manifest shape: a package-relative string at `exports["."].import`.
 * Only the presence of `analyzeAPIs` and numeric release-level exports is checked here.
 * The loaded implementation remains responsible for fulfilling the runner's API contract.
 *
 * @param directory - Absolute target package directory from which Node resolves the analyzer package.
 * @returns The imported analyzer module for use by the programmatic runner.
 * @throws If resolution, manifest parsing, import validation, module loading, or export checks fail.
 */
export async function loadApiAnalyzer(directory: string): Promise<ApiAnalyzerModule> {
	// Resolve relative to the target package so its chosen tool version wins over the build tool's installation.
	const manifestPath = findPackageJSON(
		"api-analyzer",
		pathToFileURL(path.join(directory, "package.json")),
	);
	if (manifestPath === undefined) {
		throw new Error(`Install and build api-analyzer in ${directory} before running this task`);
	}
	const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
		/**
		 * Package name, required to match `api-analyzer` before loading.
		 * @defaultValue Missing; validation rejects the manifest.
		 */
		name?: string;

		/**
		 * Package export map inspected for its root ESM entrypoint.
		 * @defaultValue Missing; validation rejects the manifest.
		 */
		exports?: {
			/**
			 * Root export conditions; additional package subpaths are not used by this loader.
			 * @defaultValue Missing; validation rejects the manifest.
			 */
			"."?: {
				/**
				 * Package-relative ESM entrypoint beginning with `./`.
				 * @defaultValue Missing; validation rejects the manifest.
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
	// Import a file URL: raw absolute paths do not work uniformly across platforms or URL-sensitive characters.
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
 * Programmatic analyzer task with standard file-hash completion tracking.
 *
 * @remarks
 * Runs in the main process and generates a model in every output mode.
 * Shared graph references execute the same leaf once per build.
 * Incremental skipping requires an explicit input tracking contract in the task's files settings.
 * No shell fallback or worker retry is used.
 */
export class ApiAnalyzerTask extends LeafWithGlobInputOutputDoneFileTask {
	/**
	 * Registers a programmatic task with the normal leaf scheduling and diagnostic infrastructure.
	 *
	 * @param node - Build graph package that owns the task and its output files.
	 * @param context - Shared repository metadata for this build invocation.
	 * @param taskName - Configured task name used by graph dependencies.
	 * @param settings - Normalized analyzer settings passed to the runner during execution.
	 */
	constructor(
		node: BuildPackage,
		context: BuildContext,
		taskName: string,
		/**
		 * Normalized settings retained for this task's execution; the runner does not modify them.
		 */
		private readonly settings: ApiAnalyzerTaskConfig,
	) {
		super(node, "api-analyzer", context, taskName);
		if (settings.outputs?.model === undefined) {
			throw new Error(
				`${node.pkg.name}: api-analyzer task '${taskName}' requires a model destination`,
			);
		}
	}

	/**
	 * Requires declared local producer tasks so dependency models cannot be silently omitted.
	 */
	public override get requireDependencyTasks(): boolean {
		return true;
	}

	/**
	 * Enables completion caching only when input tracking is explicitly configured.
	 */
	protected get isIncremental(): boolean {
		return this.settings.files !== undefined && super.isIncremental;
	}

	/**
	 * Uses content hashes so unchanged files do not rerun analysis after timestamp-only changes.
	 */
	protected override get useHashes(): boolean {
		return true;
	}

	/**
	 * Declaration inputs can be gitignored build outputs, so they are tracked unless explicitly excluded.
	 */
	protected override get gitIgnore(): GitIgnoreSetting {
		return this.settings.files?.gitignore ?? [];
	}

	/**
	 * Uses normal lockfile invalidation unless the configured input contract explicitly opts out.
	 */
	protected override get includeLockFiles(): boolean {
		return this.settings.files?.includeLockFiles ?? true;
	}

	/**
	 * Keeps the completion marker distinct from the runner's output ownership manifest.
	 */
	protected override get doneFile(): string {
		return ".fluid-build-api.done.build.log";
	}

	/**
	 * Resolves configured input globs while excluding transient task metadata.
	 * @returns Package-relative or absolute input globs supported by the standard file-tracking base.
	 */
	protected async getInputGlobs(): Promise<readonly string[]> {
		return [
			...replaceRepoRootTokens(this.settings.files?.inputGlobs ?? [], this.context.repoRoot),
			"!**/.fluid-build-api*",
		];
	}

	/**
	 * Retains optional extra output globs alongside the exact configured artifact list.
	 * @returns Configured additional output globs.
	 */
	protected async getOutputGlobs(): Promise<readonly string[]> {
		return replaceRepoRootTokens(
			this.settings.files?.outputGlobs ?? [],
			this.context.repoRoot,
		);
	}

	/**
	 * Includes package configuration and the package-local tool build in the input fingerprint.
	 * @returns Complete explicitly configured inputs plus automatically tracked tool and package metadata.
	 * @throws If input discovery or package-local tool resolution fails.
	 */
	protected override async getInputFiles(): Promise<string[]> {
		const manifest = findPackageJSON(
			"api-analyzer",
			pathToFileURL(path.join(this.node.pkg.directory, "package.json")),
		);
		if (manifest === undefined) {
			throw new Error(`Cannot resolve api-analyzer for ${this.node.pkg.name}`);
		}
		const toolFiles = await globWithGitignore(
			[
				"**/*",
				"!node_modules/**",
				"!.git/**",
				"!src/**",
				"!docs/**",
				"!api-model/**",
				"!api-report/**",
				"!**/*.tsbuildinfo",
			],
			{
				cwd: path.dirname(manifest),
				gitignore: false,
			},
		);
		return [
			...new Set([
				...(await super.getInputFiles()),
				this.node.pkg.packageJsonFileName,
				...toolFiles,
				fileURLToPath(import.meta.url),
				fileURLToPath(new URL("../apiAnalyzerRunner.js", import.meta.url)),
			]),
		];
	}

	/**
	 * Tracks required artifacts exactly, including deleted rollup files that no longer match a glob.
	 * @returns Requested outputs and their ownership manifest; absent files invalidate completion.
	 * @throws If the ownership manifest is invalid or cannot identify a requested rollup set.
	 */
	protected override async getOutputFiles(): Promise<string[]> {
		const outputs = this.settings.outputs;
		if (outputs?.model === undefined) {
			throw new Error("Analyzer model destination is required");
		}
		const categories =
			options.apiOutputProfile === "all"
				? Object.keys(outputs)
				: this.settings.profiles?.[options.apiOutputProfile];
		if (categories === undefined) {
			throw new Error(`Unknown API output profile '${options.apiOutputProfile}'`);
		}
		const manifest = this.getPackageFileFullPath(".fluid-build-api.outputs.json");
		const owned = await readOwnedFiles(manifest);
		const files = [manifest, getOutputPath(this.node.pkg.directory, outputs.model.file)];
		if (categories.includes("reports")) {
			files.push(
				...(outputs.reports ?? []).map((output) =>
					getOutputPath(this.node.pkg.directory, output.file),
				),
			);
		}
		if (categories.includes("rollups")) {
			for (const output of outputs.rollups ?? []) {
				const generated = owned[`rollups:${output.directory}`];
				if (generated === undefined) {
					throw new Error(`Missing generated rollup manifest for ${output.directory}`);
				}
				files.push(...generated.map((file) => getOutputPath(this.node.pkg.directory, file)));
			}
		}
		return [...new Set([...files, ...(await super.getOutputFiles())])];
	}

	/**
	 * Combines standard file hashes with effective task settings and invocation policy.
	 *
	 * @returns Completion content, or undefined when input tracking is not configured or a lock is present.
	 * @throws If tracked input or output files cannot be read.
	 */
	protected async getDoneFileContent(): Promise<string | undefined> {
		if (
			this.settings.files === undefined ||
			existsSync(this.getPackageFileFullPath(".fluid-build-api.lock"))
		) {
			return undefined;
		}
		return JSON.stringify({
			settings: this.settings,
			reportMode: options.apiReportMode,
			profile: options.apiOutputProfile,
			node: process.version,
			files: await super.getDoneFileContent(),
		});
	}

	/**
	 * Records successful execution only when a complete input-tracking contract is configured.
	 */
	protected override async markExecDone(): Promise<void> {
		if (this.settings.files !== undefined) {
			await super.markExecDone();
		}
	}

	/**
	 * Loads the package-local analyzer and runs the task with the invocation's report and profile policies.
	 *
	 * @returns A normal leaf-task result. Comparison differences and operational exceptions become failed results
	 * with diagnostics, without triggering a command fallback or recording success.
	 */
	protected override async execCore(): Promise<ExecAsyncResult> {
		try {
			const differences = await runApiAnalyzer(
				this.settings,
				{ reportMode: options.apiReportMode, profile: options.apiOutputProfile },
				this.node.pkg.directory,
				await loadApiAnalyzer(this.node.pkg.directory),
			);
			// The runner may publish valid artifacts despite report differences; the graph must still see failure.
			if (differences.length !== 0) {
				throw new Error(differences.join("\n"));
			}
			return { error: null, stdout: "", stderr: "" };
		} catch (error) {
			const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
			// Feed failure into normal leaf accounting without retrying work that may already have written files.
			return {
				error: { name: "ApiAnalyzerTaskError", message, code: 1 },
				stdout: "",
				stderr: message,
			};
		}
	}
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, realpath, rename, rm } from "node:fs/promises";
import * as path from "node:path";
import type { ApiAnalyzerTaskSettings } from "../apiAnalyzerTaskConfig.js";

/**
 * Invocation policy supplied explicitly by Fluid Build.
 */
export interface ApiAnalyzerInvocation {
	/**
	 * Policy for reports that follow the build invocation; check-only reports remain read-only.
	 * The CLI supplies `check` when its report-mode option is omitted.
	 */
	readonly reportMode: "update" | "check";

	/**
	 * Named output profile to run, or `all` to request every configured category.
	 * The CLI supplies `all` when its profile option is omitted.
	 */
	readonly profile: string;
}

/**
 * The portion of the package-local analyzer API used by the runner.
 *
 * @remarks
 * This structural contract avoids a runtime dependency on a particular analyzer installation.
 * The loaded analyzer validates analysis configuration and owns selection and presentation behavior.
 */
export interface ApiAnalyzerModule {
	/**
	 * Runtime release-level values exported by the loaded analyzer.
	 * Selection conversion uses these values rather than assuming numeric ordinals.
	 */
	readonly ReleaseLevel: Readonly<Record<"Public" | "Beta" | "Alpha" | "Internal", number>>;

	/**
	 * Completes shared semantic analysis and releases compiler resources before returning.
	 *
	 * @param configuration - Analysis configuration, including any inherited object layers.
	 * @param directory - Absolute working directory for resolving configuration paths.
	 * @returns Detached analysis, or diagnostics for expected configuration or semantic failures.
	 * @throws If analysis encounters an unexpected operational or internal failure.
	 */
	analyzeAPIs(
		configuration: Readonly<Record<string, unknown>>,
		directory: string,
	): Promise<AnalyzerResult<CompletedApiAnalysis>>;
}

/**
 * Detached operation result from the analyzer's public API.
 *
 * @typeParam TValue - Payload available only when the operation succeeds.
 */
type AnalyzerResult<TValue> =
	| {
			/**
			 * Discriminant identifying a successful operation.
			 */
			readonly ok: true;

			/**
			 * Completed analysis or generated artifact content.
			 */
			readonly value: TValue;
	  }
	| {
			/**
			 * Discriminant identifying an expected operation failure.
			 */
			readonly ok: false;

			/**
			 * Analyzer diagnostics retained for reporting without interpreting version-specific fields.
			 */
			readonly diagnostics: readonly unknown[];
	  };

/**
 * Configuration and generation capabilities used from a successful detached analysis.
 *
 * @remarks
 * Generators return content without writing files or reopening compiler resources.
 */
interface CompletedApiAnalysis {
	/**
	 * Resolved analysis settings used to protect inputs from output writes.
	 */
	readonly configuration: {
		/**
		 * Absolute root of the analyzed package; the runner requires its own package directory.
		 */
		readonly packageRoot: string;

		/**
		 * Absolute TypeScript project configuration path.
		 */
		readonly project: string;

		/**
		 * Configured package surfaces and their resolved declaration inputs.
		 */
		readonly entrypoints: readonly {
			/**
			 * Surface name used by report requests, such as `.` or `./model`.
			 */
			readonly name: string;

			/**
			 * Absolute declaration path whose containing directory is protected from writes.
			 */
			readonly path: string;
		}[];
	};

	/**
	 * Generates the complete, unfiltered portable model.
	 *
	 * @returns Serialized model content, without writing it to disk.
	 * @throws If serialization encounters an internal failure.
	 */
	generateModel(): string;

	/**
	 * Generates declaration artifacts for every configured entrypoint using one selection.
	 *
	 * @param selection - Explicit release levels and modifier filters.
	 * @returns Content keyed by package-relative artifact path, or selection or generation diagnostics.
	 * @throws If generation encounters an unexpected internal failure.
	 */
	generateRollups(
		selection: AnalyzerSelection,
	): AnalyzerResult<Readonly<Record<string, string>>>;

	/**
	 * Generates a selected report without reading or modifying its accepted baseline.
	 *
	 * @param entrypoint - Configured surface name, not an input declaration path.
	 * @param selection - Explicit release levels and modifier filters.
	 * @param presentation - Report settings; omission uses the loaded analyzer's presentation defaults.
	 * @returns Report text, or diagnostics for invalid selection or entrypoint settings.
	 * @throws If the analyzer cannot render the requested declarations or encounters an internal failure.
	 */
	generateReport(
		entrypoint: string,
		selection: AnalyzerSelection,
		presentation?: Readonly<Record<string, unknown>>,
	): AnalyzerResult<string>;
}

/**
 * Selection values expected by the analyzer's public API.
 */
interface AnalyzerSelection {
	/**
	 * Nonempty configured selection name used to identify this view.
	 */
	readonly name: string;

	/**
	 * Explicit numeric release levels obtained from the loaded analyzer's enum.
	 */
	readonly releaseLevels: readonly number[];

	/**
	 * Whether untagged declarations may pass the release filter.
	 * @defaultValue `false`
	 */
	readonly includeUntagged?: boolean;

	/**
	 * Modifier tags that must all be present, using the analyzer's configured spelling.
	 * @defaultValue No required modifier tags.
	 */
	readonly requireTags?: readonly string[];

	/**
	 * Modifier tags whose presence excludes a declaration, using the analyzer's configured spelling.
	 * @defaultValue No excluded modifier tags.
	 */
	readonly excludeTags?: readonly string[];
}

/**
 * Generated content with its publication or comparison policy.
 */
interface PreparedFile {
	/**
	 * Package-relative output or baseline path, validated before publication.
	 */
	readonly file: string;

	/**
	 * Complete generated content to write or compare byte-for-byte with a baseline.
	 */
	readonly content: string;

	/**
	 * Whether to compare a report baseline without writing it.
	 * A mismatch is reported separately from generation or file-write failures.
	 */
	readonly check: boolean;

	/**
	 * Ownership group: `model`, a `rollups:` directory key, or `reports`.
	 * Reports never enter the generated-file ownership manifest.
	 */
	readonly group: string;
}

/**
 * Returns the successful operation value or exposes all returned diagnostics.
 *
 * @param result - Result from one call to the analyzer or a generator.
 * @returns The payload from a successful operation.
 * @throws If the operation failed; the error includes the serialized diagnostics.
 */
function getAnalyzerValue<TValue>(result: AnalyzerResult<TValue>): TValue {
	if (!result.ok) {
		throw new Error(`API analysis failed: ${JSON.stringify(result.diagnostics)}`);
	}
	return result.value;
}

/**
 * Rejects absolute, escaping, and metadata paths before touching output files.
 *
 * @param directory - Absolute package directory under which the path is resolved.
 * @param file - Nonempty forward-slash-separated relative path, without dot segments or reserved metadata names.
 * @returns The path joined to the package directory; file existence is not checked.
 * @throws If the path is invalid or could escape or overwrite task metadata.
 */
export function getOutputPath(directory: string, file: string): string {
	// Check the original segments before joining; path normalization would hide traversal segments.
	if (
		typeof file !== "string" ||
		file.length === 0 ||
		file.includes("\\") ||
		path.isAbsolute(file) ||
		file
			.split("/")
			.some(
				(part) =>
					part === ".." || part === "." || part === "" || part.startsWith(".fluid-build-api"),
			)
	) {
		throw new Error(`Invalid package-relative analyzer output path '${file}'`);
	}
	return path.join(directory, file);
}

/**
 * Checks every existing path component so a package output cannot follow a symlink.
 *
 * @remarks
 * Missing components are allowed because publication creates directories later.
 * This check does not prevent unrelated processes from changing the filesystem after validation.
 *
 * @param directory - Absolute package directory.
 * @param file - Package-relative file or directory path to inspect.
 * @throws If path validation fails, any component is a symlink, or filesystem inspection fails.
 */
async function checkOutputPath(directory: string, file: string): Promise<void> {
	getOutputPath(directory, file);
	let current = directory;
	for (const component of file.split("/")) {
		current = path.join(current, component);
		try {
			// stat would follow the link and lose the information needed to reject it.
			if ((await lstat(current)).isSymbolicLink()) {
				throw new Error(`Analyzer output path contains a symlink: ${file}`);
			}
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
				throw error;
			}
		}
	}
}

/**
 * Atomically replaces a file after staging its content beside the destination.
 *
 * @remarks
 * Creates parent directories when needed and removes its temporary file during cleanup.
 * Atomicity applies to the destination rename where the filesystem supports it, not to a set of outputs.
 *
 * @param file - Absolute destination path already checked for ownership and input conflicts.
 * @param content - Complete UTF-8 content to write.
 * @throws If directory creation, staging, replacement, or cleanup fails.
 */
async function replaceFile(file: string, content: string): Promise<void> {
	await mkdir(path.dirname(file), { recursive: true });
	// Staging beside the destination keeps the final rename on the same filesystem.
	const temporary = `${file}.${randomUUID()}.tmp`;
	try {
		const handle = await open(temporary, "wx");
		try {
			await handle.writeFile(content);
		} finally {
			await handle.close();
		}
		await rename(temporary, file);
	} finally {
		await rm(temporary, { force: true });
	}
}

/**
 * Reads ownership state separately from task success; a failed run can still own published files.
 *
 * @param file - Absolute ownership manifest path.
 * @returns Ownership groups mapped to package-relative generated paths, or an empty map if the manifest is missing.
 * @throws If the manifest cannot be read, is invalid JSON, or does not contain arrays of path strings.
 */
export async function readOwnedFiles(file: string): Promise<Record<string, string[]>> {
	try {
		const parsed: unknown = JSON.parse(await readFile(file, "utf8"));
		if (
			parsed === null ||
			typeof parsed !== "object" ||
			Array.isArray(parsed) ||
			Object.values(parsed).some(
				(files) =>
					!Array.isArray(files) || files.some((value: unknown) => typeof value !== "string"),
			)
		) {
			throw new Error(`Invalid analyzer ownership manifest: ${file}`);
		}
		return parsed as Record<string, string[]>;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return {};
		}
		throw error;
	}
}

/**
 * Runs one package analysis and publishes the requested artifacts without an incremental success cache.
 *
 * @remarks
 * Requires normalized task settings and acquires the package-local output lock before analysis.
 * Expected report differences are returned after publishing valid generated artifacts.
 * Abandoned locks require manual recovery after verifying that no build is running.
 *
 * @param settings - Normalized and validated task settings, including complete analysis configuration.
 * @param invocation - Explicit report policy and selected output profile for this invocation.
 * @param packageDirectory - Target package directory, resolved to its real path before acquiring the lock.
 * @param analyzer - Package-local analyzer API loaded by the task boundary.
 * @returns All missing or different checked-report messages; an empty array means all requested comparisons passed.
 * @throws If configuration, analysis, generation, locking, ownership checks, publication, or cleanup fails.
 * Output files may already have changed when a publication or cleanup failure occurs.
 */
export async function runApiAnalyzer(
	settings: ApiAnalyzerTaskSettings,
	invocation: ApiAnalyzerInvocation,
	packageDirectory: string,
	analyzer: ApiAnalyzerModule,
): Promise<readonly string[]> {
	if (settings.analyzer === undefined) {
		throw new Error("api-analyzer task requires analysis configuration");
	}
	if (!["check", "update"].includes(invocation.reportMode)) {
		throw new Error("Invalid API report mode");
	}
	const outputs = settings.outputs ?? {};
	if (outputs.model === undefined) {
		throw new Error("api-analyzer task requires a model destination for dependent packages");
	}
	const requestedCategories =
		invocation.profile === "all"
			? Object.keys(outputs)
			: settings.profiles?.[invocation.profile];
	if (
		requestedCategories === undefined ||
		requestedCategories.some(
			(category) => !Object.prototype.hasOwnProperty.call(outputs, category),
		)
	) {
		throw new Error(`Unknown or unconfigured API output profile '${invocation.profile}'`);
	}
	// Every mode produces the artifact that downstream analyzer tasks require.
	const categories = [...new Set(["model", ...requestedCategories])];
	const directory = await realpath(packageDirectory);
	const lockPath = path.join(directory, ".fluid-build-api.lock");
	// Acquire outside the cleanup block: a failed acquisition must not remove another build's lock.
	const lock = await open(lockPath, "wx").catch((error: NodeJS.ErrnoException) => {
		if (error.code === "EEXIST") {
			throw new Error(
				`Analyzer output lock exists: ${lockPath}. Verify no build is running before removing an abandoned lock.`,
			);
		}
		throw error;
	});
	try {
		await lock.writeFile(JSON.stringify({ pid: process.pid }));
		const analysis = getAnalyzerValue(
			await analyzer.analyzeAPIs(settings.analyzer, directory),
		);
		if (path.resolve(analysis.configuration.packageRoot) !== directory) {
			throw new Error("Analyzer packageRoot must be the task's package directory");
		}
		// Complete every requested generator before writing, so a generation error publishes nothing.
		const prepared = prepareArtifacts(
			settings,
			invocation,
			categories,
			directory,
			analysis,
			analyzer.ReleaseLevel,
		);
		// Await here so finally does not release the lock while publication is still running.
		return await publishArtifacts(
			settings,
			directory,
			analysis,
			prepared.files,
			prepared.activeGroups,
		);
	} finally {
		await lock.close();
		await rm(lockPath, { force: true });
	}
}

/**
 * Prepares all selected content before any publication, preserving one generation per variant.
 *
 * @param settings - Normalized task configuration with output destinations and named selections.
 * @param invocation - Report policy applied when preparing comparison-only files.
 * @param categories - Configured output categories requested by the active profile.
 * @param directory - Absolute package directory used to validate rollup paths.
 * @param analysis - Completed analysis shared by all generator calls.
 * @param releaseLevels - Runtime release-level values from the loaded analyzer.
 * @returns Prepared content and the generated ownership groups refreshed by this request.
 * @throws If a selection is missing, a rollup path is invalid, or any requested generation fails.
 */
function prepareArtifacts(
	settings: ApiAnalyzerTaskSettings,
	invocation: ApiAnalyzerInvocation,
	categories: readonly string[],
	directory: string,
	analysis: CompletedApiAnalysis,
	releaseLevels: ApiAnalyzerModule["ReleaseLevel"],
): {
	/**
	 * Generated files to publish or compare, including reports.
	 */
	files: PreparedFile[];

	/**
	 * Model and rollup groups refreshed by this request; report baselines are excluded.
	 */
	activeGroups: Set<string>;
} {
	const outputs = settings.outputs ?? {};
	const files: PreparedFile[] = [];
	const activeGroups = new Set<string>();
	// Destinations are not part of a content variant; reuse content when several outputs request it.
	const rollups = new Map<string, Readonly<Record<string, string>>>();
	const reports = new Map<string, string>();
	/**
	 * Converts a named task selection to the loaded analyzer's release-level values.
	 *
	 * @param name - Key of a configured task selection.
	 * @returns Selection settings with the name attached and numeric release levels substituted.
	 * @throws If no selection is configured under the requested name.
	 */
	const getSelection = (name: string): AnalyzerSelection => {
		const value = settings.selections?.[name];
		if (value === undefined) {
			throw new Error(`Unknown analyzer selection '${name}'`);
		}
		const levels = {
			public: releaseLevels.Public,
			beta: releaseLevels.Beta,
			alpha: releaseLevels.Alpha,
			internal: releaseLevels.Internal,
		};
		return {
			...value,
			name,
			releaseLevels: value.releaseLevels.map((level) => levels[level]),
		};
	};
	if (categories.includes("model") && outputs.model !== undefined) {
		activeGroups.add("model");
		files.push({
			file: outputs.model.file,
			content: analysis.generateModel(),
			check: false,
			group: "model",
		});
	}
	if (categories.includes("rollups")) {
		for (const output of outputs.rollups ?? []) {
			const group = `rollups:${output.directory}`;
			activeGroups.add(group);
			getOutputPath(directory, output.directory);
			let generated = rollups.get(output.selection);
			if (generated === undefined) {
				generated = getAnalyzerValue(analysis.generateRollups(getSelection(output.selection)));
				rollups.set(output.selection, generated);
			}
			for (const [relative, content] of Object.entries(generated)) {
				getOutputPath(directory, relative);
				files.push({
					file: `${output.directory}/${relative}`,
					content,
					check: false,
					group,
				});
			}
		}
	}
	if (categories.includes("reports")) {
		for (const output of outputs.reports ?? []) {
			// Include presentation in the key, but keep baseline location and write policy separate.
			const key = JSON.stringify([output.entrypoint, output.selection, output.presentation]);
			let content = reports.get(key);
			if (content === undefined) {
				content = getAnalyzerValue(
					analysis.generateReport(
						output.entrypoint,
						getSelection(output.selection),
						output.presentation,
					),
				);
				reports.set(key, content);
			}
			files.push({
				file: output.file,
				content,
				// Invocation-wide updates must not override a report's permanent check-only policy.
				check: invocation.reportMode === "check" || output.mode === "check",
				group: "reports",
			});
		}
	}
	return { files, activeGroups };
}

/**
 * Checks baselines and output ownership, then publishes the prepared set under the package lock.
 *
 * @remarks
 * Saves recovery ownership before replacing files. Unrequested configured groups retain their files.
 * Files from removed groups are deleted only when recorded in the previous ownership manifest.
 * Report baselines are never part of generated-file cleanup, and report differences do not prevent writes.
 *
 * @param settings - Complete output configuration, including groups omitted by the active profile.
 * @param directory - Absolute package directory whose lock is already held by the caller.
 * @param analysis - Resolved configuration used to protect input paths.
 * @param files - Prepared artifacts and report comparisons for the current request.
 * @param activeGroups - Generated ownership groups whose current file lists must replace previous lists.
 * @returns Messages for missing or different checked reports after successful publication.
 * @throws If a path conflicts with inputs or ownership, or any read, write, or cleanup fails.
 * A publication failure can leave a partial artifact set and its recovery manifest.
 */
async function publishArtifacts(
	settings: ApiAnalyzerTaskSettings,
	directory: string,
	analysis: CompletedApiAnalysis,
	files: readonly PreparedFile[],
	activeGroups: ReadonlySet<string>,
): Promise<readonly string[]> {
	const outputs = settings.outputs ?? {};
	const protectedPaths = [
		analysis.configuration.project,
		...analysis.configuration.entrypoints.map((entrypoint) => path.dirname(entrypoint.path)),
		path.join(directory, "src"),
		path.join(directory, "node_modules"),
		path.join(directory, "package.json"),
	];
	const seen = new Set<string>();
	/**
	 * Protects known input paths and checks the destination for symlink components.
	 *
	 * @param file - Package-relative generated path to publish or remove.
	 * @throws If the path overlaps a protected input, is invalid, contains a symlink, or cannot be inspected.
	 */
	const validatePath = async (file: string): Promise<void> => {
		const fullPath = getOutputPath(directory, file);
		if (
			protectedPaths.some(
				(input) => fullPath === input || fullPath.startsWith(`${input}${path.sep}`),
			)
		) {
			throw new Error(`Analyzer output would overwrite an input: ${file}`);
		}
		await checkOutputPath(directory, file);
	};
	// Validate the entire prepared set before any write, including file/directory collisions.
	for (const output of files) {
		await validatePath(output.file);
		if (
			seen.has(output.file) ||
			[...seen].some(
				(file) => file.startsWith(`${output.file}/`) || output.file.startsWith(`${file}/`),
			)
		) {
			throw new Error(`Overlapping analyzer outputs: ${output.file}`);
		}
		seen.add(output.file);
	}
	// Comparison failures still allow valid generated artifacts to be published; collect rather than throw.
	const differences: string[] = [];
	for (const output of files.filter((file) => file.check)) {
		let baseline: string | undefined;
		try {
			baseline = await readFile(getOutputPath(directory, output.file), "utf8");
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
				throw error;
			}
		}
		if (baseline !== output.content) {
			differences.push(
				`API report ${baseline === undefined ? "missing" : "differs"}: ${output.file}`,
			);
		}
	}
	const manifestPath = path.join(directory, ".fluid-build-api.outputs.json");
	const previous = await readOwnedFiles(manifestPath);
	const next = { ...previous };
	const stale: string[] = [];
	// Absence from the current profile is not removal from configuration.
	// Keep inactive configured groups, but retire groups that no longer have an output definition.
	const configuredGroups = new Set([
		...(outputs.model === undefined ? [] : ["model"]),
		...(outputs.rollups ?? []).map((output) => `rollups:${output.directory}`),
	]);
	for (const [group, ownedFiles] of Object.entries(previous)) {
		if (!configuredGroups.has(group)) {
			stale.push(...ownedFiles.filter((file) => !seen.has(file)));
			delete next[group];
		}
	}
	for (const group of activeGroups) {
		const current = files.filter((file) => file.group === group).map((file) => file.file);
		// A path reused by any current output must not be deleted as an old group's stale file.
		stale.push(...(previous[group] ?? []).filter((file) => !seen.has(file)));
		next[group] = current;
	}
	for (const file of stale) {
		await validatePath(file);
	}
	for (const output of files.filter((file) => !file.check)) {
		// Reports intentionally replace accepted baselines; generated artifacts must already be owned or absent.
		if (output.group !== "reports" && !(previous[output.group] ?? []).includes(output.file)) {
			try {
				await lstat(getOutputPath(directory, output.file));
				throw new Error(
					`Analyzer refuses to overwrite an unowned generated file: ${output.file}`,
				);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
					throw error;
				}
			}
		}
	}
	// Persist the union before touching outputs so an interrupted run can recover files from either set.
	const recovery = { ...previous };
	for (const group of activeGroups) {
		recovery[group] = [...new Set([...(previous[group] ?? []), ...(next[group] ?? [])])];
	}
	if (activeGroups.size !== 0 || stale.length !== 0) {
		await replaceFile(manifestPath, JSON.stringify(recovery));
	}
	for (const output of files.filter((file) => !file.check)) {
		await replaceFile(getOutputPath(directory, output.file), output.content);
	}
	for (const file of stale) {
		await rm(getOutputPath(directory, file), { force: true });
	}
	// Narrow ownership only after writes and cleanup succeed; this manifest is not a success marker.
	if (activeGroups.size !== 0 || stale.length !== 0) {
		await replaceFile(manifestPath, JSON.stringify(next));
	}
	return differences;
}

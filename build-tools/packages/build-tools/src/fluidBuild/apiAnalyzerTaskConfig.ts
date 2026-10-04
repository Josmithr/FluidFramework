/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Output categories that a programmatic analyzer task can request.
 *
 * @remarks
 * Rollups and reports use configured selections. The model always describes the complete analysis.
 */
export type ApiAnalyzerOutputCategory = "rollups" | "model" | "reports";

/**
 * Selection settings converted to the analyzer's public selection contract at execution time.
 */
export interface ApiAnalyzerSelection {
	/**
	 * Explicit release levels to include; selecting one level does not include any other level.
	 * An empty array selects no tagged declarations.
	 */
	readonly releaseLevels: readonly ("public" | "beta" | "alpha" | "internal")[];

	/**
	 * Whether declarations without a release tag may pass the release filter.
	 * @defaultValue `false`
	 */
	readonly includeUntagged?: boolean;

	/**
	 * Modifier tags that must all be present on a selected declaration.
	 * Tag names use the analyzer's configured spelling, including the leading `@`.
	 * @defaultValue No required modifier tags.
	 */
	readonly requireTags?: readonly string[];

	/**
	 * Modifier tags that each exclude a declaration when present.
	 * Tag names use the analyzer's configured spelling, including the leading `@`.
	 * @defaultValue No excluded modifier tags.
	 */
	readonly excludeTags?: readonly string[];
}

/**
 * Artifact destinations available to output profiles.
 *
 * @remarks
 * Omitted rollup and report categories are disabled. Every executable task requires a model destination.
 * All destinations are relative to the target package.
 * Generated artifacts must not overwrite analysis inputs or overlap another configured destination.
 */
export interface ApiAnalyzerOutputs {
	/**
	 * Selected declaration artifact sets, each written to its own directory.
	 * @defaultValue No declaration rollups.
	 */
	readonly rollups?: readonly {
		/**
		 * Key of a selection in {@link ApiAnalyzerTaskSettings.selections}.
		 */
		readonly selection: string;

		/**
		 * Package-relative destination directory for the complete returned artifact set.
		 * Shared and entrypoint declaration filenames remain unchanged beneath this directory.
		 */
		readonly directory: string;
	}[];

	/**
	 * Destination for the complete, unfiltered portable model.
	 * The model is generated in every mode so dependent packages can consume it.
	 * @defaultValue Inherit the shared destination; task creation fails if no destination is configured.
	 */
	readonly model?: {
		/**
		 * Package-relative output file, including its filename and extension.
		 */
		readonly file: string;
	};

	/**
	 * Selected entrypoint reports to compare with or write to accepted baselines.
	 * @defaultValue No report generation or baseline comparisons.
	 */
	readonly reports?: readonly {
		/**
		 * Configured entrypoint name, such as `.` or `./model`, rather than a declaration path.
		 */
		readonly entrypoint: string;

		/**
		 * Key of a selection in {@link ApiAnalyzerTaskSettings.selections}.
		 */
		readonly selection: string;

		/**
		 * Package-relative accepted baseline file to compare or update.
		 */
		readonly file: string;

		/**
		 * Whether to follow the invocation's report mode or always check the baseline without writing it.
		 * `check` remains read-only even when the invocation requests updates.
		 * @defaultValue `"build"`
		 */
		readonly mode?: "build" | "check";

		/**
		 * Presentation settings forwarded to the loaded analyzer's report generator.
		 * @defaultValue The loaded analyzer's report presentation defaults.
		 */
		readonly presentation?: Readonly<Record<string, unknown>>;
	}[];
}

/**
 * Programmatic analyzer settings embedded in a Fluid Build task definition.
 *
 * @remarks
 * Analysis configuration is validated by the package-local analyzer, not a duplicated schema.
 * Presentation settings are forwarded to that analyzer's report generator.
 * The required kind identifies analyzer tasks. Other properties may be inherited from shared defaults.
 */
export interface ApiAnalyzerTaskSettings {
	/**
	 * Explicit opt-in to programmatic analyzer execution, without a matching package script.
	 */
	readonly kind: "api-analyzer";

	/**
	 * Analysis configuration passed to the target package's analyzer, with paths relative to that package.
	 * Inherited and local configurations form ordered object layers using the analyzer's `extends` contract.
	 * @defaultValue Inherit the global analysis configuration; execution fails if neither layer supplies one.
	 */
	readonly analyzer?: Readonly<Record<string, unknown>>;

	/**
	 * Named declaration selections shared by rollup and report requests.
	 * Local entries replace inherited entries with the same name.
	 * @defaultValue Inherited selections, or an empty map when none are configured.
	 */
	readonly selections?: Readonly<Record<string, ApiAnalyzerSelection>>;

	/**
	 * Named sets of optional output categories. An empty set requests validation and model generation only.
	 * Model generation is always included, even when a profile does not list it.
	 * The reserved `all` profile is implicit and selects every configured output category.
	 * Local category arrays replace inherited arrays for the same profile name.
	 * @defaultValue Inherited profiles, or no named profiles when none are configured.
	 */
	readonly profiles?: Readonly<Record<string, readonly ApiAnalyzerOutputCategory[]>>;

	/**
	 * Output destinations, merged with global defaults by category.
	 * Local rollup and report arrays replace inherited arrays rather than appending to them.
	 * @defaultValue Inherited outputs; task creation fails if no model destination is configured.
	 */
	readonly outputs?: ApiAnalyzerOutputs;
}

/**
 * Combines analyzer defaults with a package's explicit opt-in without modifying either input.
 *
 * @remarks
 * Analysis layers retain analyzer-owned inheritance semantics; named maps merge and output arrays replace.
 *
 * @param local - Settings for the current configuration layer.
 * @param inherited - Previously normalized defaults, or `undefined` when there are no defaults.
 * @returns Cloned analyzer settings with an explicit kind and normalized selection, profile, and output maps.
 * @throws If a supplied configuration value cannot be cloned.
 */
export function mergeApiAnalyzerTaskSettings(
	local: ApiAnalyzerTaskSettings,
	inherited: ApiAnalyzerTaskSettings | undefined,
): ApiAnalyzerTaskSettings {
	// Let the analyzer merge its own nested rules instead of flattening them with build-task settings.
	const analyzer =
		local.analyzer !== undefined && inherited?.analyzer !== undefined
			? { extends: [inherited.analyzer, local.analyzer] }
			: (local.analyzer ?? inherited?.analyzer);
	// Shared defaults may serve several packages; none should retain mutable references to another's settings.
	return {
		kind: "api-analyzer",
		...(analyzer === undefined ? {} : { analyzer: structuredClone(analyzer) }),
		selections: structuredClone({ ...inherited?.selections, ...local.selections }),
		profiles: structuredClone({ ...inherited?.profiles, ...local.profiles }),
		outputs: structuredClone({ ...inherited?.outputs, ...local.outputs }),
	};
}

/**
 * Validates an adapter-owned configuration object without accepting unknown properties.
 *
 * @param value - Untrusted configuration value to narrow to an object.
 * @param allowed - Permitted own property names. Required values are checked separately.
 * @throws If the value is null, is not an object, is an array, or contains an unrecognized property.
 */
function validateFields(
	value: unknown,
	allowed: readonly string[],
): asserts value is Record<string, unknown> {
	if (
		value === null ||
		typeof value !== "object" ||
		Array.isArray(value) ||
		Object.keys(value).some((key) => !allowed.includes(key))
	) {
		throw new Error("Invalid or unknown api-analyzer configuration fields");
	}
}

/**
 * Validates required nonempty text settings.
 *
 * @param value - Value that must be a string containing non-whitespace characters.
 * @throws If the value is not a string or contains only whitespace.
 */
function validateText(value: unknown): asserts value is string {
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new Error("api-analyzer configuration requires nonempty text");
	}
}

/**
 * Validates the selected artifact definitions without duplicating the analyzer's semantic policy.
 *
 * @param outputs - Output settings to validate, including all destinations regardless of the active profile.
 * @throws If a category or field is invalid, a destination escapes the package, or destinations overlap.
 */
function validateOutputs(outputs: ApiAnalyzerOutputs): void {
	validateFields(outputs, ["model", "rollups", "reports"]);
	if (outputs.model !== undefined) {
		validateFields(outputs.model, ["file"]);
		validateText(outputs.model.file);
	}
	for (const category of ["rollups", "reports"] as const) {
		const entries = outputs[category];
		if (entries === undefined) {
			continue;
		}
		if (!Array.isArray(entries)) {
			throw new Error(`api-analyzer '${category}' must be an array`);
		}
		for (const entry of entries) {
			validateFields(
				entry,
				category === "rollups"
					? ["selection", "directory"]
					: ["selection", "entrypoint", "file", "mode", "presentation"],
			);
			validateText(entry.selection);
			if (category === "rollups") {
				validateText(entry.directory);
			} else {
				validateText(entry.file);
				validateText(entry.entrypoint);
				if (entry.mode !== undefined && entry.mode !== "check" && entry.mode !== "build") {
					throw new Error("Invalid api-analyzer report mode");
				}
				if (
					entry.presentation !== undefined &&
					(entry.presentation === null ||
						typeof entry.presentation !== "object" ||
						Array.isArray(entry.presentation))
				) {
					throw new Error("api-analyzer report presentation must be an object");
				}
			}
		}
	}
	validateOutputDestinations(outputs);
}

/**
 * Checks configured output destinations for invalid path segments and overlapping ownership.
 *
 * @param outputs - Structurally validated output definitions, including categories omitted by the active profile.
 * @throws If a path is not package-relative, uses reserved metadata names, or overlaps another destination.
 */
function validateOutputDestinations(outputs: ApiAnalyzerOutputs): void {
	// Reserve entire rollup directories, not only today's filenames, so later variants cannot collide with other outputs.
	const destinations = [
		...(outputs.model === undefined ? [] : [outputs.model.file]),
		...(outputs.rollups ?? []).map((output) => output.directory),
		...(outputs.reports ?? []).map((output) => output.file),
	];
	const seen: string[] = [];
	for (const destination of destinations) {
		validateText(destination);
		if (
			destination.includes("\\") ||
			destination.includes(":") ||
			destination
				.split("/")
				.some(
					(part) =>
						part === "" ||
						part === "." ||
						part === ".." ||
						part.startsWith(".fluid-build-api"),
				)
		) {
			throw new Error(`Invalid api-analyzer output path '${destination}'`);
		}
		// Equality catches duplicate owners; either prefix catches a file occupying another output's directory.
		if (
			seen.some(
				(previous) =>
					previous === destination ||
					previous.startsWith(`${destination}/`) ||
					destination.startsWith(`${previous}/`),
			)
		) {
			throw new Error(`Overlapping api-analyzer output destinations: ${destination}`);
		}
		seen.push(destination);
	}
}

/**
 * Rejects ambiguous execution settings before a programmatic task enters the graph.
 *
 * @remarks
 * Nested analysis configuration is left to the selected analyzer version.
 * This check accepts partial shared defaults; it does not require complete execution settings.
 *
 * @param config - On-disk analyzer settings before task normalization adds internal properties.
 * @throws If an adapter-owned field, profile, selection, output definition, or destination is invalid.
 */
export function validateApiAnalyzerTaskSettings(config: ApiAnalyzerTaskSettings): void {
	const allowed = new Set([
		"kind",
		"analyzer",
		"selections",
		"profiles",
		"outputs",
		"files",
		"dependsOn",
		"before",
		"after",
	]);
	for (const key of Object.keys(config)) {
		if (!allowed.has(key)) {
			throw new Error(`Unsupported api-analyzer task setting '${key}'`);
		}
	}
	for (const key of ["analyzer", "selections", "profiles", "outputs"] as const) {
		const value = config[key];
		if (
			value !== undefined &&
			(value === null || typeof value !== "object" || Array.isArray(value))
		) {
			throw new Error(`api-analyzer task '${key}' must be an object`);
		}
	}
	// "all" is computed from configured categories and must not be replaced by a user-defined subset.
	for (const [name, categories] of Object.entries(config.profiles ?? {})) {
		if (
			name.trim().length === 0 ||
			name === "all" ||
			!Array.isArray(categories) ||
			categories.some(
				(category: unknown) =>
					typeof category !== "string" || !["rollups", "model", "reports"].includes(category),
			)
		) {
			throw new Error(`Invalid api-analyzer output profile '${name}'`);
		}
	}
	for (const [name, selection] of Object.entries(config.selections ?? {})) {
		validateText(name);
		validateFields(selection, [
			"releaseLevels",
			"includeUntagged",
			"requireTags",
			"excludeTags",
		]);
		if (
			!Array.isArray(selection.releaseLevels) ||
			selection.releaseLevels.some(
				(level: unknown) =>
					typeof level !== "string" ||
					!["public", "beta", "alpha", "internal"].includes(level),
			)
		) {
			throw new Error(`Invalid api-analyzer release selection '${name}'`);
		}
		if (
			selection.includeUntagged !== undefined &&
			typeof selection.includeUntagged !== "boolean"
		) {
			throw new Error("api-analyzer includeUntagged must be a boolean");
		}
		for (const tags of [selection.requireTags, selection.excludeTags]) {
			if (
				tags !== undefined &&
				(!Array.isArray(tags) ||
					tags.some((tag) => typeof tag !== "string" || tag.trim().length === 0))
			) {
				throw new Error("api-analyzer selection tags must be nonempty strings");
			}
		}
	}
	if (config.outputs !== undefined) {
		validateOutputs(config.outputs);
	}
}

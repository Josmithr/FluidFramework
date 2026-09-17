import type { ClassificationRules } from "./classification.js";
import type { TsdocOptions } from "./tsdocOptions.js";

/**
 * A named declaration entrypoint in one compiler resolution context.
 */
export interface Entrypoint {
	/**
	 * The entrypoint name used to identify its API surface, such as `.` or `./browser`.
	 *
	 * @remarks
	 * Must be nonempty and unique within the effective configuration.
	 */
	readonly name: string;
	/**
	 * The path to the entrypoint file.
	 *
	 * @remarks
	 * Must be nonempty.
	 * Relative paths use the working directory supplied during configuration resolution.
	 * The effective configuration contains an absolute path.
	 */
	readonly path: string;
}

/**
 * Programmatic analysis settings.
 *
 * @remarks
 * Later bases and local values override earlier values.
 */
export interface Configuration extends TsdocOptions {
	/**
	 * Base configurations applied in array order before this configuration.
	 *
	 * @remarks
	 * Each base's inherited configurations are applied before its own settings.
	 * Inheritance cycles are rejected.
	 *
	 * @defaultValue No base configurations.
	 */
	readonly extends?: readonly Configuration[];
	/**
	 * The package name used to identify the analyzed package in API facts.
	 *
	 * @remarks
	 * A nonempty value must be supplied here or through inheritance.
	 *
	 * @defaultValue The inherited package name. If none is supplied, configuration resolution fails.
	 */
	readonly packageName?: string;
	/**
	 * The package root directory used to determine declaration origins.
	 *
	 * @remarks
	 * Relative paths use the working directory supplied during configuration resolution.
	 *
	 * @defaultValue The inherited package root, or the caller's working directory if none is supplied.
	 */
	readonly packageRoot?: string;
	/**
	 * The path to the TypeScript project configuration that controls analysis and module resolution.
	 *
	 * @remarks
	 * A nonempty value must be supplied here or through inheritance.
	 * Relative paths use the working directory supplied during configuration resolution.
	 *
	 * @defaultValue The inherited project path. If none is supplied, configuration resolution fails.
	 */
	readonly project?: string;
	/**
	 * The entrypoints to analyze in the selected TypeScript project.
	 *
	 * @remarks
	 * A supplied array replaces the inherited array. The effective array must not be empty.
	 * File paths use the caller's working directory, not the package root or project directory.
	 *
	 * @defaultValue The inherited entrypoint list. If none is supplied, configuration resolution fails.
	 */
	readonly entrypoints?: readonly Entrypoint[];
	/**
	 * Enabled or disabled classification rules.
	 *
	 * @remarks
	 * Settings merge with inherited rules; a local value, including `false`, overrides the same key.
	 * Documentation reference resolution still requires valid TSDoc, even when classification tolerates syntax errors.
	 *
	 * @defaultValue The inherited rule settings, or an empty map if none are supplied.
	 */
	readonly rules?: ClassificationRules;
}

/**
 * Complete settings used by one analysis invocation.
 *
 * @remarks
 * Paths are absolute.
 */
export interface EffectiveConfiguration {
	/**
	 * The resolved, nonempty package name used in API facts.
	 */
	readonly packageName: string;
	/**
	 * The absolute package root directory, including the working-directory default when applicable.
	 */
	readonly packageRoot: string;
	/**
	 * The absolute path to the TypeScript project configuration used for analysis.
	 *
	 * @remarks
	 * Configuration resolution does not check whether the file exists.
	 */
	readonly project: string;
	/**
	 * The resolved, nonempty entrypoint list with unique names and absolute file paths.
	 *
	 * @remarks
	 * The analyzer checks that the files belong to the selected TypeScript project.
	 */
	readonly entrypoints: readonly Entrypoint[];
	/**
	 * The merged rule settings after inheritance and overrides, or an empty map if none were supplied.
	 *
	 * @remarks
	 * Omitted classification rules use their documented defaults.
	 */
	readonly rules: ClassificationRules;
	/**
	 * Custom modifier names shared by classification and documentation processing.
	 */
	readonly customModifierTags: readonly string[];
}

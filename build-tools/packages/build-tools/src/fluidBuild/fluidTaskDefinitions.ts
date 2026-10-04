/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { PackageJson } from "../common/npmPackage.js";
import {
	type ApiAnalyzerTaskSettings,
	mergeApiAnalyzerTaskSettings,
	validateApiAnalyzerTaskSettings,
} from "./apiAnalyzerTaskConfig.js";
import { validateDeclarativeTaskPathSeparators } from "./fluidBuildConfig.js";
import { isConcurrentlyCommand, parseConcurrentlyCommand } from "./parseCommands.js";

/**
 * Normalized Fluid Build tasks indexed by task name.
 *
 * @remarks
 * Each configuration contains shared scheduling metadata and one supported execution variant.
 * Use {@link TaskConfigOnDisk} for definitions that still contain shorthand or omitted defaults.
 */
export interface TaskDefinitions {
	/**
	 * Normalized configuration selected by its package task name.
	 */
	readonly [name: string]: TaskConfig;
}

/**
 * Task Name is a simple string that is normally a script name in the package.json.
 */
type TaskName = string;

type AnyTaskName = "*";

type PackageName = string;

/**
 * Task Dependencies Expansion:
 * When specify task dependencies, the following syntax is supported:
 * - "<name>": another task within the package
 * - "^<name>": all the task with the name in dependent packages.
 * - "*": any other task within the package (for 'before' and 'after' only, not allowed in 'dependsOn')
 * - "^*": all the task in the dependent packages (for 'after' only, not allowed in 'dependsOn' or 'before')
 *
 * When task definition is augmented in the package.json itself, the dependencies can also be:
 * - "<package>#<name>": specific dependent package's task
 * - "...": expand to the dependencies in global fluidBuild config (default is override)
 */
type TaskDependency =
	| TaskName
	| AnyTaskName
	| `^${TaskName | AnyTaskName}`
	| `${PackageName}#${TaskName | AnyTaskName}`
	| "...";

export type TaskDependencies = readonly TaskDependency[];

export type GitIgnoreSetting = ("input" | "output")[];
export interface TaskFileDependencies {
	/**
	 * An array of globs that will be used to identify input files for the task. The globs are interpreted relative to the
	 * package the task belongs to.
	 *
	 * You can use the special token `${repoRoot}` to reference files at the repository root without using relative paths.
	 *
	 * By default, inputGlobs **will not** match files ignored by git. This can be changed using the `gitignore` property
	 * on the task. See the documentation for that property for details.
	 */
	inputGlobs: readonly string[];

	/**
	 * An array of globs that will be used to identify output files for the task. The globs are interpreted relative to
	 * the package the task belongs to.
	 *
	 * You can use the special token `${repoRoot}` to reference files at the repository root without using relative paths.
	 *
	 * By default, outputGlobs **will** match files ignored by git, because build output is often gitignored. This can be
	 *   changed using the `gitignore` property on the task. See the documentation for that property for details.
	 */
	outputGlobs: readonly string[];

	/**
	 * Configures how gitignore rules are applied. "input" applies gitignore rules to the input, "output" applies them to
	 * the output, and including both values will apply the gitignore rules to both the input and output globs.
	 *
	 * The default value, `["input"]` applies gitignore rules to the input, but not the output. This is the right behavior
	 * for many tasks since most tasks use source-controlled files as input but generate gitignored build output. However,
	 * it can be adjusted on a per-task basis depending on the needs of the task.
	 *
	 * @defaultValue `["input"]`
	 */
	gitignore?: GitIgnoreSetting;

	/**
	 * Specify whether the task will depend on the package/workspace lock file, this task will be rebuilt if the lock file
	 * is changed. Provides an economical but broad way to ensure rebuild when tools or package dependencies changes.
	 *
	 * Default is true, and it is equivalent to putting the lock file in the `inputGlobs`.
	 *
	 * For fine-grained control, use `inputGlobs` and `outputGlobs` to specify the dependencies in `node_modules`
	 * and set this to false.
	 */
	includeLockFiles?: boolean;

	/**
	 * Additional configuration files to track for known task handlers (e.g., eslint, tsc, api-extractor).
	 * These files will be included in the task's incremental build tracking in addition to the files
	 * the task handler automatically discovers (like .eslintrc for eslint tasks).
	 *
	 * This is useful for tracking shared configuration files from the repository root that affect the task.
	 * File paths are relative to the package directory, but can use "../" to reference parent directories,
	 * or use the special token "${repoRoot}" to reference files at the repository root.
	 *
	 * Example: To track a root-level eslint config from a package:
	 * ```json
	 * {
	 *   "fluidBuild": {
	 *     "tasks": {
	 *       "eslint": {
	 *         "files": {
	 *           "additionalConfigFiles": ["${repoRoot}/.eslintrc.cjs", "${repoRoot}/common/eslint-config.json"]
	 *         }
	 *       }
	 *     }
	 *   }
	 * }
	 * ```
	 *
	 * The "${repoRoot}" token will be replaced with the absolute path to the repository root,
	 * eliminating the need to use relative paths like "../../" which vary by package depth.
	 *
	 * Supports "..." to extend from global configuration.
	 */
	additionalConfigFiles?: readonly string[];
}

/**
 * Normalized scheduling and execution metadata shared by supported task kinds.
 * @remarks
 * Tool-specific configuration belongs to a concrete task variant, not this interface.
 */
export interface TaskConfigBase {
	/**
	 * Task dependencies as a plain string array. Matched task will be scheduled to run before the current task.
	 * The strings specify dependencies for the task. See Task Dependencies Expansion above for details.
	 */
	readonly dependsOn: TaskDependencies;

	/**
	 * Tasks that needs to run before the current task (example clean). See Task Dependencies Expansion above for
	 * details. As compared to "dependsOn", "before" is a weak dependency. It will only affect ordering if matched task is already
	 * scheduled. It won't cause the matched tasks to be scheduled if it isn't already.
	 *
	 * Dependency-only aliases cannot use 'before' because they perform no action.
	 * Programmatic analyzer tasks can use this ordering constraint.
	 */
	readonly before: TaskDependencies;

	/**
	 * Tasks that this task includes. The children tasks will be scheduled to
	 * run under the current task. Thus any tasks that depend on this will
	 * satisfy a requirement of dependency on the children tasks.
	 *
	 * This should not be custom specified but derived from definition.
	 */
	readonly children: readonly TaskName[];

	/**
	 * Tasks that needs to run after the current task (example copy tasks). See Task Dependencies Expansion above for
	 * details. As compared to "dependsOn", "after" is a weak dependency. It will only affect ordering if matched task is already
	 * scheduled. It won't cause the matched tasks to be scheduled if it isn't already.
	 *
	 * Dependency-only aliases cannot use 'after' because they perform no action.
	 * Programmatic analyzer tasks can use this ordering constraint.
	 */
	readonly after: TaskDependencies;

	/**
	 * Specify whether this is a script task or not. Default to true when this is omitted
	 * in the config file, or the task's config is just a plain string array.
	 *
	 * If true, the task will match with the script it the package.json and invoke
	 * the command once all the task's dependencies are satisfied.
	 *
	 * If false, the task will only trigger the dependencies (and not look for the script in package.json).
	 * It can be used as an alias to a group of tasks.
	 * Normalized tasks with kind 'api-analyzer' also use false, but execute their registered programmatic action.
	 * Do not supply this setting together with kind in on-disk configuration.
	 */
	readonly script: boolean;

	/**
	 * Input and output tracking for leaf tasks.
	 * @remarks
	 * Script tasks can use this to select declarative execution; programmatic analyzer tasks keep their own runner.
	 * Non-leaf task groups cannot supply file tracking.
	 */
	readonly files: TaskFileDependencies | undefined;
}

/**
 * Normalized configuration for existing package scripts and dependency-only aliases.
 */
export interface ScriptTaskConfig extends TaskConfigBase {
	/**
	 * Absence of a programmatic kind selects the existing script or alias execution path.
	 * @defaultValue `undefined`
	 */
	readonly kind?: undefined;
}

/**
 * Normalized programmatic analyzer task, with analyzer-owned configuration kept on this variant.
 */
export interface ApiAnalyzerTaskConfig extends TaskConfigBase, ApiAnalyzerTaskSettings {
	/**
	 * Analyzer tasks execute programmatically rather than through a package script.
	 */
	readonly script: false;
}

/**
 * Normalized task configuration, narrowed by kind before accessing tool-specific settings.
 */
export type TaskConfig = ScriptTaskConfig | ApiAnalyzerTaskConfig;

/**
 * Inverse of Readonly, make all fields mutable.
 */
type Mutable<T> = { -readonly [P in keyof T]: T[P] };

type MutableTaskConfig = Mutable<TaskConfig>;
interface MutableTaskDefinitions {
	[name: TaskName]: MutableTaskConfig;
}

/**
 * Analyzer task settings before scheduling defaults are applied.
 * The analyzer kind remains required even when its analysis settings come from shared defaults.
 */
export interface ApiAnalyzerTaskConfigOnDisk
	extends ApiAnalyzerTaskSettings,
		Partial<Pick<TaskConfigBase, "dependsOn" | "before" | "after">> {
	/**
	 * Script execution cannot be combined with an analyzer kind, even through a composed object.
	 * @defaultValue Omitted; normalization supplies the programmatic execution metadata.
	 */
	readonly script?: never;

	/**
	 * Input and output tracking for the programmatic task; this does not select a shell executor.
	 * Input globs must include the complete declaration and configuration input set.
	 * @defaultValue No incremental skipping; the analyzer runs on each build.
	 */
	readonly files?: TaskFileDependencies;
}

/**
 * On-disk task definitions retain the existing dependency-array shorthand and partial script settings.
 * Programmatic analyzer definitions use their own discriminated variant.
 */
export type TaskConfigOnDisk =
	| TaskDependencies
	| Omit<Partial<ScriptTaskConfig>, "children">
	| ApiAnalyzerTaskConfigOnDisk;
export interface TaskDefinitionsOnDisk {
	readonly [name: TaskName]: TaskConfigOnDisk;
}

const isTaskDependencies = (value: TaskConfigOnDisk): value is TaskDependencies => {
	return Array.isArray(value);
};

const makeClonedOrEmptyArray = <T>(value: readonly T[] | undefined): T[] =>
	value ? [...value] : [];

/**
 * Convert and fill out default values from TaskConfigOnDisk to TaskConfig in memory
 * @param config TaskConfig info loaded from a file
 * @returns TaskConfig filled out with default values
 */
function getFullTaskConfig(config: TaskConfigOnDisk): MutableTaskConfig {
	if (isTaskDependencies(config)) {
		return {
			dependsOn: [...config],
			script: true,
			before: [],
			children: [],
			after: [],
			files: undefined,
		};
	} else {
		if (
			config.kind === undefined &&
			["analyzer", "selections", "profiles", "outputs"].some((key) =>
				Object.prototype.hasOwnProperty.call(config, key),
			)
		) {
			throw new Error("Analyzer task settings require kind: 'api-analyzer'");
		}
		// Parsed configuration can contain kinds that TypeScript callers cannot construct.
		const kind: unknown = config.kind;
		if (kind !== undefined && kind !== "api-analyzer") {
			throw new Error(`Unsupported task kind '${String(kind)}'`);
		}
		if (config.kind === "api-analyzer") {
			// Validate the on-disk shape before normalization adds internal fields such as script and children.
			validateApiAnalyzerTaskSettings(config);
			return {
				dependsOn: makeClonedOrEmptyArray(config.dependsOn),
				before: makeClonedOrEmptyArray(config.before),
				children: [],
				after: makeClonedOrEmptyArray(config.after),
				script: false,
				files: structuredClone(config.files),
				...mergeApiAnalyzerTaskSettings(config, undefined),
			};
		}
		return {
			dependsOn: makeClonedOrEmptyArray(config.dependsOn),
			script: config.script ?? true,
			before: makeClonedOrEmptyArray(config.before),
			children: [],
			after: makeClonedOrEmptyArray(config.after),
			files: structuredClone(config.files),
		};
	}
}

// Known task names
export const defaultBuildTaskName = "build";
export const defaultCleanTaskName = "clean";

// Default task definitions (for non root tasks).  User task config will override these.
//
// clean:
// - For "clean", just assume that it needs to before all other tasks
//
// All other tasks:
// - Follow the topological order of the package and wait until all the task for the other
//   packages first (i.e. after: ["^*"]).
// - These default dependencies for "before" and "after" propagate differently in a group task, where only
//   subtasks that has no name inherit the dependency. (where as normally, all subtask does)
//	 (i.e. isDefault: true)

export type TaskDefinition = TaskConfig & { readonly isDefault?: boolean };

/**
 * Get the default task definition for the given task name
 * @param taskName task name
 * @returns default task definition
 */
export function getDefaultTaskDefinition(taskName: string): TaskDefinition {
	return taskName === defaultCleanTaskName
		? defaultCleanTaskDefinition
		: defaultTaskDefinition;
}

const defaultTaskDefinition = {
	dependsOn: [],
	script: true,
	before: [],
	children: [],
	after: ["^*"], // TODO: include "*" so the user configured task will run first, but we need to make sure it doesn't cause circular dependency first
	isDefault: true, // only propagate to unnamed sub tasks if it is a group task
	files: undefined,
} as const satisfies TaskDefinition;
const defaultCleanTaskDefinition = {
	dependsOn: [],
	script: true,
	before: ["*"], // clean are ran before all the tasks, add a week dependency.
	children: [],
	after: [],
	files: undefined,
} as const satisfies TaskDefinition;

const detectInvalid = (
	config: readonly string[],
	isInvalid: (value: string) => boolean,
	name: string,
	kind: string,
	isGlobal: boolean,
): void => {
	const invalid = config.filter((value) => isInvalid(value));
	if (invalid.length !== 0) {
		throw new Error(
			`Invalid '${kind}' dependencies '${invalid.join()}' for${
				isGlobal ? " global" : ""
			} task definition ${name}`,
		);
	}
};

export function normalizeGlobalTaskDefinitions(
	globalTaskDefinitionsOnDisk: TaskDefinitionsOnDisk | undefined,
): TaskDefinitions {
	// Normalize all on disk config to full config and validate
	const taskDefinitions: MutableTaskDefinitions = {};
	if (globalTaskDefinitionsOnDisk) {
		for (const name in globalTaskDefinitionsOnDisk) {
			const full = getFullTaskConfig(globalTaskDefinitionsOnDisk[name]);
			if (!full.script && full.kind === undefined) {
				if (full.before.length !== 0 || full.after.length !== 0) {
					throw new Error(
						`Non-script global task definition '${name}' cannot have 'before' or 'after'`,
					);
				}
				if (full.files !== undefined) {
					throw new Error(`Non-script global task definition '${name}' cannot have 'files'`);
				}
			}
			detectInvalid(
				full.dependsOn,
				(value) => value === "..." || value.includes("#") || value === "*" || value === "^*",
				name,
				"dependsOn",
				true,
			);
			detectInvalid(
				full.before,
				(value) => value === "..." || value.includes("#") || value === "^*",
				name,
				"before",
				true,
			);
			detectInvalid(
				full.after,
				(value) => value === "..." || value.includes("#"),
				name,
				"after",
				true,
			);
			if (full.files !== undefined) {
				// "..." not allowed because the global config inherits from nothing.
				detectInvalid(
					full.files.inputGlobs,
					(value) => value === "...",
					name,
					"files.inputGlobs",
					true,
				);
				detectInvalid(
					full.files.outputGlobs,
					(value) => value === "...",
					name,
					"files.outputGlobs",
					true,
				);
				if (full.files.additionalConfigFiles !== undefined) {
					detectInvalid(
						full.files.additionalConfigFiles,
						(value) => value === "...",
						name,
						"files.additionalConfigFiles",
						true,
					);
				}
				validateDeclarativeTaskPathSeparators(full.files);
			}
			taskDefinitions[name] = full;
		}
	}
	return taskDefinitions;
}

function expandDotDotDot(config: readonly string[], inherited?: readonly string[]): string[] {
	const expanded = config.filter((value) => value !== "...");
	if (inherited !== undefined && expanded.length !== config.length) {
		return expanded.concat(inherited);
	}
	return expanded;
}

/**
 * Extracts the all of the directly called scripts from a command line.
 * @param script - command line to parse
 * @param allScriptNames - all the script names in the package.json
 * @returns elements of script that are other scripts
 */
function getDirectlyCalledScripts(script: string, allScriptNames: string[]): string[] {
	const directlyCalledScripts: string[] = [];
	const commands = script.split("&&");
	for (const step of commands) {
		const commandLine = step.trim();
		if (isConcurrentlyCommand(commandLine)) {
			parseConcurrentlyCommand(
				commandLine,
				allScriptNames,
				(scriptName) => {
					directlyCalledScripts.push(scriptName);
				},
				() => {},
			);
		} else if (commandLine.startsWith("npm run ")) {
			const scriptName = commandLine.substring("npm run ".length);
			if (scriptName.includes(" ")) {
				// If the "script name" has a space, it is a "direct" call, but probably
				// has additional arguments that change exact execution of the script
				// and therefore is excluded as a "direct" call.
			} else if (allScriptNames.includes(scriptName)) {
				directlyCalledScripts.push(scriptName);
			} else {
				// This may not be relevant to the calling context, but there aren't
				// any known reasons why this should be preserved; so raise as an error.
				throw new Error(
					`Script '${scriptName}' not found processing command line: '${script}'`,
				);
			}
		}
	}
	return directlyCalledScripts;
}

/**
 * Combine and fill in default values for task definitions for a package.
 * @param json - package.json content for the package
 * @param globalTaskDefinitions - global task definitions
 * @param isReleaseGroupRoot - whether the package is the root of a release group
 * @returns full task definitions for the package.
 */
export function getTaskDefinitions(
	json: PackageJson,
	globalTaskDefinitions: TaskDefinitions,
	{ isReleaseGroupRoot }: { isReleaseGroupRoot: boolean },
): TaskDefinitions {
	const packageScripts = json.scripts ?? {};
	const packageTaskDefinitions = json.fluidBuild?.tasks;
	const taskDefinitions: MutableTaskDefinitions = {};

	/**
	 * Checks explicit package opt-in before applying global analyzer defaults or dependency references.
	 *
	 * @param name - Task name to look up in the package's own configuration.
	 * @returns Whether the package declares this task with the analyzer kind.
	 */
	const isAnalyzerOptIn = (name: string): boolean => {
		const config = packageTaskDefinitions?.[name];
		return (
			config !== undefined && !isTaskDependencies(config) && config.kind === "api-analyzer"
		);
	};
	// A reference from a global build target must not activate analysis in a package that has not opted in.
	const globalAllow = (value: string): boolean =>
		value.startsWith("^") ||
		(globalTaskDefinitions[value] !== undefined &&
			!globalTaskDefinitions[value].script &&
			(globalTaskDefinitions[value].kind === undefined || isAnalyzerOptIn(value))) ||
		isAnalyzerOptIn(value) ||
		packageScripts[value] !== undefined;
	const globalAllowExpansionsStar = (value: string): boolean =>
		value === "*" || globalAllow(value);

	// Initialize from global TaskDefinition, and filter out script tasks if the package doesn't have the script
	for (const name in globalTaskDefinitions) {
		const globalTaskDefinition = globalTaskDefinitions[name];
		if (globalTaskDefinition.kind === "api-analyzer" && !isAnalyzerOptIn(name)) {
			continue;
		}
		if (globalTaskDefinition.script && packageScripts[name] === undefined) {
			// Skip script tasks if the package doesn't have the script
			continue;
		}
		// Only keep task or script references that exist
		// and make array clones in the process.
		const scheduling = {
			dependsOn: globalTaskDefinition.dependsOn.filter(globalAllow),
			before: globalTaskDefinition.before.filter(globalAllowExpansionsStar),
			// `children` are not inherited from the global task definitions (which should always be empty anyway)
			children: [],
			after: globalTaskDefinition.after.filter(globalAllowExpansionsStar),
		};
		taskDefinitions[name] =
			globalTaskDefinition.kind === "api-analyzer"
				? {
						...scheduling,
						...mergeApiAnalyzerTaskSettings(globalTaskDefinition, undefined),
						script: false,
						files: globalTaskDefinition.files,
					}
				: {
						...scheduling,
						script: globalTaskDefinition.script,
						files: globalTaskDefinition.files,
					};
	}

	// Override from the package.json, and resolve "..." to the global dependencies if any
	if (packageTaskDefinitions) {
		for (const name in packageTaskDefinitions) {
			const packageTaskDefinition = packageTaskDefinitions[name];
			const full = getFullTaskConfig(packageTaskDefinition);
			if (full.kind === "api-analyzer") {
				// A same-named script would introduce a second execution path with different lifecycle behavior.
				if (packageScripts[name] !== undefined) {
					throw new Error(`api-analyzer task '${name}' cannot also have a package script`);
				}
				const inherited = taskDefinitions[name];
				Object.assign(
					full,
					mergeApiAnalyzerTaskSettings(
						full,
						inherited?.kind === "api-analyzer" ? inherited : undefined,
					),
				);
			} else if (full.script) {
				const script = packageScripts[name];
				if (script === undefined) {
					throw new Error(`Script not found for task definition '${name}'`);
				} else if (script.startsWith("fluid-build ")) {
					throw new Error(
						`Script task should not invoke 'fluid-build' in '${name}'. Did you forget to set 'script: false' in the task definition?`,
					);
				}
			} else {
				if (full.before.length !== 0 || full.after.length !== 0) {
					throw new Error(
						`Non-script task definition '${name}' cannot have 'before' or 'after'`,
					);
				} else if (full.files !== undefined) {
					throw new Error(`Non-script task definition '${name}' cannot have 'files'`);
				}
			}

			const currentTaskConfig = taskDefinitions[name];
			full.dependsOn = expandDotDotDot(full.dependsOn, currentTaskConfig?.dependsOn);
			full.before = expandDotDotDot(full.before, currentTaskConfig?.before);
			full.after = expandDotDotDot(full.after, currentTaskConfig?.after);
			const currentFiles = currentTaskConfig?.files;
			if (full.files === undefined) {
				// Tracking from a different execution kind must not silently change this task's input contract.
				full.files = currentTaskConfig?.kind === full.kind ? currentFiles : undefined;
			} else {
				full.files.inputGlobs = expandDotDotDot(
					full.files.inputGlobs,
					currentFiles?.inputGlobs,
				);
				full.files.outputGlobs = expandDotDotDot(
					full.files.outputGlobs,
					currentFiles?.outputGlobs,
				);
				if (full.files.additionalConfigFiles !== undefined) {
					full.files.additionalConfigFiles = expandDotDotDot(
						full.files.additionalConfigFiles,
						currentFiles?.additionalConfigFiles,
					);
				}
			}
			if (full.files !== undefined) {
				validateDeclarativeTaskPathSeparators(full.files);
			}
			taskDefinitions[name] = full;
		}
	}

	// The pilot has one package-wide lock and ownership manifest, not independent state for multiple analyzer tasks.
	if (
		Object.values(taskDefinitions).filter((task) => task.kind === "api-analyzer").length > 1
	) {
		throw new Error("The api-analyzer pilot supports only one analyzer task per package");
	}

	// Check to make sure all the dependencies either is a target or script.
	// For release group root, the default for any task is to run all the tasks in the group
	// even if there is not task definition or script for it.
	if (!isReleaseGroupRoot) {
		const invalidDependOn = (value: string): boolean =>
			!value.includes("#") &&
			!value.startsWith("^") &&
			taskDefinitions[value] === undefined &&
			json.scripts?.[value] === undefined;
		const invalidBefore = (value: string): boolean => value !== "*" && invalidDependOn(value);
		const invalidAfter = (value: string): boolean => value !== "^*" && invalidBefore(value);
		for (const name in taskDefinitions) {
			const taskDefinition = taskDefinitions[name];
			// Find any non-existent tasks or scripts in the dependencies
			detectInvalid(taskDefinition.dependsOn, invalidDependOn, name, "dependsOn", false);
			detectInvalid(taskDefinition.before, invalidBefore, name, "before", false);
			detectInvalid(taskDefinition.after, invalidAfter, name, "after", false);
		}
	}

	// Add `children` task definitions for the package.json scripts
	const allScriptNames = Object.keys(packageScripts);
	for (const [name, script] of Object.entries(packageScripts)) {
		const directlyCalledScripts = getDirectlyCalledScripts(
			// `undefined` is not a possible JSON result.
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			script!,
			allScriptNames,
		);
		if (directlyCalledScripts.length > 0) {
			// Add a task definition for the script if there isn't one already.
			const taskDefinition = taskDefinitions[name];
			if (taskDefinition === undefined) {
				taskDefinitions[name] = {
					dependsOn: [],
					before: [],
					children: directlyCalledScripts,
					after: [],
					script: true,
					files: undefined,
				};
			} else {
				// Confirm `children` is not specified in the manual task specifications
				if (taskDefinition.children.length > 0) {
					throw new Error(
						`'children' is not expected in manual task definition for '${name}'`,
					);
				}
				taskDefinition.children = directlyCalledScripts;
			}
		}
	}

	return taskDefinitions;
}

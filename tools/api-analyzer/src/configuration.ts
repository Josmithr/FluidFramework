import type {
	Configuration,
	EffectiveConfiguration,
	Entrypoint,
} from "./analysis-types/configuration.js";
import assert from "node:assert/strict";
import path from "node:path";
import { ObjectSchema, ValidationStrategy } from "@eslint/object-schema";
import { DiagnosticCode, failure, type Result } from "./analysis-types/result.js";
import { freezeData } from "./utilities/freezeData.js";

/**
 * Defines property validation and merge policies for configuration layers.
 *
 * @remarks
 * Validates supplied property types before merging each layer.
 * Later scalar values and entrypoint arrays replace earlier values.
 * Rule maps merge by key, including explicit `false` overrides.
 * All properties are optional so base configurations can supply partial settings.
 * Required values and entrypoint-name uniqueness are checked by
 * {@link validateAndNormalizeConfiguration} after merging.
 */
const configurationSchema = new ObjectSchema({
	packageName: { merge: "replace", validate: "string" },
	packageRoot: { merge: "replace", validate: "string" },
	project: { merge: "replace", validate: "string" },
	entrypoints: {
		merge: "replace",
		validate(value: unknown) {
			ValidationStrategy.array(value);
			for (const entrypoint of value as Entrypoint[]) {
				ValidationStrategy.object(entrypoint);
				ValidationStrategy.string(entrypoint.name);
				ValidationStrategy.string(entrypoint.path);
			}
		},
	},
	customModifierTags: {
		merge: "replace",
		validate(value: unknown) {
			ValidationStrategy.array(value);
			for (const tag of value as unknown[]) {
				ValidationStrategy.string(tag);
			}
		},
	},
	rules: {
		merge: "assign",
		validate(value: unknown) {
			ValidationStrategy.object(value);
			if (Array.isArray(value)) {
				throw new TypeError("Expected a rule map, not an array.");
			}
			for (const [name, setting] of Object.entries(value as Record<string, unknown>)) {
				if (name !== "requireReleaseLevel" && name !== "validateTsdocSyntax") {
					throw new TypeError(`Unsupported classification rule: ${name}.`);
				}
				ValidationStrategy.boolean(setting);
			}
		},
	},
});

/**
 * Collects configuration layers in inheritance order.
 *
 * @remarks
 * Visits bases in array order and places each configuration after its bases.
 * A shared base appears once for each inheritance path that reaches it.
 * Only a repeated object on the active path is treated as a cycle.
 * Does not change the input objects.
 *
 * @param configuration - The configuration whose inheritance graph is traversed.
 * @returns A nonempty array of references to the input layers, or `undefined` if a cycle is found.
 */
function collectConfigurationLayers(
	configuration: Configuration,
): Configuration[] | undefined {
	const layers: Configuration[] = [];
	const active = new Set<Configuration>();
	/**
	 * Adds a configuration after its base configurations.
	 *
	 * @param current - The next configuration on the active inheritance path.
	 * @returns `false` if a cycle is found; otherwise `true` after adding the layer.
	 */
	function visit(current: Configuration): boolean {
		if (active.has(current)) {
			return false;
		}
		active.add(current);
		for (const base of current.extends ?? []) {
			if (!visit(base)) {
				return false;
			}
		}
		layers.push(current);
		active.delete(current);
		return true;
	}
	return visit(configuration) ? layers : undefined;
}

/**
 * Merges ordered configuration layers with the property schema.
 *
 * @remarks
 * Removes `extends` and treats `null` and `undefined` values as omitted.
 * Rejects unknown settings rather than silently ignoring unsupported analysis requests.
 * Does not resolve paths, apply final defaults, or change input objects.
 *
 * @param layers - A nonempty list in inheritance order, with later layers taking precedence.
 * @returns Merged settings that can still lack required values, or diagnostics for invalid property types.
 * The successful value is not frozen.
 * @throws If the layer list is empty or an unexpected validation or merge error occurs.
 */
function mergeConfigurationLayers(
	layers: readonly Configuration[],
): Result<Omit<Configuration, "extends">> {
	assert.ok(layers.length > 0, "Configuration inheritance must produce at least one layer.");
	for (const layer of layers) {
		for (const key of Object.keys(layer)) {
			if (key !== "extends" && !configurationSchema.hasKey(key)) {
				return failure(
					DiagnosticCode.ConfigurationInvalid,
					`Unsupported configuration setting: ${key}.`,
				);
			}
		}
	}
	const normalized = layers.map((layer) =>
		Object.fromEntries(
			Object.entries(layer).filter(
				([key, value]) =>
					configurationSchema.hasKey(key) && value !== undefined && value !== null,
			),
		),
	);
	for (const layer of normalized) {
		try {
			configurationSchema.validate(layer);
		} catch (error) {
			if (error instanceof Error && error.cause instanceof TypeError) {
				return failure(DiagnosticCode.ConfigurationInvalid, error.message);
			}
			throw error;
		}
	}
	return {
		ok: true,
		value: configurationSchema.merge({}, ...normalized) as Omit<Configuration, "extends">,
	};
}

/**
 * Validates merged settings and produces normalized effective configuration.
 *
 * @remarks
 * Checks required values, non-blank entrypoint names and paths, and unique entrypoint names.
 * Resolves paths against the supplied working directory, which is also the default package root.
 * Uses an empty rule map when no rules were supplied.
 * Does not read files, check file existence, or change input objects.
 *
 * @param merged - Successfully merged settings, with property types already validated.
 * @param workingDirectory - An absolute directory, already checked by {@link resolveConfiguration}.
 * @returns Deeply frozen effective settings on success, or diagnostics for invalid final settings.
 */
function validateAndNormalizeConfiguration(
	merged: Omit<Configuration, "extends">,
	workingDirectory: string,
): Result<EffectiveConfiguration> {
	if (
		merged.packageName === undefined ||
		merged.packageName.trim().length === 0 ||
		merged.project === undefined ||
		merged.project.trim().length === 0 ||
		merged.entrypoints === undefined ||
		merged.entrypoints.length === 0
	) {
		return failure(
			DiagnosticCode.ConfigurationRequired,
			"Supply packageName, project, and at least one entrypoint.",
		);
	}
	const names = new Set<string>();
	for (const entrypoint of merged.entrypoints) {
		if (!entrypoint.name.trim() || !entrypoint.path.trim()) {
			return failure(
				DiagnosticCode.ConfigurationEntrypoint,
				"Each entrypoint requires a name and path.",
			);
		}
		if (names.has(entrypoint.name)) {
			return failure(
				DiagnosticCode.DuplicateEntrypoint,
				`Entrypoint ${entrypoint.name} is configured more than once.`,
			);
		}
		names.add(entrypoint.name);
	}
	return freezeData({
		ok: true,
		value: {
			packageName: merged.packageName,
			packageRoot: path.resolve(workingDirectory, merged.packageRoot ?? "."),
			project: path.resolve(workingDirectory, merged.project),
			entrypoints: merged.entrypoints.map((entrypoint) => ({
				name: entrypoint.name,
				path: path.resolve(workingDirectory, entrypoint.path),
			})),
			rules: { ...merged.rules },
			customModifierTags: [...(merged.customModifierTags ?? [])],
		},
	});
}

/**
 * Resolves analysis configuration.
 *
 * @remarks
 * Does not read files or change input objects.
 * Relative paths in all configuration sources use the supplied working directory.
 * Nullish property values are treated as omitted when merging layers.
 * Schema validation failures produce a `configuration-invalid` diagnostic.
 * When supplied, entrypoints must have string names and paths, and rule values must be booleans.
 * Required settings are checked after all layers are merged.
 *
 * @param configuration - Settings to resolve, including inherited base configurations.
 * @param workingDirectory - Absolute directory used to resolve paths and supply the default package root.
 * @returns Frozen effective settings on success, or diagnostics if the configuration is invalid.
 * @throws If an internal assertion or unexpected configuration-processing error occurs.
 */
export function resolveConfiguration(
	configuration: Configuration,
	workingDirectory: string,
): Result<EffectiveConfiguration> {
	if (!path.isAbsolute(workingDirectory)) {
		return failure(
			DiagnosticCode.ConfigurationDirectory,
			"The working directory must be absolute.",
		);
	}
	const layers = collectConfigurationLayers(configuration);
	if (layers === undefined) {
		return failure(
			DiagnosticCode.ConfigurationCycle,
			"Configuration inheritance contains a cycle.",
		);
	}
	const merged = mergeConfigurationLayers(layers);
	return merged.ok
		? validateAndNormalizeConfiguration(merged.value, workingDirectory)
		: merged;
}

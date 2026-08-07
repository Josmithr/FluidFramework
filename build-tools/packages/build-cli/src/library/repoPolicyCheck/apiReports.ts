/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "node:fs";
import path from "node:path";

import { getApiExtractorConfigFilePath, type PackageJson } from "@fluidframework/build-tools";

import {
	type ApiReportVariant,
	type ResolvedApiReportConfig,
	resolveApiReportConfig,
} from "../apiExtractorConfig.js";
import { queryTypesResolutionPathsFromPackageExports } from "../packageExports.js";
import type { Handler } from "./common.js";

/** A current or legacy API report variant required by a published declaration rollup. */
export type ReportLevel =
	| "current.public"
	| "current.beta"
	| "current.alpha"
	| "legacy.public"
	| "legacy.beta"
	| "legacy.alpha";

/**
 * A declaration rollup that must be covered by an API report configuration.
 *
 * @remarks
 * The channel is the filename prefix before the release-level suffix. It distinguishes parallel
 * surfaces such as `client-utils.browser.alpha.d.ts` and `client-utils.node.alpha.d.ts` without
 * coupling discovery to package script names or export subpaths.
 */
export interface RequiredReportEntrypoint {
	declarationPath: string;
	level: ReportLevel;
	channel?: string;
}

interface ReportConfigMetadata {
	channel?: string;
	configPath: string;
	family: "current" | "legacy";
	reportConfigs: ResolvedApiReportConfig["reportConfigs"];
	reportFolder: string;
}

/** A concrete API report coverage defect found in one package. */
export interface CoverageFailure {
	configPaths?: readonly string[];
	expectedFiles?: readonly string[];
	kind:
		| "missing-aggregate-script"
		| "missing-direct-script"
		| "invalid-entrypoints"
		| "invalid-config"
		| "missing-config-family"
		| "missing-config-variant"
		| "missing-report-file"
		| "extraneous-config-variant"
		| "extraneous-report-file";
	level?: ReportLevel;
	message?: string;
}

/** Structured policy result used by diagnostics, tests, and the safe resolver. */
export interface CoverageResult {
	failures: CoverageFailure[];
	packageJson: PackageJson;
}

type PackageJsonWithTypings = Pick<PackageJson, "exports" | "types"> & {
	typings?: string;
};

const declarationPathPattern = /\.d\.(?:ts|mts|cts)$/;

const declarationClassifiers: readonly {
	pattern: RegExp;
	level: ReportLevel;
}[] = [
	{ pattern: /^(?<channel>.*\.)?legacy\.public\.d\.(?:ts|mts|cts)$/, level: "legacy.public" },
	{ pattern: /^(?<channel>.*\.)?legacyPublic\.d\.(?:ts|mts|cts)$/, level: "legacy.public" },
	{ pattern: /^(?<channel>.*\.)?legacy\.alpha\.d\.(?:ts|mts|cts)$/, level: "legacy.alpha" },
	{ pattern: /^(?<channel>.*\.)?legacyAlpha\.d\.(?:ts|mts|cts)$/, level: "legacy.alpha" },
	{ pattern: /^(?<channel>.*\.)?legacy\.beta\.d\.(?:ts|mts|cts)$/, level: "legacy.beta" },
	{ pattern: /^(?<channel>.*\.)?legacyBeta\.d\.(?:ts|mts|cts)$/, level: "legacy.beta" },
	{ pattern: /^(?<channel>.*\.)?legacy\.d\.(?:ts|mts|cts)$/, level: "legacy.beta" },
	{ pattern: /^(?<channel>.*\.)?public\.d\.(?:ts|mts|cts)$/, level: "current.public" },
	{ pattern: /^(?<channel>.*\.)?beta\.d\.(?:ts|mts|cts)$/, level: "current.beta" },
	{ pattern: /^(?<channel>.*\.)?alpha\.d\.(?:ts|mts|cts)$/, level: "current.alpha" },
];

/** Classifies a declaration filename using the repository's release-level naming conventions. */
export function classifyReportDeclaration(
	declarationPath: string,
): Omit<RequiredReportEntrypoint, "declarationPath"> | undefined {
	const filename = path.basename(declarationPath);
	for (const { pattern, level } of declarationClassifiers) {
		const match = pattern.exec(filename);
		if (match !== null) {
			const channel = match.groups?.channel?.replace(/\.$/, "");
			return channel === undefined || channel.length === 0 ? { level } : { channel, level };
		}
	}

	return undefined;
}

/**
 * Discovers reportable declaration rollups from a package's published TypeScript metadata.
 *
 * @throws When declaration metadata is ambiguous or does not expose a reportable entrypoint.
 */
export function getRequiredReportEntrypoints(
	packageJson: PackageJsonWithTypings,
): RequiredReportEntrypoint[] {
	if (packageJson.exports === undefined) {
		if (packageJson.types !== undefined && packageJson.typings !== undefined) {
			throw new Error('package.json must not specify both "types" and "typings"');
		}

		const declarationPath = packageJson.types ?? packageJson.typings;
		if (declarationPath === undefined) {
			throw new Error(
				'package.json does not expose declarations through "exports", "types", or "typings"',
			);
		}

		return [{ declarationPath, level: "current.public" }];
	}

	const { mapTypesPathToExportPaths } = queryTypesResolutionPathsFromPackageExports(
		packageJson,
		new Map([[declarationPathPattern, undefined]]),
		{ node10TypeCompat: false, onlyFirstMatches: false },
	);
	const explicitEntrypoints: RequiredReportEntrypoint[] = [];

	for (const declarationPath of mapTypesPathToExportPaths.keys()) {
		const classification = classifyReportDeclaration(declarationPath);
		if (classification !== undefined) {
			explicitEntrypoints.push({ declarationPath, ...classification });
		}
	}

	if (explicitEntrypoints.length > 0) {
		const logicalEntrypoints = new Map<string, RequiredReportEntrypoint>();
		for (const entrypoint of explicitEntrypoints) {
			const key = `${entrypoint.channel ?? ""}\0${entrypoint.level}`;
			if (!logicalEntrypoints.has(key)) {
				logicalEntrypoints.set(key, entrypoint);
			}
		}
		return [...logicalEntrypoints.values()];
	}

	for (const [declarationPath, exportPaths] of mapTypesPathToExportPaths) {
		if (exportPaths.some(({ exportPath }) => exportPath === ".")) {
			return [{ declarationPath, level: "current.public" }];
		}
	}

	throw new Error("package.json does not expose a reportable TypeScript entrypoint");
}

function getVariant(level: ReportLevel): ApiReportVariant {
	return level.slice(level.indexOf(".") + 1) as ApiReportVariant;
}

function getFamily(level: ReportLevel): "current" | "legacy" {
	return level.startsWith("legacy.") ? "legacy" : "current";
}

function getReportFilePath(config: ReportConfigMetadata, variant: ApiReportVariant): string {
	const configuredFileName = config.reportConfigs.find(
		(reportConfig) => reportConfig.variant === variant,
	)?.fileName;
	if (configuredFileName !== undefined) {
		return path.join(config.reportFolder, configuredFileName);
	}

	const representativeFileName = config.reportConfigs[0]?.fileName;
	if (representativeFileName === undefined) {
		throw new Error(
			`API report config does not define any report variants: ${config.configPath}`,
		);
	}
	const baseName = representativeFileName.replace(
		/\.(?:public|beta|alpha|complete)\.api\.md$/,
		"",
	);
	return path.join(config.reportFolder, `${baseName}.${variant}.api.md`);
}

function configMatchesEntrypoint(
	config: ReportConfigMetadata,
	entrypoint: RequiredReportEntrypoint,
): boolean {
	if (config.family !== getFamily(entrypoint.level)) {
		return false;
	}
	if (config.channel === undefined) {
		return entrypoint.channel === undefined;
	}
	return entrypoint.channel?.split(".").at(-1) === config.channel;
}

function getReportConfigs(
	packageJson: PackageJson,
	packageDirectory: string,
): {
	configs: ReportConfigMetadata[];
	failures: CoverageFailure[];
} {
	const configs: ReportConfigMetadata[] = [];
	const failures: CoverageFailure[] = [];
	const directScripts = Object.entries(packageJson.scripts ?? {}).filter(([scriptName]) =>
		scriptName.startsWith("ci:build:api-reports:"),
	);

	if (directScripts.length === 0) {
		failures.push({ kind: "missing-direct-script" });
		return { configs, failures };
	}

	for (const [scriptName, command] of directScripts) {
		if (typeof command !== "string" || !command.includes("api-extractor run")) {
			failures.push({
				kind: "invalid-config",
				message: `${scriptName} is not a direct API Extractor command`,
			});
			continue;
		}

		const suffix = scriptName.slice("ci:build:api-reports:".length).split(":");
		const family = suffix.includes("legacy") ? "legacy" : "current";
		const channel = suffix.find((part) => part !== "current" && part !== "legacy");
		const configPath = path.resolve(packageDirectory, getApiExtractorConfigFilePath(command));
		try {
			const resolved = resolveApiReportConfig(
				configPath,
				path.join(packageDirectory, "package.json"),
			);
			if (!resolved.enabled) {
				failures.push({
					configPaths: [configPath],
					kind: "invalid-config",
					message: `${scriptName} has apiReport.enabled set to false`,
				});
				continue;
			}
			configs.push({
				...(channel === undefined ? {} : { channel }),
				configPath,
				family,
				reportConfigs: resolved.reportConfigs,
				reportFolder: resolved.reportFolder,
			});
		} catch (error) {
			failures.push({
				configPaths: [configPath],
				kind: "invalid-config",
				message: error instanceof Error ? error.message : String(error),
			});
		}
	}

	return { configs, failures };
}

/** Evaluates API report coverage for one package manifest. Exported for focused policy tests. */
export function evaluateApiReportCoverage(packageJsonPath: string): CoverageResult {
	const packageDirectory = path.dirname(packageJsonPath);
	const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as PackageJson;
	const failures: CoverageFailure[] = [];

	if (packageJson.private === true) {
		return { failures, packageJson };
	}
	if (packageJson.scripts?.["ci:build:api-reports"] === undefined) {
		failures.push({ kind: "missing-aggregate-script" });
	}

	let entrypoints: RequiredReportEntrypoint[];
	try {
		entrypoints = getRequiredReportEntrypoints(packageJson);
	} catch (error) {
		failures.push({
			kind: "invalid-entrypoints",
			message: error instanceof Error ? error.message : String(error),
		});
		entrypoints = [];
	}

	const reportConfigResult = getReportConfigs(packageJson, packageDirectory);
	failures.push(...reportConfigResult.failures);

	for (const entrypoint of entrypoints) {
		const familyConfigs = reportConfigResult.configs.filter(
			(config) => config.family === getFamily(entrypoint.level),
		);
		const configs = familyConfigs.filter((config) =>
			configMatchesEntrypoint(config, entrypoint),
		);
		if (configs.length === 0) {
			failures.push({
				configPaths: familyConfigs.map(({ configPath }) => configPath),
				kind: "missing-config-family",
				level: entrypoint.level,
			});
			continue;
		}

		const variant = getVariant(entrypoint.level);
		const missingVariantConfigs = configs.filter(
			(config) =>
				!config.reportConfigs.some((reportConfig) => reportConfig.variant === variant),
		);
		if (missingVariantConfigs.length > 0) {
			failures.push({
				configPaths: missingVariantConfigs.map(({ configPath }) => configPath),
				kind: "missing-config-variant",
				level: entrypoint.level,
			});
			continue;
		}

		const expectedFiles = [
			...new Set(configs.map((config) => getReportFilePath(config, variant))),
		];
		const missingFiles = expectedFiles.filter((file) => !fs.existsSync(file));
		if (missingFiles.length > 0) {
			failures.push({
				expectedFiles: missingFiles,
				kind: "missing-report-file",
				level: entrypoint.level,
			});
		}
	}

	for (const config of reportConfigResult.configs) {
		for (const { variant } of config.reportConfigs) {
			if (variant === "complete") {
				continue;
			}
			const level = `${config.family}.${variant}` as ReportLevel;
			if (
				!entrypoints.some(
					(entrypoint) =>
						entrypoint.level === level && configMatchesEntrypoint(config, entrypoint),
				)
			) {
				failures.push({
					configPaths: [config.configPath],
					kind: "extraneous-config-variant",
					level,
				});
			}
		}
	}

	const requiredReportFiles = new Set<string>();
	for (const entrypoint of entrypoints) {
		const variant = getVariant(entrypoint.level);
		for (const config of reportConfigResult.configs.filter((candidate) =>
			configMatchesEntrypoint(candidate, entrypoint),
		)) {
			requiredReportFiles.add(getReportFilePath(config, variant));
		}
	}
	for (const config of reportConfigResult.configs) {
		for (const variant of variantOrder) {
			const reportFile = getReportFilePath(config, variant);
			if (fs.existsSync(reportFile) && !requiredReportFiles.has(reportFile)) {
				failures.push({
					expectedFiles: [reportFile],
					kind: "extraneous-report-file",
					level: `${config.family}.${variant}`,
				});
			}
		}
	}

	return { failures, packageJson };
}

function formatCoverageFailures(
	result: CoverageResult,
	packageJsonPath: string,
): string | undefined {
	if (result.failures.length === 0) {
		return undefined;
	}

	const packageDirectory = path.dirname(packageJsonPath);
	const details = result.failures.map((failure) => {
		const paths = [...(failure.configPaths ?? []), ...(failure.expectedFiles ?? [])]
			.map((file) => path.relative(packageDirectory, file))
			.join(", ");
		const subject =
			failure.level === undefined ? failure.kind : `${failure.kind}: ${failure.level}`;
		return `- ${subject}${paths.length === 0 ? "" : ` (${paths})`}${failure.message === undefined ? "" : `: ${failure.message}`}`;
	});
	return `${result.packageJson.name} has incomplete API report coverage:\n${details.join("\n")}\nRun: pnpm --dir ${packageDirectory} run build:api-reports`;
}

const variantOrder: readonly ApiReportVariant[] = ["public", "beta", "alpha"];

function addReportVariantToLeafConfig(
	configPath: string,
	variant: ApiReportVariant,
	inheritedVariants: readonly ApiReportVariant[],
): boolean {
	const original = fs.readFileSync(configPath, "utf8");
	const reportVariantsPattern = /(["']?reportVariants["']?\s*:\s*)\[([^\]]*)]/;
	const existingMatch = reportVariantsPattern.exec(original);
	const variants = new Set<ApiReportVariant>(inheritedVariants);
	variants.add(variant);
	const orderedVariants = variantOrder.filter((candidate) => variants.has(candidate));
	const serializedVariants = `[${orderedVariants.map((candidate) => `"${candidate}"`).join(", ")}]`;

	let updated: string;
	if (existingMatch !== null) {
		updated = original.replace(reportVariantsPattern, `$1${serializedVariants}`);
	} else {
		const apiReportPattern = /(["']?apiReport["']?\s*:\s*{)(\r?\n)([\t ]*)/;
		const apiReportMatch = apiReportPattern.exec(original);
		if (apiReportMatch !== null) {
			const propertyIndent = `${apiReportMatch[3]}\t`;
			updated = original.replace(
				apiReportPattern,
				`$1$2${propertyIndent}"reportVariants": ${serializedVariants},$2${apiReportMatch[3]}`,
			);
		} else {
			const finalBraceIndex = original.lastIndexOf("}");
			if (finalBraceIndex < 0) {
				return false;
			}
			const beforeFinalBrace = original.slice(0, finalBraceIndex).trimEnd();
			if (!beforeFinalBrace.startsWith("{") || beforeFinalBrace.length === 1) {
				return false;
			}
			const newline = original.includes("\r\n") ? "\r\n" : "\n";
			const separator = beforeFinalBrace.endsWith(",") ? "" : ",";
			updated = `${beforeFinalBrace}${separator}${newline}\t"apiReport": {${newline}\t\t"reportVariants": ${serializedVariants}${newline}\t}${newline}${original.slice(finalBraceIndex)}`;
		}
	}

	if (updated === original) {
		return false;
	}
	fs.writeFileSync(configPath, updated, "utf8");
	return true;
}

function resolveCoverageFailures(packageJsonPath: string): {
	resolved: boolean;
	message?: string;
} {
	const initial = evaluateApiReportCoverage(packageJsonPath);
	const packageDirectory = path.dirname(packageJsonPath);
	const missingVariants = initial.failures.filter(
		(
			failure,
		): failure is CoverageFailure & { level: ReportLevel; configPaths: readonly string[] } =>
			failure.kind === "missing-config-variant" &&
			failure.level !== undefined &&
			failure.configPaths !== undefined,
	);
	if (missingVariants.length === 0) {
		return {
			resolved: false,
			message: "No API report configuration change can be applied safely.",
		};
	}

	const edits: string[] = [];
	for (const failure of missingVariants) {
		const variant = getVariant(failure.level);
		for (const configPath of failure.configPaths) {
			const relativePath = path.relative(packageDirectory, configPath);
			if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
				return {
					resolved: false,
					message: `Refusing to edit shared API Extractor config: ${configPath}`,
				};
			}
			const effectiveConfig = resolveApiReportConfig(configPath, packageJsonPath);
			const inheritedVariants = effectiveConfig.reportConfigs
				.map(({ variant: configuredVariant }) => configuredVariant)
				.filter(
					(configuredVariant): configuredVariant is ApiReportVariant =>
						configuredVariant !== "complete",
				);
			if (addReportVariantToLeafConfig(configPath, variant, inheritedVariants)) {
				edits.push(relativePath);
			}
		}
	}

	if (edits.length === 0) {
		return {
			resolved: false,
			message: "The API report leaf config shape could not be updated with a targeted edit.",
		};
	}

	const remainingMessage = formatCoverageFailures(
		evaluateApiReportCoverage(packageJsonPath),
		packageJsonPath,
	);
	return remainingMessage === undefined
		? {
				resolved: true,
				message: `Updated API report config: ${[...new Set(edits)].join(", ")}`,
			}
		: {
				resolved: false,
				message: `Updated API report config: ${[...new Set(edits)].join(", ")}\n${remainingMessage}`,
			};
}

/** Ensures every publishable package declaration rollup has matching API report coverage. */
export const handler: Handler = {
	name: "npm-package-api-reports-match-entrypoints",
	match: /(?:^|\/)package\.json$/i,
	handler: async (file) => {
		try {
			return formatCoverageFailures(evaluateApiReportCoverage(file), file);
		} catch (error) {
			return `Unable to validate API report coverage for ${file}: ${error instanceof Error ? error.message : String(error)}`;
		}
	},
	resolver: (file) => {
		try {
			return resolveCoverageFailures(file);
		} catch (error) {
			return {
				resolved: false,
				message: `Unable to fix API report coverage for ${file}: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	},
};

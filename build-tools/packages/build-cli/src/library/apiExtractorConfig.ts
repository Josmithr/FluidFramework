/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";

import {
	type ApiReportVariant as ExtractorApiReportVariant,
	ExtractorConfig,
	type IExtractorConfigApiReport,
} from "@microsoft/api-extractor";

/** API report variants that correspond to the repository's release-level declaration rollups. */
export type ApiReportVariant = Exclude<ExtractorApiReportVariant, "complete">;

/** The prepared API report settings needed by repository policy checks. */
export interface ResolvedApiReportConfig {
	enabled: boolean;
	reportConfigs: readonly IExtractorConfigApiReport[];
	reportFolder: string;
}

/**
 * Loads and prepares an API Extractor configuration without requiring generated declaration output.
 *
 * @remarks
 * `ExtractorConfig.loadFile()` supplies API Extractor's JSON5 parsing, schema validation, `extends`
 * resolution, default merging, and config-relative path handling. `ExtractorConfig.prepare()` then
 * expands tokens and computes final report filenames. `ignoreMissingEntryPoint` permits this helper
 * to run in a clean checkout before the configured declaration rollup has been built.
 */
export function resolveApiReportConfig(
	configPath: string,
	packageJsonPath: string,
): ResolvedApiReportConfig {
	const absoluteConfigPath = path.resolve(configPath);
	const extractorConfig = ExtractorConfig.prepare({
		configObject: ExtractorConfig.loadFile(absoluteConfigPath),
		configObjectFullPath: absoluteConfigPath,
		packageJsonFullPath: path.resolve(packageJsonPath),
		ignoreMissingEntryPoint: true,
	});

	return {
		enabled: extractorConfig.apiReportEnabled,
		reportConfigs: extractorConfig.reportConfigs,
		reportFolder: extractorConfig.reportFolder,
	};
}

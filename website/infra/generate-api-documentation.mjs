/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * This index script Generates API documentation for all API versions specified in
 * `api-docs-versions.mjs`.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import chalk from "chalk";

import DocsVersions from "../config/docs-versions.mjs";
import { renderApiDocumentation } from "./api-markdown-documenter/index.mjs";
import { validateApiEntrypoints } from "./validate-api-entrypoints.mjs";

const dirname = path.dirname(fileURLToPath(import.meta.url));

const includeLocalApiDocs = process.env.LOCAL_API_DOCS === "true";

// Fail fast if any version's configured API entrypoints have drifted from its sidebar.
await validateApiEntrypoints();

// Get versions from config.
// `entrypointPackages` lives alongside `apiDocs` on each version config; merge it in so the renderer can
// scope generation to the reachable set of packages.
const versionConfigs = {};
function toVersionConfig(versionConfig) {
	return { ...versionConfig.apiDocs, entrypointPackages: versionConfig.entrypointPackages };
}
versionConfigs[DocsVersions.currentVersion.version] = toVersionConfig(DocsVersions.currentVersion);
for (const versionConfig of DocsVersions.otherVersions) {
	versionConfigs[versionConfig.version] = toVersionConfig(versionConfig);
}

if (includeLocalApiDocs) {
	versionConfigs[DocsVersions.local.version] = toVersionConfig(DocsVersions.local);
}

try {
	// Generate API documentation for each version
	await Promise.all(
		Object.entries(versionConfigs).map(async ([version, config]) => {
			await renderApiDocumentation(
				config.inputPath,
				config.outputPath,
				config.uriRoot,
				version,
				config.entrypointPackages,
			);

			console.log(
				chalk.green(`Version "${version}" API docs written to "${config.outputPath}"!`),
			);
		}),
	);

	console.log(chalk.green("API docs generated successfully!"));
	process.exit(0);
} catch (error) {
	console.error(chalk.red("API docs generation failed due to one or more errors:"));
	console.error(error);
	process.exit(1);
}

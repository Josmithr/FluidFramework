/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * Validates that the `entrypointPackages` configured for each documentation version (in
 * `config/docs-versions.mjs`) stays in sync with the packages surfaced in that version's Docusaurus
 * sidebar.
 *
 * API documentation is only generated for the packages reachable (via local production dependencies) from
 * each version's `entrypointPackages`. The site's sidebars surface a curated set of top-level packages under
 * their "API Documentation" section. If these two lists drift apart, the site can either:
 * - reference API docs that were never generated (sidebar entry with no content), or
 * - generate API docs that are never surfaced (wasted work / orphaned pages).
 *
 * This validation fails the build when the two lists disagree, pointing at the specific packages to fix.
 *
 * See `website/docs-api-scoping-design.md` for the full design.
 *
 * This module uses only Node.js built-ins so it can run in any build context.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import DocsVersions from "../config/docs-versions.mjs";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const websiteDir = path.resolve(dirname, "..");

/**
 * The sidebar file that surfaces each version's API documentation, relative to the website root.
 * Keyed by the version's `version` identifier (see `config/docs-versions.mjs`).
 *
 * IMPORTANT: Keep these paths in sync with the sidebar configuration for each version.
 */
const sidebarFilesByVersion = {
	// Current ("v2") version.
	2: "sidebars.ts",
	// Maintained "v1" version.
	1: "versioned_sidebars/version-1-sidebars.json",
	// Local API docs preview.
	local: "versioned_sidebars/version-local-sidebars.json",
};

/**
 * Strips a package's scope, returning the "unscoped" name used for its API documentation directory.
 * E.g. `@fluidframework/azure-client` -> `azure-client`, `fluid-framework` -> `fluid-framework`.
 * @param {string} packageName
 * @returns {string}
 */
function getUnscopedName(packageName) {
	const lastSlash = packageName.lastIndexOf("/");
	return lastSlash === -1 ? packageName : packageName.slice(lastSlash + 1);
}

/**
 * Extracts the set of package directories surfaced under a sidebar's "API Documentation" section.
 *
 * Sidebars reference API docs via `api/<unscopedName>` paths (in `dirName` and doc `id` fields). We collect
 * the first path segment after `api/`, ignoring the `api/index` landing page.
 *
 * @param {string} sidebarContents
 * @returns {Set<string>}
 */
function extractSidebarApiPackages(sidebarContents) {
	/** @type {Set<string>} */
	const packages = new Set();
	const regex = /api\/([A-Za-z0-9._-]+)/g;
	let match;
	while ((match = regex.exec(sidebarContents)) !== null) {
		const segment = match[1];
		if (segment !== "index") {
			packages.add(segment);
		}
	}
	return packages;
}

/**
 * Validates a single version's `entrypointPackages` against its sidebar.
 * @param {string} version
 * @param {readonly string[] | undefined} entrypointPackages
 * @returns {Promise<string[]>} A list of human-readable error messages (empty when valid).
 */
async function validateVersion(version, entrypointPackages) {
	const errors = [];

	const sidebarRelativePath = sidebarFilesByVersion[version];
	if (sidebarRelativePath === undefined) {
		// No sidebar mapping registered for this version; nothing to validate.
		return errors;
	}

	if (entrypointPackages === undefined || entrypointPackages.length === 0) {
		errors.push(
			`Version "${version}" has no \`entrypointPackages\` configured, but a sidebar (${sidebarRelativePath}) surfaces API documentation. Configure \`entrypointPackages\` in config/docs-versions.mjs.`,
		);
		return errors;
	}

	const sidebarContents = await readFile(path.resolve(websiteDir, sidebarRelativePath), "utf8");
	const sidebarPackages = extractSidebarApiPackages(sidebarContents);
	const expectedPackages = new Set(entrypointPackages.map(getUnscopedName));

	const missingFromEntrypoints = [...sidebarPackages].filter((pkg) => !expectedPackages.has(pkg));
	const missingFromSidebar = [...expectedPackages].filter((pkg) => !sidebarPackages.has(pkg));

	if (missingFromEntrypoints.length > 0) {
		errors.push(
			`Version "${version}": the following package(s) are surfaced in ${sidebarRelativePath} but are not listed in \`entrypointPackages\` (config/docs-versions.mjs): ${missingFromEntrypoints
				.sort()
				.join(", ")}. Their API documentation will not be generated.`,
		);
	}
	if (missingFromSidebar.length > 0) {
		errors.push(
			`Version "${version}": the following \`entrypointPackages\` (config/docs-versions.mjs) are not surfaced in ${sidebarRelativePath}: ${missingFromSidebar
				.sort()
				.join(
					", ",
				)}. Either surface them in the sidebar or remove them from \`entrypointPackages\`.`,
		);
	}

	return errors;
}

/**
 * Validates that every documentation version's `entrypointPackages` is in sync with its sidebar.
 * Throws an error describing all detected drift.
 *
 * @returns {Promise<void>}
 */
export async function validateApiEntrypoints() {
	const versions = [
		DocsVersions.currentVersion,
		...DocsVersions.otherVersions,
		DocsVersions.local,
	];

	const errors = (
		await Promise.all(
			versions.map((versionConfig) =>
				validateVersion(versionConfig.version, versionConfig.entrypointPackages),
			),
		)
	).flat();

	if (errors.length > 0) {
		throw new Error(
			`API documentation entrypoint validation failed:\n- ${errors.join("\n- ")}`,
		);
	}
}

// Allow running this module directly for ad-hoc validation.
if (
	process.argv[1] !== undefined &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	validateApiEntrypoints().then(
		() => {
			console.log("API documentation entrypoint validation passed.");
		},
		(error) => {
			console.error(error.message);
			process.exit(1);
		},
	);
}

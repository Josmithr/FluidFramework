/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { HeadingOptions, TransformConfig, TransformOptions } from "../utilities.js";
import {
	formattedGeneratedContentBody,
	formattedSectionText,
	getPackageMetadata,
	parseHeadingOptions,
	resolveRelativePackageJsonPath,
} from "../utilities.js";

/**
 * Generates a simple Markdown heading and contents with information about how to import from the package's export options.
 *
 * Note: this function will only generate contents if one of our special export paths is found (`/alpha`, `/beta`, or `/legacy`).
 *
 * @param packageMetadata - package.json file contents.
 * @param headingOptions - Heading generation options.
 * @returns The formatted Markdown section text, or an empty string if the package has no relevant export paths.
 */
const generateImportInstructionsSection = (
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	packageMetadata: any,
	headingOptions: HeadingOptions,
): string => {
	const packageName = packageMetadata.name;
	const packageExports = packageMetadata.exports;

	// If the package.json doesn't include an exports block, don't generate anything.
	if (!packageExports) {
		return "";
	}

	// Currently assumes the package has a `.` export path.
	// Does not look for custom paths, only our 3 standard ones.
	const hasAlphaExport = "./alpha" in packageExports;
	const hasBetaExport = "./beta" in packageExports;
	const hasLegacyExport = "./legacy" in packageExports;

	// If the package.json's exports block doesn't include one of our special paths, don't generate anything.
	if (!(hasAlphaExport || hasBetaExport || hasLegacyExport)) {
		return "";
	}

	const lines = [
		"This package leverages [package.json exports](https://nodejs.org/api/packages.html#exports) to separate its APIs by support level.",
		"For more information on the related support guarantees, see [API Support Levels](https://fluidframework.com/docs/build/releases-and-apitags/#api-support-levels).",
		"", // Blank line
		`To access the \`public\` ([SemVer](https://semver.org/)) APIs, import via \`${packageName}\` like normal.`,
	];

	if (hasBetaExport) {
		lines.push("", `To access the \`beta\` APIs, import via \`${packageName}/beta\`.`);
	}

	if (hasAlphaExport) {
		lines.push("", `To access the \`alpha\` APIs, import via \`${packageName}/alpha\`.`);
	}

	if (hasLegacyExport) {
		lines.push("", `To access the \`legacy\` APIs, import via \`${packageName}/legacy\`.`);
	}

	const sectionBody = lines.join("\n");

	return formattedSectionText(sectionBody, {
		...headingOptions,
		headingText: "Importing from this package",
	});
};

/**
 * Generates a README section with instructions for how to import different API support levels based on
 * our standard package export paths (`/alpha`, `/beta`, `/legacy`).
 *
 * Note: this function will only generate contents if one of our special export paths is found (`/alpha`, `/beta`, or `/legacy`).
 *
 * @param content - The original document file contents.
 * @param options - Transform options.
 * `options.packageJsonPath` — (optional) Relative path to package.json. Default: `"./package.json"`.
 * `options.includeHeading` — `"TRUE"|"FALSE"`, default `"TRUE"`.
 * `options.headingLevel` — positive integer string, default `"2"`.
 * @param config - Transform configuration.
 * @returns The formatted Markdown section text.
 */
function importInstructionsTransform(
	content: string,
	options: TransformOptions,
	config: TransformConfig,
): string {
	const headingOptions = parseHeadingOptions(options);

	const resolvedPackageJsonPath = resolveRelativePackageJsonPath(
		config.originalPath,
		options.packageJsonPath,
	);
	const packageMetadata = getPackageMetadata(resolvedPackageJsonPath);

	return formattedGeneratedContentBody(
		generateImportInstructionsSection(packageMetadata, headingOptions),
		config,
	);
}

export { generateImportInstructionsSection, importInstructionsTransform };

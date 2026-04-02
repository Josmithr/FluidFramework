/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import scripts from "markdown-magic-package-scripts";

import type { HeadingOptions, TransformConfig, TransformOptions } from "../utilities.js";
import {
	formattedGeneratedContentBody,
	formattedSectionText,
	parseHeadingOptions,
} from "../utilities.js";

/**
 * Generates a simple Markdown heading and contents with a table describing all of the package's npm scripts.
 *
 * @param scriptsTable - Table of scripts to display.
 * See `markdown-magic-package-scripts` (imported as `scripts`).
 * @param headingOptions - Heading generation options.
 * @returns The formatted Markdown section text.
 */
const generatePackageScriptsSection = (
	scriptsTable: string,
	headingOptions: HeadingOptions,
): string => {
	return formattedSectionText(scriptsTable, {
		...headingOptions,
		headingText: "Scripts",
	});
};

/**
 * Generates a README section with a table enumerating the dev scripts in the specified package.json.
 *
 * @param content - The original document file contents.
 * @param options - Transform options.
 * `options.packageJsonPath` — (optional) Relative path to package.json. Default: `"./package.json"`.
 * `options.includeHeading` — `"TRUE"|"FALSE"`, default `"TRUE"`.
 * `options.headingLevel` — positive integer string, default `"2"`.
 * @param config - Transform configuration.
 * @returns The formatted Markdown section text.
 */
function packageScriptsTransform(
	content: string,
	options: TransformOptions,
	config: TransformConfig,
): string {
	const headingOptions = parseHeadingOptions(options);
	const scriptsTable = scripts(content, options, config);
	return formattedGeneratedContentBody(
		generatePackageScriptsSection(scriptsTable, headingOptions),
		config,
	);
}

export { generatePackageScriptsSection, packageScriptsTransform };

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// @ts-check

/**
 * @typedef {import("../utilities.js").TransformConfig} TransformConfig
 * @typedef {import("../utilities.js").TransformOptions} TransformOptions
 */

import scripts from "markdown-magic-package-scripts";

import {
	formattedGeneratedContentBody,
	formattedSectionText,
	parseHeadingOptions,
} from "../utilities.js";

/**
 * Generates a simple Markdown heading and contents with a table describing all of the package's npm scripts.
 *
 * @param {string} scriptsTable - Table of scripts to display.
 * See `markdown-magic-package-scripts` (imported as `scripts`).
 * @param {object} headingOptions - Heading generation options.
 * @param {boolean} headingOptions.includeHeading - Whether or not to include a top-level heading in the generated section.
 * @param {number} headingOptions.headingLevel - Root heading level for the generated section.
 * Must be a positive integer.
 * @returns {string} The formatted Markdown section text.
 */
const generatePackageScriptsSection = (scriptsTable, headingOptions) => {
	return formattedSectionText(scriptsTable, {
		...headingOptions,
		headingText: "Scripts",
	});
};

/**
 * Generates a README section with a table enumerating the dev scripts in the specified package.json.
 *
 * @param {string} content - The original document file contents.
 * @param {TransformOptions} options - Transform options.
 * `options.packageJsonPath` — (optional) Relative path to package.json. Default: `"./package.json"`.
 * `options.includeHeading` — `"TRUE"|"FALSE"`, default `"TRUE"`.
 * `options.headingLevel` — positive integer string, default `"2"`.
 * @param {TransformConfig} config - Transform configuration.
 * @returns {string} The formatted Markdown section text.
 */
function packageScriptsTransform(content, options, config) {
	const headingOptions = parseHeadingOptions(options);
	const scriptsTable = scripts(content, options, config);
	return formattedGeneratedContentBody(
		generatePackageScriptsSection(scriptsTable, headingOptions),
		config,
	);
}

export { generatePackageScriptsSection, packageScriptsTransform };

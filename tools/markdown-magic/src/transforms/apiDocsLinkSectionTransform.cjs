/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// @ts-check

/**
 * @typedef {import("../utilities.cjs").TransformConfig} TransformConfig
 * @typedef {import("../utilities.cjs").TransformOptions} TransformOptions
 */

const { PackageName } = require("@rushstack/node-core-library");

const {
	formattedGeneratedContentBody,
	formattedSectionText,
	getPackageMetadata,
	parseHeadingOptions,
	resolveRelativePackageJsonPath,
} = require("../utilities.cjs");

/**
 * Generates a simple Markdown heading and contents with information about API documentation for the package.
 *
 * @param {string} packageName - Name of the package (fully scoped).
 * @param {object} headingOptions - Heading generation options.
 * @param {boolean} headingOptions.includeHeading - Whether or not to include a top-level heading in the generated section.
 * @param {number} headingOptions.headingLevel - Root heading level for the generated section.
 * Must be a positive integer.
 * @returns {string} The formatted Markdown section text.
 */
const generateApiDocsSection = (packageName, headingOptions) => {
	const shortName = PackageName.getUnscopedName(packageName);
	const sectionBody = `API documentation for **${packageName}** is available at [https://fluidframework.com/docs/apis/${shortName}](https://fluidframework.com/docs/apis/${shortName}).`;
	return formattedSectionText(sectionBody, {
		...headingOptions,
		headingText: "API Documentation",
	});
};

/**
 * Generates a README section pointing readers to the published library API docs on <fluidframework.com>.
 *
 * @param {object} content - The original document file contents.
 * @param {object} options - Transform options.
 * @param {string} options.packageJsonPath - (optional) Relative file path to the package.json file for the package.
 * Default: "./package.json".
 * @param {TransformOptions} options - Transform options.
 * `options.includeHeading` (`"TRUE"|"FALSE"`, default `"TRUE"`), `options.headingLevel` (positive integer string, default `"2"`).
 * @param {TransformConfig} config - Transform configuration.
 * @returns {string} The formatted Markdown section text.
 */
function apiDocsTransform(content, options, config) {
	const headingOptions = parseHeadingOptions(options);
	const resolvedPackageJsonPath = resolveRelativePackageJsonPath(
		config.originalPath,
		options.packageJsonPath,
	);
	const packageMetadata = getPackageMetadata(resolvedPackageJsonPath);
	const packageName = packageMetadata.name;

	return formattedGeneratedContentBody(generateApiDocsSection(packageName, headingOptions), config);
}

module.exports = {
	generateApiDocsSection,
	apiDocsTransform,
};

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// @ts-check

/**
 * @typedef {import("../utilities.js").TransformConfig} TransformConfig
 * @typedef {import("../utilities.js").TransformOptions} TransformOptions
 */

import { PackageName } from "@rushstack/node-core-library";

import {
	formattedGeneratedContentBody,
	formattedSectionText,
	getPackageMetadata,
	parseHeadingOptions,
	resolveRelativePackageJsonPath,
} from "../utilities.js";

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
 * @param {string} content - The original document file contents.
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

export { generateApiDocsSection, apiDocsTransform };

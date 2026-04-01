/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// @ts-check

/**
 * @typedef {import("../utilities.cjs").TransformConfig} TransformConfig
 * @typedef {import("../utilities.cjs").TransformOptions} TransformOptions
 */

const { defaultSectionHeadingLevel } = require("../constants.cjs");
const {
	formattedGeneratedContentBody,
	formattedSectionText,
	getPackageMetadata,
	resolveRelativePackageJsonPath,
	parseHeadingOptions,
} = require("../utilities.cjs");

/**
 * Generates a simple Markdown heading and contents with package installation instructions.
 *
 * @param {string} packageName - Name of the package (fully scoped).
 * @param {boolean} devDependency - Whether or not the package is intended to be installed as a dev dependency.
 * @param {object} headingOptions - Heading generation options.
 * @param {boolean} headingOptions.includeHeading - Whether or not to include a top-level heading in the generated section.
 * @param {number} headingOptions.headingLevel - Root heading level for the generated section.
 * Must be a positive integer.
 */
const generateInstallationInstructionsSection = (
	packageName,
	devDependency,
	headingOptions,
) => {
	const sectionBody = `To get started, install the package by running the following command:

\`\`\`bash
npm i ${packageName}${devDependency ? " -D" : ""}
\`\`\``;

	return formattedSectionText(sectionBody, {
		...headingOptions,
		headingText: "Installation",
	});
};

/**
 * Generates a README section with package installation instructions.
 *
 * @param {object} content - The original document file contents.
 * @param {object} options - Transform options.
 * @param {TransformOptions} options - Transform options.
 * `options.packageJsonPath` — (optional) Relative path to package.json. Default: `"./package.json"`.
 * `options.includeHeading` — `"TRUE"|"FALSE"`, default `"TRUE"`.
 * `options.headingLevel` — positive integer string, default `"2"`.
 * `options.devDependency` — `"TRUE"` to append `-D` to the install command. Default: `"FALSE"`.
 * Note: only the exact string `"TRUE"` (case-sensitive) enables dev-dependency mode.
 * @param {TransformConfig} config - Transform configuration.
 * @returns {string} The formatted Markdown section text.
 */
function installationInstructionsTransform(content, options, config) {
	const headingOptions = parseHeadingOptions(options);
	const devDependency = options.devDependency === "TRUE";

	const resolvedPackageJsonPath = resolveRelativePackageJsonPath(
		config.originalPath,
		options.packageJsonPath,
	);
	const packageMetadata = getPackageMetadata(resolvedPackageJsonPath);

	const packageName = packageMetadata.name;
	return formattedGeneratedContentBody(
		generateInstallationInstructionsSection(packageName, devDependency, headingOptions),
		config,
	);
}

module.exports = {
	generateInstallationInstructionsSection,
	installationInstructionsTransform,
};

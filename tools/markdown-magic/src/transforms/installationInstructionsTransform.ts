/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { HeadingOptions, TransformConfig, TransformOptions } from "../utilities.js";
import {
	formattedGeneratedContentBody,
	formattedSectionText,
	getPackageMetadata,
	resolveRelativePackageJsonPath,
	parseHeadingOptions,
} from "../utilities.js";

/**
 * Generates a simple Markdown heading and contents with package installation instructions.
 *
 * @param packageName - Name of the package (fully scoped).
 * @param devDependency - Whether or not the package is intended to be installed as a dev dependency.
 * @param headingOptions - Heading generation options.
 */
const generateInstallationInstructionsSection = (
	packageName: string,
	devDependency: boolean,
	headingOptions: HeadingOptions,
): string => {
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
 * @param content - The original document file contents.
 * @param options - Transform options.
 * `options.packageJsonPath` — (optional) Relative path to package.json. Default: `"./package.json"`.
 * `options.includeHeading` — `"TRUE"|"FALSE"`, default `"TRUE"`.
 * `options.headingLevel` — positive integer string, default `"2"`.
 * `options.devDependency` — `"TRUE"` to append `-D` to the install command. Default: `"FALSE"`.
 * Note: only the exact string `"TRUE"` (case-sensitive) enables dev-dependency mode.
 * @param config - Transform configuration.
 * @returns The formatted Markdown section text.
 */
function installationInstructionsTransform(
	content: string,
	options: TransformOptions,
	config: TransformConfig,
): string {
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

export { generateInstallationInstructionsSection, installationInstructionsTransform };

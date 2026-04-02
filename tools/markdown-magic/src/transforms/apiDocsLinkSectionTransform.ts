/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { PackageName } from "@rushstack/node-core-library";

import type { HeadingOptions, TransformConfig, TransformOptions } from "../utilities.js";
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
 * @param packageName - Name of the package (fully scoped).
 * @param headingOptions - Heading generation options.
 * @returns The formatted Markdown section text.
 */
const generateApiDocsSection = (packageName: string, headingOptions: HeadingOptions): string => {
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
 * @param content - The original document file contents.
 * @param options - Transform options.
 * `options.includeHeading` (`"TRUE"|"FALSE"`, default `"TRUE"`), `options.headingLevel` (positive integer string, default `"2"`).
 * @param config - Transform configuration.
 * @returns The formatted Markdown section text.
 */
function apiDocsTransform(
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
	const packageName = packageMetadata.name;

	return formattedGeneratedContentBody(generateApiDocsSection(packageName, headingOptions), config);
}

export { generateApiDocsSection, apiDocsTransform };

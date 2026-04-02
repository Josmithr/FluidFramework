/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// @ts-check

import { formattedSectionText, readTemplate } from "../utilities.js";

/**
 * Generates a simple Markdown heading with the contents of the specified template file and (optionally) a heading.
 *
 * @param {string} templateFileName - The name of the template file to be embedded.
 * @param {object} headingOptions - Heading generation options.
 * @param {boolean} headingOptions.includeHeading - Whether or not to include a top-level heading in the generated section.
 * @param {number} headingOptions.headingLevel - Root heading level for the generated section.
 * Must be a positive integer.
 * @param {string} headingOptions.headingText - Text to use for the heading, if one is to be generated.
 * A heading will only be included if this is specified.
 */
const generateSectionFromTemplate = (templateFileName, headingOptions) => {
	const sectionBody = readTemplate(templateFileName, headingOptions?.headingLevel ?? 0);
	return formattedSectionText(sectionBody, headingOptions);
};

export { generateSectionFromTemplate };

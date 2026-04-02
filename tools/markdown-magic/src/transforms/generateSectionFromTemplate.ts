/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { HeadingOptions } from "../utilities.js";
import { formattedSectionText, readTemplate } from "../utilities.js";

/**
 * Generates a simple Markdown heading with the contents of the specified template file and (optionally) a heading.
 *
 * @param templateFileName - The name of the template file to be embedded.
 * @param headingOptions - Heading generation options.
 */
const generateSectionFromTemplate = (
	templateFileName: string,
	headingOptions: HeadingOptions | undefined,
): string => {
	const sectionBody = readTemplate(templateFileName, headingOptions?.headingLevel ?? 0);
	return formattedSectionText(sectionBody, headingOptions);
};

export { generateSectionFromTemplate };

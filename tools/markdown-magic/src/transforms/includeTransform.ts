/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TransformConfig, TransformOptions } from "../utilities.js";
import {
	formattedEmbeddedContentBody,
	formattedSectionText,
	readFile,
	resolveRelativePath,
} from "../utilities.js";

/**
 * Embeds contents from the specified file paths within the provided (optional) line boundaries.
 *
 * @param content - The original document file contents.
 * @param options - Transform options.
 * `options.path` — Relative path from the document to the file being embedded (required).
 * `options.start` — (optional) 0-based start line (inclusive), as a string-formatted integer.
 * `options.end` — (optional) 0-based end line (exclusive), as a string-formatted integer.
 * @param config - Transform configuration.
 * @returns The formatted embedded file contents.
 * @throws If `options.path` is not provided, or if the referenced file does not exist.
 */
function includeTransform(
	content: string,
	options: TransformOptions,
	config: TransformConfig,
): string {
	const { path: relativeFilePath, start: startLineString, end: endLineString } = options;
	const { originalPath: documentFilePath } = config;

	const startLine =
		startLineString === undefined ? undefined : Number.parseInt(startLineString);
	const endLine = endLineString === undefined ? undefined : Number.parseInt(endLineString);

	if (!relativeFilePath) {
		throw new Error(
			"No 'path' parameter provided. Must specify a relative path to the file containing the contents to be embedded.",
		);
	}

	const resolvedFilePath = resolveRelativePath(documentFilePath, relativeFilePath);

	try {
		const fileContents = readFile(resolvedFilePath, startLine, endLine);
		const section = formattedSectionText(fileContents, /* headingOptions: */ undefined);

		return formattedEmbeddedContentBody(section, config);
	} catch (error) {
		console.error(`Exception processing "${resolvedFilePath}":`, error);
		throw error;
	}
}

export { includeTransform };

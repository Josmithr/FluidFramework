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
 * `options.language` — (optional) Language identifier for the fenced code block (e.g. `"typescript"`).
 * @param config - Transform configuration.
 * @returns The formatted embedded code block.
 * @throws If `options.path` is not provided, or if the referenced file does not exist.
 */
function includeCodeTransform(
	content: string,
	options: TransformOptions,
	config: TransformConfig,
): string {
	const {
		path: relativeFilePath,
		start: startLineString,
		end: endLineString,
		language,
	} = options;
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

		const codeBlock = [`\`\`\`${language ?? ""}`, fileContents, "```"].join("\n");

		const section = formattedSectionText(codeBlock, /* headingOptions: */ undefined);

		return formattedEmbeddedContentBody(section, config);
	} catch (error) {
		console.error(`Exception processing "${resolvedFilePath}":`, error);
		throw error;
	}
}

export { includeCodeTransform };

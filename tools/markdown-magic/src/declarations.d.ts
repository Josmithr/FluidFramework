/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Ambient type declarations for packages without bundled TypeScript definitions.
 */

declare module "markdown-magic-package-scripts" {
	/**
	 * Generates a Markdown table of scripts from a package.json file.
	 *
	 * @param content - The original document file contents.
	 * @param options - Transform options. `options.pkg` specifies the path to package.json.
	 * @param config - Transform configuration.
	 * @returns A Markdown table string listing the package scripts.
	 */
	function scripts(
		content: string,
		options: Record<string, string | undefined>,
		config: object,
	): string;
	export default scripts;
}

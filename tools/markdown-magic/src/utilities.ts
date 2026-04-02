/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "node:fs";
import path from "node:path";
import { PackageName } from "@rushstack/node-core-library";

import {
	defaultSectionHeadingLevel,
	embeddedContentNotice,
	generatedContentNotice,
	mdxEmbeddedContentNotice,
	mdxGeneratedContentNotice,
	templatesDirectoryPath,
} from "./constants.js";

/**
 * Configuration object injected by the processor into every transform function call.
 * In addition to the base processor config fields, three extra fields are injected:
 * - `originalPath` — path of the file being processed
 * - `originalContent` — full source as read from disk (before any transforms this run)
 * - `outputContent` — running output after any previously applied transforms this run
 */
export interface TransformConfig {
	/** Path to the document being modified. */
	originalPath: string;
	/** Full original source of the file. */
	originalContent?: string;
	/** Current state of the source after previous transforms. */
	outputContent?: string;
}

/**
 * Options parsed from the pragma spec string and passed to transform functions.
 * All values are plain strings (as received from URL-style `key=value` pragma parsing)
 * or `undefined` when not provided. Use string comparisons (e.g. `=== "TRUE"`) to
 * interpret boolean-like option values.
 */
export type TransformOptions = Record<string, string | undefined>;

/**
 * The recognized package scope kinds used in the Fluid Framework monorepo.
 *
 * - `""` — the package has no npm scope (e.g. `fluid-framework`)
 * - `"FRAMEWORK"` — `@fluidframework` scope
 * - `"EXAMPLE"` — `@fluid-example` scope
 * - `"EXPERIMENTAL"` — `@fluid-experimental` scope
 * - `"INTERNAL"` — `@fluid-internal` scope
 * - `"PRIVATE"` — `@fluid-private` scope
 * - `"TOOLS"` — `@fluid-tools` scope
 */
export type ScopeKind =
	| ""
	| "FRAMEWORK"
	| "EXAMPLE"
	| "EXPERIMENTAL"
	| "INTERNAL"
	| "PRIVATE"
	| "TOOLS";

/**
 * Heading generation options used by section-generating functions.
 */
export interface HeadingOptions {
	/** Whether or not to include a heading in the generated content. */
	includeHeading: boolean;
	/** The heading level for the section. Must be a positive integer. */
	headingLevel: number;
	/** The text to display in the section heading. */
	headingText?: string;
}

/**
 * Reads and returns the contents from the specified template file.
 *
 * @param templateFileName - Name of the file to read, under {@link templatesDirectoryPath} (e.g. "Trademark-Template.md").
 * @param headingOffset - (optional) Level offset for all headings in the target template.
 * Must be a non-negative integer.
 */
const readTemplate = (templateFileName: string, headingOffset = 0): string => {
	if (!Number.isInteger(headingOffset) || headingOffset < 0) {
		throw new TypeError(
			`"headingOffset" must be a non-negative integer. Got "${headingOffset}".`,
		);
	}

	const unmodifiedContents = readFile(path.resolve(templatesDirectoryPath, templateFileName));

	if (headingOffset === 0) {
		return unmodifiedContents;
	}

	const headingOffsetString = "#".repeat(headingOffset);
	return unmodifiedContents.replace(/(^#)/gm, `$1${headingOffsetString}`);
};

/**
 * Reads contents of the target file within the provided (optional) line boundaries.
 *
 * @param filePath - Path to the file being read.
 * @param startLine - (optional) 0-based index of the first line from the target file to be embedded (inclusive).
 * Default: Start from the first line of the file.
 * Constraints are the same as those for the `start` parameter to
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/slice#parameters | Array.slice}
 * @param endLine - (optional) 0-based index of the last line of the target file to be embedded (exclusive).
 * Default: Include through the last line of the file.
 * Constraints are the same as those for the `end` parameter to
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/slice#parameters | Array.slice}
 *
 * @returns The (trimmed) file contents within the requested line range.
 *
 * @remarks `startLine` uses a falsy check, so `startLine === 0` is treated the same as
 * `startLine === undefined` (i.e., the slice starts from the beginning of the file).
 * To start from line 0 explicitly, omit `startLine` and rely on the default behaviour.
 */
function readFile(filePath: string, startLine?: number, endLine?: number): string {
	let fileContents = fs.readFileSync(filePath, "utf8");
	if (startLine || endLine) {
		const split = fileContents.split(/\r?\n/);
		fileContents = split.slice(startLine, endLine).join("\n");
	}
	return fileContents.trim();
}

/**
 * Resolves the provided relative path from its document path.
 *
 * @param documentPath - The path to the document this system is modifying.
 * @param relativePath - A path, relative to `documentPath`, to resolve.
 */
function resolveRelativePath(documentPath: string, relativePath: string): string {
	const resolvedFilePath = path.resolve(path.dirname(documentPath), relativePath);

	if (!fs.existsSync(resolvedFilePath)) {
		throw new Error(
			`"${documentPath}": Encountered invalid relative file path "${relativePath}". "${resolvedFilePath}" does not exist.`,
		);
	}

	return resolvedFilePath;
}

/**
 * Resolves the optionally provided file path, expressed relative to the path of the document being modified.
 *
 * @param documentFilePath - Path to the document file being modified by this tooling.
 * @param packageJsonFilePath - (optional) Relative file path to the package.json file for the package.
 * Default: "./package.json".
 *
 * @returns The resolved path to the package.json file.
 */
function resolveRelativePackageJsonPath(
	documentFilePath: string,
	packageJsonFilePath?: string,
): string {
	if (!packageJsonFilePath) {
		packageJsonFilePath = "./package.json";
	}
	return resolveRelativePath(documentFilePath, packageJsonFilePath);
}

/**
 * Gets the package's `package.json` contents, given the path to its package.json file.
 *
 * @param packageJsonFilePath - Path to a `package.json` file.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getPackageMetadata(packageJsonFilePath: string): any {
	try {
		const packageJson = JSON.parse(fs.readFileSync(packageJsonFilePath, "utf8"));
		return packageJson;
	} catch (error) {
		console.error(error);
		throw error;
	}
}

/**
 * Gets the appropriate special scope kind for the provided package name, if applicable.
 *
 * @remarks For an overview of the Fluid Framework's package scopes, see {@link https://github.com/microsoft/FluidFramework/wiki/npm-package-scopes}.
 *
 * @param packageName - The fully-scoped package name.
 * @returns A {@link ScopeKind} based on the package's npm scope.
 * Returns `undefined` for unrecognized scopes.
 */
const getScopeKindFromPackage = (packageName: string): ScopeKind | undefined => {
	const packageScope = PackageName.getScope(packageName);
	if (packageScope === "") {
		return "";
	} else if (packageScope === "@fluidframework") {
		return "FRAMEWORK";
	} else if (packageScope === "@fluid-example") {
		return "EXAMPLE";
	} else if (packageScope === "@fluid-experimental") {
		return "EXPERIMENTAL";
	} else if (packageScope === "@fluid-internal") {
		return "INTERNAL";
	} else if (packageScope === "@fluid-private") {
		return "PRIVATE";
	} else if (packageScope === "@fluid-tools") {
		return "TOOLS";
	} else {
		return undefined;
	}
};

/**
 * Determines if the package is end-user facing or not.
 * For the purposes of README content generation, this is true for "fluid-framework" and published packages in the
 * "@fluidframework" and "@fluid-experimental" scopes.
 *
 * Will always return `false` if the package.json specifies `"private": true`.
 *
 * @remarks Used to determine which automatically generated sections should be included in package READMEs, etc.
 * @param packageMetadata - The parsed `package.json` file for the package.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isPublic = (packageMetadata: any): boolean => {
	// If the package is not published, return `false`.
	if (packageMetadata.private === true) {
		return false;
	}

	// For published packages, only return `true` for package scopes for which we offer public support.
	const packageName = packageMetadata.name;
	if (packageName === "fluid-framework") {
		return true;
	}

	const scope = getScopeKindFromPackage(packageName);
	return scope === "FRAMEWORK" || scope === "EXPERIMENTAL";
};

/**
 * Generates the appropriately formatted Markdown section contents for the provided section body.
 * If header text is provided, a level 2 heading (i.e. `##`) will be included with the provided text.
 * The section will be wrapped in leading and trailing newlines to ensure adequate spacing between generated contents.
 *
 * @param sectionBody - Body text to include in the section.
 * @param headingOptions - (optional) Heading generation options.
 * @returns The formatted section text, with an optional heading and surrounding newlines.
 */
function formattedSectionText(
	sectionBody: string,
	headingOptions: HeadingOptions | undefined,
): string {
	let heading = "";
	if (headingOptions?.includeHeading) {
		const { headingLevel, headingText } = headingOptions;
		if (!Number.isInteger(headingLevel) || headingLevel < 1) {
			throw new TypeError(`"headingLevel" must be a positive integer. Got "${headingLevel}".`);
		}
		heading = `${"#".repeat(headingLevel)} ${headingText}\n\n`;
	}

	return `\n${heading}${sectionBody}\n`;
}

/**
 * Determines if the file being processed is an MDX file, based on the path in the transform config.
 *
 * @param config - The transform config object.
 */
function isMdxFile(config: TransformConfig | undefined): boolean {
	return path.extname(config?.originalPath ?? "").toLowerCase() === ".mdx";
}

/**
 * Wraps the provided generated / embedded content in prettier-ignore pragma comments.
 *
 * For MDX files, prettier-ignore directives are omitted entirely because Prettier does not
 * support the version of MDX used in this repo (MDX v3 / @mdx-js/mdx).
 * See: https://github.com/prettier/prettier/issues/12209
 *
 * @param contents - The Markdown contents to be wrapped.
 * @param config - The transform config object. Used to detect the file format.
 */
function bundlePrettierPragmas(contents: string, config: TransformConfig | undefined): string {
	if (isMdxFile(config)) {
		return contents;
	}
	return ["\n<!-- prettier-ignore-start -->", contents, "<!-- prettier-ignore-end -->\n"].join(
		"\n",
	);
}

/**
 * Bundles the provided generated contents with the appropriate "do not edit" notice, as well as
 * prettier-ignore pragmas (for .md files) to ensure there is not contention between our content
 * generation and prettier's formatting opinions.
 *
 * @param contents - The generated Markdown contents to be included.
 * @param config - The transform config object. Used to detect the file format.
 */
function formattedGeneratedContentBody(
	contents: string,
	config: TransformConfig | undefined,
): string {
	const notice = isMdxFile(config) ? mdxGeneratedContentNotice : generatedContentNotice;
	return bundlePrettierPragmas([notice, contents].join("\n"), config);
}

/**
 * Bundles the provided embedded contents with the appropriate "do not edit" notice, as well as
 * prettier-ignore pragmas (for .md files) to ensure there is not contention between our content
 * generation and prettier's formatting opinions.
 *
 * @param contents - The generated Markdown contents to be included.
 * @param config - The transform config object. Used to detect the file format.
 */
function formattedEmbeddedContentBody(
	contents: string,
	config: TransformConfig | undefined,
): string {
	const notice = isMdxFile(config) ? mdxEmbeddedContentNotice : embeddedContentNotice;
	return bundlePrettierPragmas([notice, contents].join("\n"), config);
}

/**
 * Parses the provided MarkdownMagic transform options to generate the appropriate section heading options.
 *
 * @param transformationOptions - Transform options passed to the transform function.
 * @param headingText - The text to display in the section heading.
 * Optional because individual `generate*` helpers override `headingText` themselves.
 *
 * @returns Heading generation options.
 */
function parseHeadingOptions(
	transformationOptions: TransformOptions,
	headingText?: string,
): HeadingOptions {
	return {
		includeHeading: transformationOptions.includeHeading !== "FALSE",
		headingLevel: transformationOptions.headingLevel
			? (Number.parseInt(transformationOptions.headingLevel) ?? defaultSectionHeadingLevel)
			: defaultSectionHeadingLevel,
		headingText: headingText,
	};
}

/**
 * Parses a provided "boolean" (i.e., "TRUE" | "FALSE") MarkdownMagic transform option.
 * Returns the provided default if no option was specified.
 *
 * @param option - The string option value. Only `"TRUE"` and `"FALSE"` (exact, case-sensitive) are meaningful;
 * all other values fall through to `defaultValue`.
 * @param defaultValue - The default value, or a zero-argument callback that returns it.
 * Used if the option is not explicitly provided (`"TRUE"` or `"FALSE"`).
 */
function parseBooleanOption(
	option: string | undefined,
	defaultValue: boolean | (() => boolean),
): boolean {
	if (option === "TRUE") {
		return true;
	}
	if (option === "FALSE") {
		return false;
	}
	if (typeof defaultValue === "function") {
		return defaultValue();
	}
	return defaultValue;
}

export {
	formattedSectionText,
	formattedGeneratedContentBody,
	formattedEmbeddedContentBody,
	getPackageMetadata,
	getScopeKindFromPackage,
	isPublic,
	parseBooleanOption,
	parseHeadingOptions,
	readFile,
	readTemplate,
	resolveRelativePackageJsonPath,
	resolveRelativePath,
};

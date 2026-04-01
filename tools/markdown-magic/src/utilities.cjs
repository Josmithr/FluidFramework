/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// @ts-check

const fs = require("fs");
const path = require("path");
const { PackageName } = require("@rushstack/node-core-library");

/**
 * Configuration object injected by the processor into every transform function call.
 * In addition to the base processor config fields, three extra fields are injected:
 * - `originalPath` — path of the file being processed
 * - `originalContent` — full source as read from disk (before any transforms this run)
 * - `outputContent` — running output after any previously applied transforms this run
 *
 * @typedef {object} TransformConfig
 * @property {string} originalPath - Path to the document being modified.
 * @property {string} [originalContent] - Full original source of the file.
 * @property {string} [outputContent] - Current state of the source after previous transforms.
 */

/**
 * Options parsed from the pragma spec string and passed to transform functions.
 * All values are plain strings (as received from URL-style `key=value` pragma parsing)
 * or `undefined` when not provided. Use string comparisons (e.g. `=== "TRUE"`) to
 * interpret boolean-like option values.
 *
 * @typedef {Record<string, string | undefined>} TransformOptions
 */

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
 *
 * @typedef {"" | "FRAMEWORK" | "EXAMPLE" | "EXPERIMENTAL" | "INTERNAL" | "PRIVATE" | "TOOLS"} ScopeKind
 */

const {
	defaultSectionHeadingLevel,
	embeddedContentNotice,
	generatedContentNotice,
	mdxEmbeddedContentNotice,
	mdxGeneratedContentNotice,
	templatesDirectoryPath,
} = require("./constants.cjs");

/**
 * Reads and returns the contents from the specified template file.
 *
 * @param {string} templateFileName - Name of the file to read, under {@link templatesDirectoryPath} (e.g. "Trademark-Template.md").
 * @param {number} headingOffset - (optional) Level offset for all headings in the target template.
 * Must be a non-negative integer.
 */
const readTemplate = (templateFileName, headingOffset = 0) => {
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
 * @param {string} filePath - Path to the file being read.
 * @param {number | undefined} startLine - (optional) 0-based index of the first line from the target file to be embedded (inclusive).
 * Default: Start from the first line of the file.
 * Constraints are the same as those for the `start` parameter to
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/slice#parameters | Array.slice}
 * @param {number | undefined} endLine - (optional) 0-based index of the last line of the target file to be embedded (exclusive).
 * Default: Include through the last line of the file.
 * Constraints are the same as those for the `end` parameter to
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/slice#parameters | Array.slice}
 *
 * @returns {string} The (trimmed) file contents within the requested line range.
 *
 * @remarks `startLine` uses a falsy check, so `startLine === 0` is treated the same as
 * `startLine === undefined` (i.e., the slice starts from the beginning of the file).
 * To start from line 0 explicitly, omit `startLine` and rely on the default behaviour.
 */
function readFile(filePath, startLine, endLine) {
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
 * @param {string} documentPath - The path to the document this system is modifying.
 * @param {string} relativePath - A path, relative to `documentPath`, to resolve.
 */
function resolveRelativePath(documentPath, relativePath) {
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
 * @param {string} documentFilePath - Path to the document file being modified by this tooling.
 * @param {string} packageJsonFilePath - (optional) Relative file path to the package.json file for the package.
 * Default: "./package.json".
 *
 * @returns The resolved path to the package.json file.
 */
function resolveRelativePackageJsonPath(documentFilePath, packageJsonFilePath) {
	if (!packageJsonFilePath) {
		packageJsonFilePath = "./package.json";
	}
	return resolveRelativePath(documentFilePath, packageJsonFilePath);
}

/**
 * Gets the package's `package.json` contents, given the path to its package.json file.
 *
 * @param {string} packageJsonFilePath - Path to a `package.json` file.
 */
function getPackageMetadata(packageJsonFilePath) {
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
 * @remarks for an overview of the Fluid Framework's package scopes, see {@link https://github.com/microsoft/FluidFramework/wiki/npm-package-scopes}.
 *
 * @param {string} packageName
 * @returns {ScopeKind | undefined}
 * A {@link ScopeKind} based on the package's npm scope.
 * Returns `undefined` for unrecognized scopes.
 */
const getScopeKindFromPackage = (packageName) => {
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
 * Will always return `false` if the package.json specifies`"private": true`.
 *
 * @remarks Used to determine which automatically generated sections should be included in package READMEs, etc.
 * @param {object} packageMetadata - The parsed `package.json` file for the package.
 */
const isPublic = (packageMetadata) => {
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
 * @param {string} sectionBody - Body text to include in the section.
 * @param {object} headingOptions - (optional) Heading generation options.
 * @param {boolean} headingOptions.includeHeading - Whether or not to include a top-level heading in the generated section.
 * @param {number} headingOptions.headingLevel - Root heading level for the generated section.
 * Must be a positive integer.
 * @param {string} headingOptions.headingText - Text to display in the section heading, if one was requested.
 * @returns {string} The formatted section text, with an optional heading and surrounding newlines.
 */
function formattedSectionText(sectionBody, headingOptions) {
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
 * @param {TransformConfig | undefined} config - The transform config object.
 * @returns {boolean}
 */
function isMdxFile(config) {
	return path.extname(config?.originalPath ?? "").toLowerCase() === ".mdx";
}

/**
 * Wraps the provided generated / embedded content in prettier-ignore pragma comments.
 *
 * For MDX files, prettier-ignore directives are omitted entirely because Prettier does not
 * support the version of MDX used in this repo (MDX v3 / @mdx-js/mdx).
 * See: https://github.com/prettier/prettier/issues/12209
 *
 * @param {string} contents - The Markdown contents to be wrapped.
 * @param {TransformConfig | undefined} config - The transform config object. Used to detect the file format.
 */
function bundlePrettierPragmas(contents, config) {
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
 * @param {string} contents - The generated Markdown contents to be included.
 * @param {TransformConfig | undefined} config - The transform config object. Used to detect the file format.
 */
function formattedGeneratedContentBody(contents, config) {
	const notice = isMdxFile(config) ? mdxGeneratedContentNotice : generatedContentNotice;
	return bundlePrettierPragmas([notice, contents].join("\n"), config);
}

/**
 * Bundles the provided embedded contents with the appropriate "do not edit" notice, as well as
 * prettier-ignore pragmas (for .md files) to ensure there is not contention between our content
 * generation and prettier's formatting opinions.
 *
 * @param {string} contents - The generated Markdown contents to be included.
 * @param {TransformConfig | undefined} config - The transform config object. Used to detect the file format.
 */
function formattedEmbeddedContentBody(contents, config) {
	const notice = isMdxFile(config) ? mdxEmbeddedContentNotice : embeddedContentNotice;
	return bundlePrettierPragmas([notice, contents].join("\n"), config);
}

/**
 * Parses the provided MarkdownMagic transform options to generate the appropriate section heading options.
 *
 * @param {TransformOptions} transformationOptions - Transform options passed to the transform function.
 * @param {string} [headingText] - The text to display in the section heading.
 * Optional because individual `generate*` helpers override `headingText` themselves.
 *
 * @typedef {Object} HeadingOptions
 * @property {boolean} includeHeading - Whether or not to include a heading in the generated content.
 * @property {number} headingLevel - The heading level for the section.
 * @property {string | undefined} headingText - The text to display in the section heading.
 *
 * @returns {HeadingOptions} Heading generation options.
 */
function parseHeadingOptions(transformationOptions, headingText) {
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
 * @param {string | undefined} option - The string option value. Only `"TRUE"` and `"FALSE"` (exact, case-sensitive) are meaningful; all other values fall through to `defaultValue`.
 * @param {boolean | (() => boolean)} defaultValue - The default value, or a zero-argument callback that returns it.
 * Used if the option is not explicitly provided (`"TRUE"` or `"FALSE"`).
 */
function parseBooleanOption(option, defaultValue) {
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

module.exports = {
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

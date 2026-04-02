/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import scripts from "markdown-magic-package-scripts";

import { defaultSectionHeadingLevel } from "./constants.js";
import type { HeadingOptions, ScopeKind, TransformConfig, TransformOptions } from "./utilities.js";
import {
	formattedGeneratedContentBody,
	getPackageMetadata,
	getScopeKindFromPackage,
	isPublic,
	parseBooleanOption,
	parseHeadingOptions,
	resolveRelativePackageJsonPath,
} from "./utilities.js";
import {
	apiDocsTransform,
	exampleGettingStartedTransform,
	generateApiDocsSection,
	generateExampleGettingStartedSection,
	generateInstallationInstructionsSection,
	generateImportInstructionsSection,
	generatePackageScopeNotice,
	generatePackageScriptsSection,
	generateSectionFromTemplate,
	includeTransform,
	includeCodeTransform,
	installationInstructionsTransform,
	importInstructionsTransform,
	packageScopeNoticeTransform,
	packageScriptsTransform,
} from "./transforms/index.js";

/**
 * Generates a simple Markdown heading and contents with guidelines for taking dependencies on Fluid libraries.
 *
 * @param headingOptions - Heading generation options.
 * @returns The formatted Markdown section text.
 */
const generateDependencyGuidelines = (headingOptions: HeadingOptions): string =>
	generateSectionFromTemplate("Dependency-Guidelines-Template.md", {
		...headingOptions,
		headingText: "Using Fluid Framework libraries",
	});

/**
 * Generates a Markdown section listing Fluid Framework's minimum client requirements.
 *
 * @param headingOptions - Heading generation options.
 * @returns The formatted Markdown section text.
 */
const generateClientRequirementsSection = (headingOptions: HeadingOptions): string =>
	generateSectionFromTemplate("Client-Requirements-Template.md", {
		...headingOptions,
		headingText: "Minimum Client Requirements",
	});

/**
 * Generates a Markdown heading and contents with a section pointing developers to our contribution guidelines.
 *
 * @param headingOptions - Heading generation options.
 * @returns The formatted Markdown section text.
 */
const generateContributionGuidelinesSection = (headingOptions: HeadingOptions): string =>
	generateSectionFromTemplate("Contribution-Guidelines-Template.md", {
		...headingOptions,
		headingText: "Contribution Guidelines",
	});

/**
 * Generates a simple Markdown heading and contents with help information.
 *
 * @param headingOptions - Heading generation options.
 * @returns The formatted Markdown section text.
 */
const generateHelpSection = (headingOptions: HeadingOptions): string =>
	generateSectionFromTemplate("Help-Template.md", {
		...headingOptions,
		headingText: "Help",
	});

/**
 * Generates a simple Markdown heading and contents with trademark information.
 *
 * @param headingOptions - Heading generation options.
 * @returns The formatted Markdown section text.
 */
const generateTrademarkSection = (headingOptions: HeadingOptions): string =>
	generateSectionFromTemplate("Trademark-Template.md", {
		...headingOptions,
		headingText: "Trademark",
	});

/**
 * Generates simple "footer" contents for a library package README.
 *
 * @remarks Generally recommended for inclusion at the end of the README.
 *
 * Includes:
 *
 * - (if explicitly specified) Package script documentation
 *
 * - Fluid Framework contribution guidelines
 *
 * - Help section
 *
 * - Microsoft trademark info
 *
 * @param content - The original document file contents.
 * @param options - Transform options.
 * `options.packageJsonPath` — (optional) Relative path from the document to the package.json file. Default: `"./package.json"`.
 * `options.scripts` — `"TRUE"` to include a section enumerating the package.json scripts. Default: `"FALSE"`.
 * `options.clientRequirements` — `"TRUE"|"FALSE"` to include/exclude minimum client requirements. Default: inferred from package scope.
 * `options.contributionGuidelines` — `"FALSE"` to suppress contribution guidelines. Default: included.
 * `options.help` — `"FALSE"` to suppress help section. Default: included.
 * `options.trademark` — `"FALSE"` to suppress trademark section. Default: included.
 * @param config - Transform configuration.
 */
function readmeFooterTransform(
	content: string,
	options: TransformOptions,
	config: TransformConfig,
): string {
	const { packageJsonPath: relativePackageJsonPath } = options;
	const resolvedPackageJsonPath = resolveRelativePackageJsonPath(
		config.originalPath,
		relativePackageJsonPath,
	);
	const packageMetadata = getPackageMetadata(resolvedPackageJsonPath);

	const sectionHeadingOptions: HeadingOptions = {
		includeHeading: true,
		headingLevel: defaultSectionHeadingLevel,
	};

	const sections: string[] = [];

	if (options.scripts === "TRUE") {
		// markdown-magic-package-scripts reads the package path from `options.pkg`.
		options.pkg = relativePackageJsonPath;
		const scriptsTable = scripts(content, options, config);
		sections.push(generatePackageScriptsSection(scriptsTable, sectionHeadingOptions));
	}

	const includeClientRequirementsSection = parseBooleanOption(options.clientRequirements, () =>
		isPublic(packageMetadata),
	);
	if (includeClientRequirementsSection) {
		sections.push(generateClientRequirementsSection(sectionHeadingOptions));
	}

	if (options.contributionGuidelines !== "FALSE") {
		sections.push(generateContributionGuidelinesSection(sectionHeadingOptions));
	}

	if (options.help !== "FALSE") {
		sections.push(generateHelpSection(sectionHeadingOptions));
	}

	if (options.trademark !== "FALSE") {
		sections.push(generateTrademarkSection(sectionHeadingOptions));
	}

	return formattedGeneratedContentBody(sections.join(""), config);
}

/**
 * Generates simple "header" contents for a library package README.
 * Contains instructions for installing the package and importing its contents.
 *
 * @remarks Generally recommended for inclusion after a brief package introduction, but before more detailed sections.
 *
 * Includes:
 *
 * - Package scope notice (if applicable)
 *
 * - Installation instructions
 *
 * - Import instructions
 *
 * - Link to API documentation for the package on <fluidframework.com>
 *
 * @param content - The original document file contents.
 * @param options - Transform options.
 * `options.packageJsonPath` — (optional) Relative path from the document to the package.json file. Default: `"./package.json"`.
 * `options.packageScopeNotice` — (optional) Explicit scope kind (`"EXAMPLE"`, `"EXPERIMENTAL"`, `"INTERNAL"`, `"PRIVATE"`, `"TOOLS"`). Default: inferred from package namespace.
 * `options.dependencyGuidelines` — `"TRUE"|"FALSE"`. Default: `"TRUE"` for public packages.
 * `options.installation` — `"TRUE"|"FALSE"`. Default: `"TRUE"` for public packages.
 * `options.devDependency` — `"TRUE"` if the package should be installed as a devDependency. Default: `"FALSE"`.
 * `options.importInstructions` — `"FALSE"` to suppress import instructions. Default: always included.
 * `options.apiDocs` — `"TRUE"|"FALSE"`. Default: `"TRUE"` for public packages.
 * @param config - Transform configuration.
 */
function libraryReadmeHeaderTransform(
	content: string,
	options: TransformOptions,
	config: TransformConfig,
): string {
	const { packageJsonPath: relativePackageJsonPath } = options;
	const resolvedPackageJsonPath = resolveRelativePackageJsonPath(
		config.originalPath,
		relativePackageJsonPath,
	);
	const packageMetadata = getPackageMetadata(resolvedPackageJsonPath);
	const packageName = packageMetadata.name;
	const isPackagePublic = isPublic(packageMetadata);

	const sectionHeadingOptions: HeadingOptions = {
		includeHeading: true,
		headingLevel: defaultSectionHeadingLevel,
	};

	const sections: string[] = [];

	// Note: if the user specified an explicit scope, that takes precedence over the package namespace.
	// Cast: options.packageScopeNotice comes from TransformOptions (string | undefined); callers are
	// expected to supply a valid ScopeKind string. Unrecognized values are handled gracefully.
	const scopeKind = (options.packageScopeNotice ?? getScopeKindFromPackage(packageName)) as
		| ScopeKind
		| undefined;
	const scopeNoticeSection = generatePackageScopeNotice(scopeKind);
	if (scopeNoticeSection !== undefined) {
		sections.push(scopeNoticeSection);
	}

	const includeDependencyGuidelinesSection = parseBooleanOption(
		options.dependencyGuidelines,
		isPackagePublic,
	);
	if (includeDependencyGuidelinesSection) {
		sections.push(generateDependencyGuidelines(sectionHeadingOptions));
	}

	const includeInstallationSection = parseBooleanOption(options.installation, isPackagePublic);
	if (includeInstallationSection) {
		sections.push(
			generateInstallationInstructionsSection(
				packageName,
				options.devDependency === "TRUE",
				sectionHeadingOptions,
			),
		);
	}

	const includeImportInstructionsSection = parseBooleanOption(options.importInstructions, true);
	if (includeImportInstructionsSection) {
		sections.push(generateImportInstructionsSection(packageMetadata, sectionHeadingOptions));
	}

	const includeApiDocsSection = parseBooleanOption(options.apiDocs, isPackagePublic);
	if (includeApiDocsSection) {
		sections.push(generateApiDocsSection(packageName, sectionHeadingOptions));
	}

	return formattedGeneratedContentBody(sections.join(""), config);
}

/**
 * Generates simple README contents for a example app package.
 *
 * @param content - The original document file contents.
 * @param options - Transform options.
 * `options.packageJsonPath` — (optional) Relative path from the document to the package.json file. Default: `"./package.json"`.
 * `options.gettingStarted` — `"FALSE"` to suppress getting-started instructions. Default: included.
 * `options.usesTinylicious` — `"FALSE"` if the app does not use Tinylicious. Default: `"TRUE"`.
 * @param config - Transform configuration.
 */
function exampleAppReadmeHeaderTransform(
	content: string,
	options: TransformOptions,
	config: TransformConfig,
): string {
	const { packageJsonPath: relativePackageJsonPath } = options;

	const resolvedPackageJsonPath = resolveRelativePackageJsonPath(
		config.originalPath,
		relativePackageJsonPath,
	);

	const sectionHeadingOptions: HeadingOptions = {
		includeHeading: true,
		headingLevel: defaultSectionHeadingLevel,
	};

	const sections: string[] = [];
	if (options.gettingStarted !== "FALSE") {
		sections.push(
			generateExampleGettingStartedSection(
				resolvedPackageJsonPath,
				/* includeTinyliciousStep: */ options.usesTinylicious !== "FALSE",
				/* headingOptions: */ sectionHeadingOptions,
			),
		);
	}

	return formattedGeneratedContentBody(sections.join(""), config);
}

/**
 * Generates a README section by embedding the named template file.
 *
 * @param templateFileName - The name of the template file to be embedded.
 * @param headingOptions - Heading generation options.
 * @param config - Transform configuration. Forwarded to {@link formattedGeneratedContentBody}.
 * @returns The formatted Markdown section text (with notice comment and, for .md files, prettier-ignore pragmas).
 */
function templateTransform(
	templateFileName: string,
	headingOptions: HeadingOptions,
	config: TransformConfig,
): string {
	return formattedGeneratedContentBody(
		generateSectionFromTemplate(templateFileName, headingOptions),
		config,
	);
}

/**
 * markdown-magic config
 */
export default {
	transforms: {
		/**
		 * See {@link includeTransform}.
		 *
		 * @example
		 *
		 * ```markdown
		 * <!-- AUTO-GENERATED-CONTENT:START (INCLUDE:path=../file.js&start=1&end=-1) -->
		 * ```
		 */
		INCLUDE: includeTransform,

		/**
		 * See {@link includeCodeTransform}.
		 *
		 * @example
		 *
		 * ```markdown
		 * <!-- AUTO-GENERATED-CONTENT:START (INCLUDE_CODE:path=../file.js&start=1&end=-1&language=typescript) -->
		 * ```
		 */
		INCLUDE_CODE: includeCodeTransform,

		/**
		 * See {@link libraryReadmeHeaderTransform}.
		 *
		 * @example
		 *
		 * ```markdown
		 * <!-- AUTO-GENERATED-CONTENT:START (LIBRARY_README_HEADER:packageJsonPath=./package.json&installation=TRUE&devDependency=FALSE&apiDocs=TRUE) -->
		 * ```
		 */
		LIBRARY_README_HEADER: libraryReadmeHeaderTransform,

		/**
		 * See {@link exampleAppReadmeHeaderTransform}.
		 *
		 * @example
		 *
		 * ```markdown
		 * <!-- AUTO-GENERATED-CONTENT:START (EXAMPLE_APP_README_HEADER:packageJsonPath=./package.json&gettingStarted=TRUE&usesTinylicious=TRUE&scripts=FALSE&contributionGuidelines=TRUE&help=TRUE&trademark=TRUE) -->
		 * <!-- AUTO-GENERATED-CONTENT:END -->
		 * ```
		 */
		EXAMPLE_APP_README_HEADER: exampleAppReadmeHeaderTransform,

		/**
		 * See {@link readmeFooterTransform}.
		 *
		 * @example
		 *
		 * ```markdown
		 * <!-- AUTO-GENERATED-CONTENT:START (README_FOOTER:packageJsonPath=./package.json&scripts=FALSE&contributionGuidelines=TRUE&help=TRUE&trademark=TRUE) -->
		 * ```
		 */
		README_FOOTER: readmeFooterTransform,

		/**
		 * See {@link exampleGettingStartedTransform}.
		 *
		 * @example
		 *
		 * ```markdown
		 * <!-- AUTO-GENERATED-CONTENT:START (EXAMPLE_GETTING_STARTED_SECTION:packageJsonPath=./package.json&usesTinylicious=TRUE&includeHeading=TRUE&headingLevel=2) -->
		 * <!-- AUTO-GENERATED-CONTENT:END -->
		 * ```
		 */
		EXAMPLE_GETTING_STARTED: exampleGettingStartedTransform,

		/**
		 * See {@link packageScopeNoticeTransform}.
		 *
		 * @example
		 *
		 * ```markdown
		 * <!-- AUTO-GENERATED-CONTENT:START (PACKAGE_SCOPE_NOTICE:packageJsonPath=./package.json) -->
		 * <!-- AUTO-GENERATED-CONTENT:END -->
		 * ```
		 */
		PACKAGE_SCOPE_NOTICE: packageScopeNoticeTransform,

		/**
		 * See {@link apiDocsTransform}.
		 *
		 * @example
		 *
		 * ```markdown
		 * <!-- AUTO-GENERATED-CONTENT:START (API_DOCS:packageJsonPath=./package.json&includeHeading=TRUE&headingLevel=2) -->
		 * <!-- AUTO-GENERATED-CONTENT:END -->
		 * ```
		 */
		API_DOCS: apiDocsTransform,

		/**
		 * See {@link installationInstructionsTransform}.
		 *
		 * @example
		 *
		 * ```markdown
		 * <!-- AUTO-GENERATED-CONTENT:START (INSTALLATION_INSTRUCTIONS:packageJsonPath=./package.json&includeHeading=TRUE&headingLevel=2&devDependency=FALSE) -->
		 * <!-- AUTO-GENERATED-CONTENT:END -->
		 * ```
		 */
		INSTALLATION_INSTRUCTIONS: installationInstructionsTransform,

		/**
		 * See {@link importInstructionsTransform}.
		 *
		 * @example
		 *
		 * ```markdown
		 * <!-- AUTO-GENERATED-CONTENT:START (IMPORT_INSTRUCTIONS:packageJsonPath=./package.json&includeHeading=TRUE&headingLevel=2) -->
		 * <!-- AUTO-GENERATED-CONTENT:END -->
		 * ```
		 */
		IMPORT_INSTRUCTIONS: importInstructionsTransform,

		/**
		 * Generates a README section with Fluid Framework client requirements.
		 *
		 * @param content - The original document file contents.
		 * @param options - `options.includeHeading` (`"TRUE"|"FALSE"`, default `"TRUE"`),
		 * `options.headingLevel` (positive integer string, default `"2"`).
		 * @param config - Transform configuration.
		 *
		 * @example
		 *
		 * ```markdown
		 * <!-- AUTO-GENERATED-CONTENT:START (CLIENT_REQUIREMENTS:headingLevel=2) -->
		 * <!-- AUTO-GENERATED-CONTENT:END -->
		 * ```
		 */
		CLIENT_REQUIREMENTS: (
			content: string,
			options: TransformOptions,
			config: TransformConfig,
		) =>
			templateTransform(
				"Client-Requirements-Template.md",
				parseHeadingOptions(options, "Client Requirements"),
				config,
			),

		/**
		 * Generates a README section with Microsoft trademark info.
		 *
		 * @param content - The original document file contents.
		 * @param options - `options.includeHeading` (`"TRUE"|"FALSE"`, default `"TRUE"`),
		 * `options.headingLevel` (positive integer string, default `"2"`).
		 * @param config - Transform configuration.
		 *
		 * @example
		 *
		 * ```markdown
		 * <!-- AUTO-GENERATED-CONTENT:START (TRADEMARK:includeHeading=TRUE&headingLevel=2) -->
		 * <!-- AUTO-GENERATED-CONTENT:END -->
		 * ```
		 */
		TRADEMARK: (content: string, options: TransformOptions, config: TransformConfig) =>
			templateTransform(
				"Trademark-Template.md",
				parseHeadingOptions(options, "Trademark"),
				config,
			),

		/**
		 * Generates a README section with fluid-framework contribution guidelines.
		 *
		 * @param content - The original document file contents.
		 * @param options - `options.includeHeading` (`"TRUE"|"FALSE"`, default `"TRUE"`),
		 * `options.headingLevel` (positive integer string, default `"2"`).
		 * @param config - Transform configuration.
		 *
		 * @example
		 *
		 * ```markdown
		 * <!-- AUTO-GENERATED-CONTENT:START (CONTRIBUTION_GUIDELINES:includeHeading=TRUE&headingLevel=2) -->
		 * <!-- AUTO-GENERATED-CONTENT:END -->
		 * ```
		 */
		CONTRIBUTION_GUIDELINES: (
			content: string,
			options: TransformOptions,
			config: TransformConfig,
		) =>
			templateTransform(
				"Contribution-Guidelines-Template.md",
				parseHeadingOptions(options, "Contribution Guidelines"),
				config,
			),

		/**
		 * Generates a README section with fluid-framework dependency guidelines.
		 *
		 * @param content - The original document file contents.
		 * @param options - `options.includeHeading` (`"TRUE"|"FALSE"`, default `"TRUE"`),
		 * `options.headingLevel` (positive integer string, default `"2"`).
		 * @param config - Transform configuration.
		 *
		 * @example
		 *
		 * ```markdown
		 * <!-- AUTO-GENERATED-CONTENT:START (DEPENDENCY_GUIDELINES:includeHeading=TRUE&headingLevel=2) -->
		 * <!-- AUTO-GENERATED-CONTENT:END -->
		 * ```
		 */
		DEPENDENCY_GUIDELINES: (
			content: string,
			options: TransformOptions,
			config: TransformConfig,
		) =>
			templateTransform(
				"Dependency-Guidelines-Template.md",
				parseHeadingOptions(options, "Using Fluid Framework libraries"),
				config,
			),

		/**
		 * Generates a README "Help" section.
		 *
		 * @param content - The original document file contents.
		 * @param options - `options.includeHeading` (`"TRUE"|"FALSE"`, default `"TRUE"`),
		 * `options.headingLevel` (positive integer string, default `"2"`).
		 * @param config - Transform configuration.
		 *
		 * @example
		 *
		 * ```markdown
		 * <!-- AUTO-GENERATED-CONTENT:START (HELP:includeHeading=TRUE&headingLevel=2) -->
		 * <!-- AUTO-GENERATED-CONTENT:END -->
		 * ```
		 */
		HELP: (content: string, options: TransformOptions, config: TransformConfig) =>
			templateTransform("Help-Template.md", parseHeadingOptions(options, "Help"), config),

		/**
		 * See {@link packageScriptsTransform}.
		 *
		 * @example
		 *
		 * ```markdown
		 * <!-- AUTO-GENERATED-CONTENT:START (PACKAGE_SCRIPTS:includeHeading=TRUE&headingLevel=2) -->
		 * <!-- AUTO-GENERATED-CONTENT:END -->
		 * ```
		 */
		PACKAGE_SCRIPTS: packageScriptsTransform,
	},
	globbyOptions: {
		gitignore: true,
		onlyFiles: true,
		deep: 5,
	},
};

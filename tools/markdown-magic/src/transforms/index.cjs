/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// @ts-check

/**
 * IMPORTANT: Transform output must be valid in both Markdown (.md) and MDX (.mdx).
 *
 * All transform functions registered here must return content that is compatible with
 * both file formats. Specifically, transforms must NOT produce:
 * - Raw HTML tags (e.g. <div>, <span>)
 * - HTML comment syntax (<!-- -->)
 * - Markdown autolink syntax (<https://url> or <http://url>) — use explicit link
 *   syntax ([url](url)) instead, which is valid in both formats
 *
 * Violating this constraint will cause MDX parse errors when generated content is
 * embedded in .mdx files.
 */

const {
	apiDocsTransform,
	generateApiDocsSection,
} = require("./apiDocsLinkSectionTransform.cjs");

const {
	generateExampleGettingStartedSection,
	exampleGettingStartedTransform,
} = require("./exampleGettingStartedTransform.cjs");

const { generateSectionFromTemplate } = require("./generateSectionFromTemplate.cjs");

const { includeTransform } = require("./includeTransform.cjs");

const { includeCodeTransform } = require("./includeCodeTransform.cjs");

const {
	generateInstallationInstructionsSection,
	installationInstructionsTransform,
} = require("./installationInstructionsTransform.cjs");

const {
	generateImportInstructionsSection,
	importInstructionsTransform,
} = require("./packageImportInstructionsTransform.cjs");

const {
	generatePackageScopeNotice,
	packageScopeNoticeTransform,
} = require("./packageScopeNoticeTransform.cjs");

const {
	generatePackageScriptsSection,
	packageScriptsTransform,
} = require("./packageScriptsTransform.cjs");

module.exports = {
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
};

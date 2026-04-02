/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

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

export { apiDocsTransform, generateApiDocsSection } from "./apiDocsLinkSectionTransform.js";

export {
	generateExampleGettingStartedSection,
	exampleGettingStartedTransform,
} from "./exampleGettingStartedTransform.js";

export { generateSectionFromTemplate } from "./generateSectionFromTemplate.js";

export { includeTransform } from "./includeTransform.js";

export { includeCodeTransform } from "./includeCodeTransform.js";

export {
	generateInstallationInstructionsSection,
	installationInstructionsTransform,
} from "./installationInstructionsTransform.js";

export {
	generateImportInstructionsSection,
	importInstructionsTransform,
} from "./packageImportInstructionsTransform.js";

export {
	generatePackageScopeNotice,
	packageScopeNoticeTransform,
} from "./packageScopeNoticeTransform.js";

export {
	generatePackageScriptsSection,
	packageScriptsTransform,
} from "./packageScriptsTransform.js";

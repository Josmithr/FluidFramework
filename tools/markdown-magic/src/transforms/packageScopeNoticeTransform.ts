/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ScopeKind, TransformConfig, TransformOptions } from "../utilities.js";
import {
	formattedSectionText,
	getPackageMetadata,
	getScopeKindFromPackage,
	readTemplate,
	resolveRelativePackageJsonPath,
} from "../utilities.js";

/**
 * Generates simple Markdown contents indicating implications of the specified kind of package scope.
 *
 * @param kind - Scope kind to switch on.
 * EXPERIMENTAL: See templates/Experimental-Package-Notice-Template.md.
 * INTERNAL: See templates/Internal-Package-Notice-Template.md.
 * PRIVATE: See templates/Private-Package-Notice-Template.md.
 * TOOLS: See templates/Tools-Package-Notice-Template.md.
 *
 * @returns The appropriate notice, if applicable. Otherwise, `undefined`.
 */
const generatePackageScopeNotice = (kind: ScopeKind | undefined): string | undefined => {
	let rawContents: string;
	switch (kind) {
		case "EXAMPLE":
			rawContents = readTemplate("Example-Package-Notice-Template.md");
			break;
		case "EXPERIMENTAL":
			rawContents = readTemplate("Experimental-Package-Notice-Template.md");
			break;
		case "INTERNAL":
			rawContents = readTemplate("Internal-Package-Notice-Template.md");
			break;
		case "PRIVATE":
			rawContents = readTemplate("Private-Package-Notice-Template.md");
			break;
		case "TOOLS":
			rawContents = readTemplate("Tools-Package-Notice-Template.md");
			break;
		default:
			return undefined;
	}

	return formattedSectionText(rawContents, /* headingOptions: */ undefined);
};

/**
 * Generates simple Markdown contents indicating implications of the specified kind of package scope.
 *
 * @param content - The original document file contents.
 * @param options - Transform options.
 * `options.packageJsonPath` — (optional) Relative path to package.json. Default: `"./package.json"`.
 * `options.scopeKind` — (optional) Explicit scope kind to override the inferred value.
 * EXAMPLE: See templates/Example-Package-Notice-Template.md.
 * EXPERIMENTAL: See templates/Experimental-Package-Notice-Template.md.
 * INTERNAL: See templates/Internal-Package-Notice-Template.md.
 * PRIVATE: See templates/Private-Package-Notice-Template.md.
 * TOOLS: See templates/Tools-Package-Notice-Template.md.
 * `undefined`: Inherit from package namespace (`fluid-experimental`, `fluid-internal`, `fluid-private`, `fluid-tools`, etc.).
 * @param config - Transform configuration.
 * @returns The formatted scope notice, or `undefined` if the package has no applicable scope.
 * The caller (e.g. {@link libraryReadmeHeaderTransform}) is responsible for guarding against `undefined`.
 */
function packageScopeNoticeTransform(
	content: string,
	options: TransformOptions,
	config: TransformConfig,
): string | undefined {
	const { packageJsonPath, scopeKind } = options;

	const resolvedPackageJsonPath = resolveRelativePackageJsonPath(
		config.originalPath,
		packageJsonPath,
	);
	const packageMetadata = getPackageMetadata(resolvedPackageJsonPath);
	const packageName = packageMetadata.name;

	// Note: if the user specified an explicit scope, that takes precedence over the package namespace.
	// Cast: scopeKind comes from TransformOptions (string | undefined); callers are expected to
	// supply a valid ScopeKind string. Unrecognized values fall through to the default case in
	// generatePackageScopeNotice and return undefined harmlessly.
	const scopeKindWithInheritance = (scopeKind ?? getScopeKindFromPackage(packageName)) as
		| ScopeKind
		| undefined;
	return generatePackageScopeNotice(scopeKindWithInheritance);
}

export { generatePackageScopeNotice, packageScopeNoticeTransform };

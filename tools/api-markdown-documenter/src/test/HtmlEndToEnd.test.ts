/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as Path from "node:path";
import { fileURLToPath } from "node:url";

import { ApiItemKind, ReleaseTag } from "@microsoft/api-extractor-model";
import { FileSystem, NewlineKind } from "@rushstack/node-core-library";

import { type HtmlRenderConfiguration, renderDocumentAsHtml } from "../renderers/index.js";
import {
	endToEndTests,
	type ApiModelTestOptions,
	type EndToEndTestConfig,
} from "./EndToEndTests.js";
import type { DocumentNode } from "../documentation-domain/index.js";

const dirname = Path.dirname(fileURLToPath(import.meta.url));

/**
 * Temp directory under which all tests that generate files will output their contents.
 */
const testTemporaryDirectoryPath = Path.resolve(dirname, "test_temp", "html");

/**
 * Snapshot directory to which generated test data will be copied.
 * Relative to lib/test
 */
const snapshotsDirectoryPath = Path.resolve(
	dirname,
	"..",
	"..",
	"src",
	"test",
	"snapshots",
	"html",
);

// Relative to lib/test
const testDataDirectoryPath = Path.resolve(dirname, "..", "..", "src", "test", "test-data");

const apiModels: ApiModelTestOptions[] = [
	{
		modelName: "minimal",
		directoryPath: Path.resolve(testDataDirectoryPath, "minimal"),
	},
	{
		modelName: "simple-suite-test",
		directoryPath: Path.resolve(testDataDirectoryPath, "simple-suite-test"),
	},
	// TODO: add other models
];

const testConfigs: EndToEndTestConfig<HtmlRenderConfiguration>[] = [
	/**
	 * A sample "flat" configuration, which renders every item kind under a package to the package parent document.
	 */
	{
		testName: "default-config",
		transformConfig: {
			uriRoot: ".",
		},
		renderConfig: {},
	},

	/**
	 * A sample "flat" configuration, which renders every item kind under a package to the package parent document.
	 */
	{
		testName: "flat-config",
		transformConfig: {
			uriRoot: "docs",
			includeBreadcrumb: true,
			includeTopLevelDocumentHeading: false,
			documentBoundaries: [], // Render everything to package documents
			hierarchyBoundaries: [], // No additional hierarchy beyond the package level
			minimumReleaseLevel: ReleaseTag.Beta, // Only include `@public` and `beta` items in the docs suite
		},
		renderConfig: {},
	},

	/**
	 * A sample "sparse" configuration, which renders every item kind to its own document.
	 */
	{
		testName: "sparse-config",
		transformConfig: {
			uriRoot: "docs",
			includeBreadcrumb: false,
			includeTopLevelDocumentHeading: true,
			// Render everything to its own document
			documentBoundaries: [
				ApiItemKind.CallSignature,
				ApiItemKind.Class,
				ApiItemKind.ConstructSignature,
				ApiItemKind.Constructor,
				ApiItemKind.Enum,
				ApiItemKind.EnumMember,
				ApiItemKind.Function,
				ApiItemKind.IndexSignature,
				ApiItemKind.Interface,
				ApiItemKind.Method,
				ApiItemKind.MethodSignature,
				ApiItemKind.Namespace,
				ApiItemKind.Property,
				ApiItemKind.PropertySignature,
				ApiItemKind.TypeAlias,
				ApiItemKind.Variable,
			],
			hierarchyBoundaries: [], // No additional hierarchy beyond the package level
			minimumReleaseLevel: ReleaseTag.Public, // Only include `@public` items in the docs suite
		},
		renderConfig: {
			startingHeadingLevel: 2,
		},
	},
];

async function renderDocumentToFile(
	document: DocumentNode,
	renderConfig: HtmlRenderConfiguration,
	outputDirectoryPath: string,
): Promise<void> {
	const renderedDocument = renderDocumentAsHtml(document, renderConfig);

	const filePath = Path.join(outputDirectoryPath, `${document.documentPath}.html`);
	await FileSystem.writeFileAsync(filePath, renderedDocument, {
		convertLineEndings: NewlineKind.Lf,
		ensureFolderExists: true,
	});
}

endToEndTests<HtmlRenderConfiguration>({
	suiteName: "Markdown End-to-End Tests",
	temporaryOutputDirectoryPath: testTemporaryDirectoryPath,
	snapshotsDirectoryPath,
	render: renderDocumentToFile,
	apiModels,
	testConfigs,
});

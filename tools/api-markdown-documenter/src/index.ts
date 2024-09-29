/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Contains a programatic API for generating {@link https://en.wikipedia.org/wiki/Markdown | Markdown} documentation
 * from an API report generated by {@link https://api-extractor.com/ | API-Extractor}.
 *
 * @remarks Akin to {@link https://github.com/microsoft/rushstack/tree/main/apps/api-documenter | API-Documenter} and
 * is heavily based upon it, but is designed to be more extensible and to be be used programatically.
 *
 * @packageDocumentation
 */

export {
	type ApiItemTransformationConfiguration,
	type ApiItemTransformationOptions,
	type DefaultDocumentationSuiteOptions,
	type DocumentationSuiteOptions,
	type DocumentBoundaries,
	// TODO: remove this once utility APIs can be called with partial configs.
	getApiItemTransformationConfigurationWithDefaults,
	type HierarchyBoundaries,
	type TransformApiItemWithChildren,
	type TransformApiItemWithoutChildren,
	transformApiModel,
	transformTsdocNode,
} from "./api-item-transforms/index.js";

// We want to make sure the entirety of this domain is accessible.
// eslint-disable-next-line no-restricted-syntax
export * from "./documentation-domain/index.js";

export type {
	documentToMarkdown,
	documentationNodeToMarkdown,
	documentationNodesToMarkdown,
	MdastTree, // TODO: don't export this
	Transformation as ToMarkdownTransformation,
	TransformationConfig as ToMarkdownTransformationConfig,
	TransformationContext as ToMarkdownTransformationContext,
	Transformations as ToMarkdownTransformations,
} from "./documentation-domain-to-markdown/index.js";
export {
	documentToHtml,
	documentationNodeToHtml,
	documentationNodesToHtml,
	type Transformation as ToHtmlTransformation,
	type Transformations as ToHtmlTransformations,
	type TransformationConfig as ToHtmlConfig,
	type TransformationContext as ToHtmlContext,
} from "./documentation-domain-to-html/index.js";
export {
	DocumentWriter,
	type HtmlRenderContext,
	type HtmlRenderers,
	type HtmlRenderConfiguration,
	type MarkdownRenderContext,
	type MarkdownRenderers,
	type MarkdownRenderConfiguration,
} from "./renderers/index.js";
export type { ConfigurationBase } from "./ConfigurationBase.js";
export type { FileSystemConfiguration } from "./FileSystemConfiguration.js";
export type { Heading } from "./Heading.js";
export type { Link, UrlTarget } from "./Link.js";
export {
	lintApiModel,
	type LintApiModelConfiguration,
	type LinterErrors,
	type LinterReferenceError,
} from "./LintApiModel.js";
export { loadModel, type LoadModelOptions } from "./LoadModel.js";
export {
	defaultConsoleLogger,
	type LoggingFunction,
	type Logger,
	verboseConsoleLogger,
} from "./Logging.js";
export {
	type ApiFunctionLike,
	type ApiMemberKind,
	type ApiModifier,
	type ApiModuleLike,
	type ApiSignatureLike,
} from "./utilities/index.js";

// #region Scoped exports

// This pattern is required to scope the utilities in a way that API-Extractor supports.
/* eslint-disable unicorn/prefer-export-from */

// Export `ApiItem`-related utilities
import * as ApiItemUtilities from "./ApiItemUtilitiesModule.js";

// Export layout-related utilities (for use in writing custom transformations)
import * as LayoutUtilities from "./LayoutUtilitiesModule.js";

// Export renderers
import * as HtmlRenderer from "./HtmlRendererModule.js";
import * as MarkdownRenderer from "./MarkdownRendererModule.js";

export {
	/**
	 * Utilities for use with `ApiItem`s.
	 *
	 * @remarks
	 *
	 * These are intended to be useful when injecting custom `ApiItem` transformation behaviors via {@link ApiItemTransformationConfiguration}.
	 *
	 * @public
	 */
	ApiItemUtilities,
	/**
	 * Utilities related to generating {@link DocumentationNode} content for {@link @microsoft/api-extractor-model#ApiItem}s.
	 *
	 * @remarks
	 *
	 * These are intended to be useful when injecting custom `ApiItem` transformation behaviors via {@link ApiItemTransformationConfiguration}.
	 *
	 * @public
	 */
	LayoutUtilities,
	/**
	 * Functionality for rendering {@link DocumentationNode}s as HTML.
	 *
	 * @alpha
	 */
	HtmlRenderer,
	/**
	 * Functionality for rendering {@link DocumentationNode}s as Markdown.
	 *
	 * @public
	 */
	MarkdownRenderer,
};

/* eslint-enable unicorn/prefer-export-from */

// #endregion

// #region Convenience re-exports

// Convenience re-exports
export {
	type ApiItem,
	ApiItemKind,
	type ApiModel,
	type ApiPackage,
	ReleaseTag,
} from "@microsoft/api-extractor-model";
export { NewlineKind } from "@rushstack/node-core-library";

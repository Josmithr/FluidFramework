/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Root as MdastRoot, RootContent as MdastTree } from "mdast";
import type { DocumentNode, DocumentationNode } from "../documentation-domain/index.js";
import type { TransformationConfig } from "./configuration/index.js";
import {
	createTransformationContext,
	type TransformationContext,
} from "./TransformationContext.js";

/**
 * Generates an Markdown AST from the provided {@link DocumentNode}.
 *
 * @param document - The document to transform.
 * @param config - Markdown transformation configuration.
 *
 * @public
 */
export function documentToMarkdown(
	document: DocumentNode,
	config: TransformationConfig,
): MdastRoot {
	const transformationContext = createTransformationContext(config);

	const transformedChildren = documentationNodesToMarkdown(
		document.children,
		transformationContext,
	);
	return {
		type: "root",
		children: transformedChildren,
	};
}

/**
 * Generates an Markdown AST from the provided {@link DocumentationNode}.
 *
 * @param node - The documentation node to transform.
 * @param config - The Markdown transformation configuration. Unspecified options will be filled with defaults.
 *
 * @public
 */
export function documentationNodeToMarkdown(
	node: DocumentationNode,
	config: TransformationConfig,
): MdastTree;
/**
 * Generates an Markdown AST from the provided {@link DocumentationNode}.
 *
 * @param node - The documentation node to transform.
 * @param context - The Markdown transformation context.
 *
 * @public
 */
export function documentationNodeToMarkdown(
	node: DocumentationNode,
	context: TransformationContext,
): MdastTree;
/**
 * `documentationNodeToMarkdown` implementation.
 */
export function documentationNodeToMarkdown(
	node: DocumentationNode,
	configOrContext: TransformationConfig | TransformationContext,
): MdastTree {
	const context = getContext(configOrContext);

	if (context.transformations[node.type] === undefined) {
		throw new Error(
			`Encountered a DocumentationNode with neither a user-provided nor system-default renderer. Type: "${node.type}". Please provide a transformation for this type.`,
		);
	}

	return context.transformations[node.type](node, context);
}

/**
 * Generates a series of Markdown ASTs from the provided {@link DocumentationNode}s.
 *
 * @public
 */
export function documentationNodesToMarkdown(
	nodes: DocumentationNode[],
	config: TransformationConfig,
): MdastTree[];
/**
 * Generates a series of Markdown ASTs from the provided {@link DocumentationNode}s.
 *
 * @public
 */
export function documentationNodesToMarkdown(
	nodes: DocumentationNode[],
	transformationContext: TransformationContext,
): MdastTree[];
/**
 * `documentationNodesToMarkdown` implementation.
 */
export function documentationNodesToMarkdown(
	nodes: DocumentationNode[],
	configOrContext: TransformationConfig | TransformationContext,
): MdastTree[] {
	const context = getContext(configOrContext);
	return nodes.map((node) => documentationNodeToMarkdown(node, context));
}

function getContext(
	configOrContext: TransformationConfig | TransformationContext,
): TransformationContext {
	return (configOrContext as Partial<TransformationContext>).transformations === undefined
		? createTransformationContext(configOrContext)
		: (configOrContext as TransformationContext);
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { type DocumentationNode, type SingleLineDocumentationNode } from "./DocumentationNode";

/**
 * Asserts that all provided nodes in the list are {@link DocumentationNode.singleLine | single-line}.
 */
export function assertNodesAreSingleLine(
	nodes: DocumentationNode[],
): asserts nodes is SingleLineDocumentationNode[] {
	for (const node of nodes) {
		if (!node.singleLine) {
			throw new Error("List of nodes contains 1 or more multi-line nodes.");
		}
	}
}

/**
 * Asserts that the provided node is {@link DocumentationNode.singleLine | single-line}.
 */
export function assertNodeIsSingleLine(
	node: DocumentationNode,
): asserts node is SingleLineDocumentationNode {
	if (!node.singleLine) {
		throw new Error("Node is multi-line.");
	}
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";
import type { RootContent as MdastRootContent } from "mdast";

import type { DocumentationNode } from "../../documentation-domain/index.js";
import { createTransformationContext } from "../TransformationContext.js";
import { type MdastTree, type TransformationConfig } from "../configuration/index.js";
import { documentationNodeToMarkdown } from "../ToMarkdown.js";

/**
 * Tests transforming an individual {@link DocumentationNode} to Markdown.
 */
export function testTransformation(
	node: DocumentationNode,
	config?: Partial<TransformationConfig>,
): MdastRootContent[] {
	return documentationNodeToMarkdown(node, createTransformationContext(config));
}

/**
 * Runs the {@link documentationNodeToMarkdown} transformation on the input and asserts the output matches the expected
 * `hast` tree.
 */
export function assertTransformation(
	input: DocumentationNode,
	expected: MdastTree,
	transformationConfig?: TransformationConfig,
): void {
	const actual = testTransformation(input, transformationConfig);

	if (Array.isArray(expected)) {
		expect(actual).to.deep.equal(expected);
	} else {
		expect(actual.length).to.equal(1);
		expect(actual[0]).to.deep.equal(expected);
	}
}

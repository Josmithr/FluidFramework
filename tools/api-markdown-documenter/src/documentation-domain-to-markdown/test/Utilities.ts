/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";
import type { RootContent as MdastTree } from "mdast";
import type { DocumentationNode } from "../../documentation-domain/index.js";
import { createTransformationContext } from "../TransformationContext.js";
import { type TransformationConfig } from "../configuration/index.js";
import { documentationNodeToMarkdown } from "../ToMarkdown.js";

/**
 * Tests transforming an individual {@link DocumentationNode} to Markdown.
 */
export function testTransformation(
	node: DocumentationNode,
	config?: Partial<TransformationConfig>,
): MdastTree {
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
	expect(actual).to.deep.equal(expected);
}

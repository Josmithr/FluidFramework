/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { expect } from "chai";
import type { Text as MdastTest } from "mdast";
import { DocumentationLiteralNodeBase } from "../../documentation-domain/index.js";
import type { TransformationContext } from "../TransformationContext.js";
import { assertTransformation, testTransformation } from "./Utilities.js";
import type { Transformations } from "../configuration/Transformation.js";

/**
 * Mock custom {@link DocumentationNode} for use in the tests below.
 */
class CustomDocumentationNode extends DocumentationLiteralNodeBase<string> {
	public static readonly type = "Custom Node";
	public readonly type = CustomDocumentationNode.type;
	public readonly singleLine: boolean = false;
	public readonly isEmpty: boolean = false;
	public constructor(value: string) {
		super(value);
	}
}

/**
 * Mock custom `documentationNodeToMarkdown` transformation for {@link CustomDocumentationNode}.
 */
function customDocumentationNodeToMarkdown(
	node: CustomDocumentationNode,
	context: TransformationContext,
): MdastTest {
	return { type: "text", value: `${node.value}!` };
}

// The following are testing our support for custom DocumentationNode implementations.
// Assuming an appropriate renderer is supplied, the system should be able to handle them correctly.
describe("Custom node to Markdown transformation tests", () => {
	it("Can render a custom node type when given a renderer", () => {
		const input = new CustomDocumentationNode("foo");
		const customTransformations: Transformations = {
			[CustomDocumentationNode.type]: (node, context) =>
				customDocumentationNodeToMarkdown(node as CustomDocumentationNode, context),
		};

		assertTransformation(input, { type: "text", value: "foo!" }, { customTransformations });
	});

	it("Throws rendering a custom node type when no renderer is provided for it", () => {
		const input = new CustomDocumentationNode("foo");
		expect(() => testTransformation(input)).to.throw();
	});
});

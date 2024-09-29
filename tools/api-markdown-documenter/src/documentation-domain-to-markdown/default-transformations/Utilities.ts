/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	Delete as MdastDelete,
	Emphasis as MdastEmphasis,
	ListItem as MdastListItem,
	Strong as MdastStrong,
	RootContent as MdastRootContent,
} from "mdast";
import { emphasis, listItem, strike, strong } from "mdast-builder";

import type { DocumentationNode, TextFormatting } from "../../documentation-domain/index.js";
import type { TransformationContext } from "../TransformationContext.js";
import { documentationNodeToMarkdown } from "../ToMarkdown.js";

/**
 * Transforms a list of {@link DocumentationNode}s under a List into a series of {@link MdastListItem}.
 */
export function transformListChildren(
	children: DocumentationNode[],
	context: TransformationContext,
): MdastListItem[] {
	return children.map((child) => {
		return listItem(documentationNodeToMarkdown(child, context)) as MdastListItem;
	});
}

/**
 * Wraps the provided tree in the appropriate formatting tags based on the provided context.
 */
export function applyFormatting(tree: MdastRootContent, context: TextFormatting): MdastRootContent {
	let result: MdastRootContent = tree;

	// The ordering in which we wrap here is effectively arbitrary, but it does impact the order of the tags in the output.
	// Note if you're editing: tests may implicitly rely on this ordering.
	if (context.strikethrough === true) {
		result = strike(result) as MdastDelete;
	}
	if (context.italic === true) {
		result = emphasis(result) as MdastEmphasis;
	}
	if (context.bold === true) {
		result = strong(result) as MdastStrong;
	}

	return result;
}

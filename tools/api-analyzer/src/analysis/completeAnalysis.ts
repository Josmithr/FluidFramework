import assert from "node:assert/strict";
import {
	DocPlainText,
	DocCodeSpan,
	DocFencedCode,
	DocLinkTag,
	type DocNode,
} from "@microsoft/tsdoc";
import type { CompletedAnalysis } from "../analysis-types/completedGraph.js";
import type { AnalysisContext } from "./documentationContext.js";
import {
	bindDocumentationLinks,
	bindDocumentationReferences,
	resolveDocumentation,
} from "./documentation.js";
import { freezeData } from "../utilities/freezeData.js";
import type { Result } from "../analysis-types/result.js";

/**
 * Completes supported documentation validation and detaches results for all output generators.
 *
 * @remarks
 * Consumes the invocation's parsed comments once. Original facts and classification must already be frozen.
 * The result retains resolved comments and link provenance, but never retains mutable parser nodes.
 *
 * @param context - Original indexed facts, parsed comments, and classification from one invocation.
 * @returns A completed graph, or documentation diagnostics without partial graph data.
 * @throws If lookup data or bindings violate internal invariants.
 */
export function completeAnalysis(context: AnalysisContext): Result<CompletedAnalysis> {
	const inheritance = bindDocumentationReferences(context);
	if (!inheritance.ok) {
		return inheritance;
	}
	const links = bindDocumentationLinks(context);
	if (!links.ok) {
		return links;
	}
	const documentation = resolveDocumentation(context, inheritance.value, {
		linkValidation: { bindings: links.value, metadata: context.metadata },
	});
	if (!documentation.ok) {
		return documentation;
	}
	// Keep the completed data independent of the context's mutable TSDoc nodes and maps.
	return freezeData({
		ok: true,
		value: {
			facts: context.facts,
			classification: context.classification,
			documentation: documentation.value.map((resolved) => {
				const original = context.items.get(resolved.id);
				assert.ok(original, "Resolved documentation must have an original input.");
				return {
					...resolved,
					documented: hasDocumentationContent(original.parsed.docComment),
					originalBlockTags: [...original.originalBlockTags],
				};
			}),
		},
	});
}

/**
 * Checks resolved content without treating metadata or comment delimiters as descriptive text.
 *
 * @param node - A resolved TSDoc node whose API links have passed policy validation.
 * @returns Whether this node or a descendant contains descriptive text, code, or a link.
 */
function hasDocumentationContent(node: DocNode): boolean {
	if (node instanceof DocPlainText) {
		return node.text.trim().length > 0;
	}
	if (node instanceof DocCodeSpan || node instanceof DocFencedCode) {
		return node.code.trim().length > 0;
	}
	if (node instanceof DocLinkTag) {
		return true;
	}
	return node.getChildNodes().some(hasDocumentationContent);
}

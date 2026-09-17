import assert from "node:assert/strict";
import {
	DocPlainText,
	DocCodeSpan,
	DocFencedCode,
	DocLinkTag,
	TSDocConfiguration,
	type DocNode,
} from "@microsoft/tsdoc";
import type { CompletedAnalysis } from "../analysis-types/completedGraph.js";
import type {
	AutomaticDocumentationBinding,
	DocumentationInput,
} from "../analysis-types/documentation.js";
import {
	createDocumentationContext,
	type AnalysisContext,
	type ParsedDocumentationItem,
} from "./documentationContext.js";
import {
	bindAutomaticDocumentationReferences,
	bindDocumentationLinks,
	bindDocumentationReferences,
	resolveDocumentation,
} from "./documentation.js";
import { freezeData } from "../utilities/freezeData.js";
import { DiagnosticCode, failure, type Result } from "../analysis-types/result.js";
import { validateReferencePolicies } from "./referencePolicy.js";

/**
 * Completes supported documentation validation and detaches results for all output generators.
 *
 * @remarks
 * Consumes the invocation's parsed comments once. Original facts and classification must already be frozen.
 * The result retains resolved comments and link provenance, but never retains mutable parser nodes.
 * Includes supported declaration, property, callable, and declared-member comments.
 * Automatic inheritance applies only to confidently matched non-overloaded members without local comments.
 * Selected dependency documentation retains resolved link and section origins without repeating target resolution.
 * Merged-member precedence and unsupported declaration ownership remain pending.
 *
 * @param context - Original indexed facts, parsed comments, and classification from one invocation.
 * @returns A completed graph, or documentation diagnostics without partial graph data.
 * @throws If lookup data or bindings violate internal invariants.
 */
export function completeAnalysis(context: AnalysisContext): Result<CompletedAnalysis> {
	for (const item of context.items.values()) {
		if (
			item.packageName !== context.facts.packageName &&
			(item.originalLinks.length > 0 || item.parsed.docComment.inheritDocTag !== undefined) &&
			!context.dependencies.some((model) => model.packageName === item.packageName)
		) {
			return failure(
				DiagnosticCode.DocumentationUnsupported,
				`API ${item.id}: documentation originated in ${item.packageName}, outside the configured suite. Select its model before resolving references through re-exports.`,
			);
		}
	}
	const inheritance = bindDocumentationReferences(context);
	if (!inheritance.ok) {
		return inheritance;
	}
	const references = validateReferencePolicies(context, inheritance.value);
	if (!references.ok) {
		return references;
	}
	const links = bindDocumentationLinks(context);
	if (!links.ok) {
		return links;
	}
	const dependencyApis = context.dependencies.flatMap((model) => model.apis);
	const dependencies = new Map(dependencyApis.map((api) => [api.id, api.documentation]));
	const standard = new TSDocConfiguration();
	const dependencyContext = createDocumentationContext(
		dependencyApis.map((api) => api.documentation),
		{
			customModifierTags: context.configuration.tagDefinitions
				.filter((tag) => standard.tryGetTagDefinition(tag.tagName) === undefined)
				.map((tag) => tag.tagName),
		},
	);
	if (!dependencyContext.ok) {
		return dependencyContext;
	}
	if (!dependencyContext.value.validation.ok) {
		return dependencyContext.value.validation;
	}
	const resolutionContext = {
		...context,
		items: new Map<string, ParsedDocumentationItem<DocumentationInput>>([
			...context.items,
			...dependencyContext.value.items,
		]),
	};
	const documentation = resolveDocumentation(resolutionContext, inheritance.value, {
		linkValidation: { bindings: links.value, metadata: context.metadata },
		automaticInheritance: automaticMemberBindings(context),
		dependencies,
		packages: new Set([
			context.facts.packageName,
			...context.dependencies.map((model) => model.packageName),
		]),
	});
	if (!documentation.ok) {
		return documentation;
	}

	// Keep the completed data independent of the context's mutable TSDoc nodes and maps.
	return freezeData({
		ok: true,
		value: {
			facts: context.facts,
			dependencies: context.dependencies,
			classification: context.classification,
			documentation: documentation.value.map((resolved) => {
				const dependency = dependencies.get(resolved.id);
				if (dependency !== undefined) {
					return dependency;
				}
				const original = context.items.get(resolved.id);
				assert(original !== undefined, "Resolved documentation must have an original input.");
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
 * Maps confidently selected member sources to the identities of their documentation inputs.
 *
 * @param context - Indexed member and signature comments from the current analysis.
 * @returns Bindings to property or single-signature inputs with original reference contexts.
 */
function automaticMemberBindings(context: AnalysisContext): AutomaticDocumentationBinding[] {
	const inputs = new Map(
		[...context.items.values()].flatMap(({ id, member, signature }) =>
			member !== undefined &&
			member.signatures.length <= 1 &&
			(signature ?? member).documentationContext !== undefined
				? [[member.id, id] as const]
				: [],
		),
	);

	// Source selection already excludes overloads, local comments, and uncertain compatibility.
	return bindAutomaticDocumentationReferences(
		context.facts,
		new Set(context.dependencies.map((model) => model.packageName)),
	).flatMap((binding) => {
		const source = inputs.get(binding.source);
		const target = inputs.get(binding.target);
		return source !== undefined && target !== undefined ? [{ source, target }] : [];
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

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
	type AnalysisDocumentationInput,
} from "./documentationContext.js";
import type { ApiItemId, DocumentationReferenceContext } from "../analysis-types/facts.js";
import {
	bindAutomaticDocumentationReferences,
	bindDocumentationLinks,
	bindDocumentationReferences,
	bindPackageDocumentation,
	resolveDocumentation,
} from "./documentation.js";
import { freezeData } from "../utilities/freezeData.js";
import { DiagnosticCode, reportFailure, type Result } from "../analysis-types/result.js";
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
 * Supported interface, property, and named namespace merges retain combined content and original link origins.
 * Explicit interface and property inheritance includes supported merged receivers and targets.
 * Merged comments deduplicate original contributions, resolve each retained request, then combine content.
 *
 * @param context - Original indexed facts, parsed comments, and classification from one invocation.
 * @returns A completed graph, or documentation diagnostics without partial graph data.
 * @throws If lookup data or bindings violate internal invariants.
 */
export function completeAnalysis(context: AnalysisContext): Result<CompletedAnalysis> {
	const expanded = expandMergedDocumentation(context);
	if (!expanded.ok) {
		return expanded;
	}
	const bindingContext = expanded.value.context;
	for (const item of bindingContext.items.values()) {
		if (
			item.packageName !== context.facts.packageName &&
			(item.originalLinks.length > 0 || item.parsed.docComment.inheritDocTag !== undefined) &&
			!context.dependencies.some((model) => model.packageName === item.packageName)
		) {
			return reportFailure(
				DiagnosticCode.DocumentationUnsupported,
				`API ${item.id}: documentation originated in ${item.packageName}, outside the configured suite. Select its model before resolving references through re-exports.`,
			);
		}
	}
	const inheritance = bindDocumentationReferences(bindingContext);
	if (!inheritance.ok) {
		return inheritance;
	}
	const references = validateReferencePolicies(
		context,
		inheritance.value.map((binding) => ({
			...binding,
			source: expanded.value.owners.get(binding.source) ?? binding.source,
		})),
	);
	if (!references.ok) {
		return references;
	}
	const links = bindDocumentationLinks(bindingContext);
	if (!links.ok) {
		return links;
	}
	const packageDocumentation = bindPackageDocumentation(context);
	if (!packageDocumentation.ok) {
		return packageDocumentation;
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
			...bindingContext.items,
			...dependencyContext.value.items,
		]),
	};
	const documentation = resolveDocumentation(resolutionContext, inheritance.value, {
		linkValidation: { bindings: links.value, metadata: bindingContext.metadata },
		mergedInputs: expanded.value.mergedInputs,
		automaticInheritance: createAutomaticMemberBindings(context),
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
			...(packageDocumentation.value === undefined
				? {}
				: { packageDocumentation: packageDocumentation.value }),
			dependencies: context.dependencies,
			classification: context.classification,
			documentation: documentation.value
				.filter((resolved) => !expanded.value.owners.has(resolved.id))
				.map((resolved) => {
					const dependency = dependencies.get(resolved.id);
					if (dependency !== undefined) {
						return dependency;
					}
					const original = context.items.get(resolved.id);
					assert(
						original !== undefined,
						"Resolved documentation must have an original input.",
					);
					return {
						...resolved,
						links: resolved.links.map((link) => ({
							...link,
							source: expanded.value.owners.get(link.source) ?? link.source,
						})),
						sections:
							resolved.sections?.map((section) => ({
								...section,
								source: expanded.value.owners.get(section.source) ?? section.source,
							})) ?? [],
						inheritedFrom: [
							...new Set(
								resolved.inheritedFrom.filter((id) => !expanded.value.owners.has(id)),
							),
						],
						documented: hasDocumentationContent(original.parsed.docComment),
						originalBlockTags: [...original.originalBlockTags],
					};
				}),
		},
	});
}

/**
 * Creates private resolution inputs for deduplicated merged-comment contributions.
 * Classification remains owned by the original API; temporary identities never enter emitted facts or models.
 *
 * @param context - Original analysis and classification for the invocation.
 * @returns Extended binding context and ordered contribution ownership, or documentation syntax diagnostics.
 */
function expandMergedDocumentation(context: AnalysisContext): Result<{
	readonly context: AnalysisContext;
	readonly mergedInputs: ReadonlyMap<ApiItemId, readonly ApiItemId[]>;
	readonly owners: ReadonlyMap<ApiItemId, ApiItemId>;
}> {
	const inputs: AnalysisDocumentationInput[] = [];
	const owners = new Map<ApiItemId, ApiItemId>();
	const mergedInputs = new Map<ApiItemId, readonly ApiItemId[]>();
	const metadata = new Map(context.metadata);
	for (const item of context.items.values()) {
		if (context.dependencies.some((model) => model.apis.some((api) => api.id === item.id))) {
			continue;
		}
		const original = item.signature ?? item.declaredMember ?? item.member ?? item.declaration;
		const contributions = original.documentationContext?.contributions;
		if (contributions === undefined) {
			continue;
		}
		const ids = contributions.map((contribution, index) => {
			const id = `documentation-contribution:${JSON.stringify([item.id, index])}`;
			assert(
				!context.items.has(id),
				"Contribution identities must not collide with API identities.",
			);
			owners.set(id, item.id);
			const classification = context.metadata.get(item.id);
			assert(
				classification !== undefined,
				"Merged documentation must retain original classification.",
			);
			metadata.set(id, { ...classification, id });
			inputs.push(createContributionInput(item, id, contribution));
			return id;
		});
		mergedInputs.set(item.id, ids);
	}
	const standard = new TSDocConfiguration();
	const parsed = createDocumentationContext(inputs, {
		rules: context.rules,
		customModifierTags: context.configuration.tagDefinitions
			.filter((tag) => standard.tryGetTagDefinition(tag.tagName) === undefined)
			.map((tag) => tag.tagName),
	});
	if (!parsed.ok) {
		return parsed;
	}
	if (!parsed.value.validation.ok) {
		return parsed.value.validation;
	}
	return {
		ok: true,
		value: {
			context: {
				...context,
				metadata,
				items: new Map([...context.items, ...parsed.value.items]),
			},
			mergedInputs,
			owners,
		},
	};
}

/**
 * Associates one original contribution with the owning declaration shape and its private resolution identity.
 * @param item - Original API input whose classification and declaration shape are reused.
 * @param id - Private contribution identity.
 * @param contribution - Original comment and compiler lookup facts.
 * @returns A resolution input without changing original facts.
 */
function createContributionInput(
	item: AnalysisDocumentationInput,
	id: ApiItemId,
	contribution: DocumentationReferenceContext,
): AnalysisDocumentationInput {
	assert(
		item.signature === undefined,
		"Merged comments belong to declarations or properties, not independent callable overloads.",
	);
	const input = {
		...item,
		id,
		documentation: contribution.documentation,
		packageName: contribution.origin.packageName,
	};
	if (item.declaredMember !== undefined) {
		return {
			...input,
			declaredMember: { ...item.declaredMember, id, documentationContext: contribution },
		};
	}
	if (item.member !== undefined) {
		return { ...input, member: { ...item.member, id, documentationContext: contribution } };
	}
	return {
		...input,
		declaration: { ...item.declaration, documentationContext: contribution },
	};
}

/**
 * Maps confidently selected member sources to the identities of their documentation inputs.
 *
 * @param context - Indexed member and signature comments from the current analysis.
 * @returns Bindings to property or single-signature inputs with original reference contexts.
 */
function createAutomaticMemberBindings(
	context: AnalysisContext,
): AutomaticDocumentationBinding[] {
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

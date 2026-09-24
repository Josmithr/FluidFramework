import assert from "node:assert/strict";
import {
	DocBlock,
	DocLinkTag,
	TSDocParser,
	type DocNode,
	type TSDocConfiguration,
} from "@microsoft/tsdoc";
import {
	classifyApiItems,
	validateMergedReleaseLevels,
	validateNamespaceReleases,
	validateReexportReleases,
	type ContainerReleaseContext,
} from "./classification.js";
import type {
	ApiClassification,
	ApiItemDocumentation,
	ApiItemMetadata,
	ClassificationOptions,
	ClassificationRules,
} from "../analysis-types/classification.js";
import type { DocumentationInput } from "../analysis-types/documentation.js";
import type {
	AnalysisFacts,
	ApiItemId,
	DeclarationFact,
	DeclaredMemberFact,
	MemberFact,
	SignatureFact,
} from "../analysis-types/facts.js";
import { DiagnosticCode, reportFailure, type Result } from "../analysis-types/result.js";
import { createTsdocConfiguration } from "./tsdocConfiguration.js";
import type { ReferencePolicies } from "../analysis-types/referencePolicy.js";
import type { DependencyModel } from "../analysis-types/dependencyModel.js";

/**
 * An original input and its parsed comment, with metadata captured before inheritance.
 *
 * @typeParam TInput - The original input record retained by this context.
 */
export type ParsedDocumentationItem<TInput extends ApiItemDocumentation> = TInput & {
	/**
	 * Parser output whose comment nodes may be updated once during resolution.
	 */
	readonly parsed: ReturnType<TSDocParser["parseString"]>;

	/**
	 * Block tag names from the local comment, independent of inherited blocks.
	 */
	readonly originalBlockTags: readonly string[];

	/**
	 * Original API link nodes in traversal order, excluding URL links.
	 */
	readonly originalLinks: readonly DocLinkTag[];
};

/**
 * Parsed comments retained during one extraction, indexed by documentation input identifier.
 *
 * @remarks
 * Contains TSDoc nodes, not compiler objects.
 * Use only with the same facts and modifier vocabulary that produced these comments.
 * Do not retain this map across invocations or serialize it as a model artifact.
 */
export type ExtractedComments = Map<ApiItemId, ReturnType<TSDocParser["parseString"]>>;

/**
 * Documentation owned by one analysis invocation.
 *
 * @remarks
 * Classify and bind original comments before resolving inheritance.
 * Resolution updates the parsed nodes once; it does not change original comment strings or facts.
 * Discard the working context after completion or failure.
 * Its maps and TSDoc nodes are internal mutable state, not frozen data or a portable model.
 *
 * @typeParam TInput - Original records indexed by identifier.
 */
export interface DocumentationContext<
	TInput extends ApiItemDocumentation = DocumentationInput,
> {
	/**
	 * Shared modifier vocabulary. Do not modify it after parsing begins.
	 */
	readonly configuration: TSDocConfiguration;

	/**
	 * A frozen copy of the classification policy for this invocation.
	 */
	readonly rules: ClassificationRules;

	/**
	 * Distinct original inputs and their parsed comments, in input order.
	 */
	readonly items: ReadonlyMap<ApiItemId, ParsedDocumentationItem<TInput>>;

	/**
	 * The first syntax failure in input order, or success when all comments parse without errors.
	 * Classification rule opt-outs do not suppress this result for binding and resolution.
	 */
	readonly validation: Result;
}

/**
 * An original callable or non-callable property comment associated with detached facts.
 */
export interface AnalysisDocumentationInput extends DocumentationInput {
	/**
	 * The immutable declaration that contains this documentation input.
	 */
	readonly declaration: DeclarationFact;

	/**
	 * The effective member that owns this comment or signature.
	 * @defaultValue Omitted for declaration-level inputs and independently retained declared members.
	 */
	readonly member?: MemberFact;

	/**
	 * The original callable signature.
	 * @defaultValue Omitted when the comment belongs to a property, declaration, or independently retained declared member.
	 */
	readonly signature?: SignatureFact;

	/**
	 * An independently documented declaration member outside the effective instance-property view.
	 * @defaultValue Omitted for ordinary effective members and declaration-level inputs.
	 */
	readonly declaredMember?: DeclaredMemberFact;
}

/**
 * One indexed fact set with original classification and invocation-owned parsed documentation.
 */
export interface AnalysisContext extends DocumentationContext<AnalysisDocumentationInput> {
	/**
	 * Validated dependency models selected before compiler extraction; empty when no suite is configured.
	 */
	readonly dependencies: readonly DependencyModel[];

	/**
	 * Configured semantic reference policies, independent of output selection.
	 */
	readonly referencePolicies: ReferencePolicies;

	/**
	 * Immutable compiler facts from this invocation.
	 */
	readonly facts: AnalysisFacts;

	/**
	 * Declaration lookup shared by reference binding and report preparation.
	 */
	readonly declarations: ReadonlyMap<ApiItemId, DeclarationFact>;

	/**
	 * Frozen classification derived from the original comments before inheritance.
	 * Includes declaring-container release inheritance, but not descriptive documentation inheritance.
	 */
	readonly classification: ApiClassification;

	/**
	 * The same classification records indexed for link-policy checks.
	 */
	readonly metadata: ReadonlyMap<ApiItemId, ApiItemMetadata>;
}

/**
 * Original classification settings and optional semantic policies for an analysis context.
 */
export interface AnalysisContextOptions extends ClassificationOptions {
	/**
	 * Reference checks evaluated before documentation completion.
	 * @defaultValue Omitted; analysis uses an empty policy object and skips optional reference checks.
	 */
	readonly referencePolicies?: ReferencePolicies;
}

/**
 * Parses original inputs and validates their identities once for a semantic pipeline.
 *
 * @remarks
 * Copies input records without changing their original comment text.
 * Reuses supplied parsed comments and parses only inputs missing from that map.
 * An absent comment uses an empty TSDoc tree while its original text remains undefined.
 * Captures original links and block tags before resolution can replace inherited sections.
 * Syntax failures are retained in the context so classification can apply its own rule settings.
 *
 * @typeParam TInput - Original input records to index.
 * @param inputs - Original comments with distinct identifiers.
 * @param options - Shared vocabulary and classification rules. Omit for standard tags and enabled classification rules.
 * @param diagnosticCode - Configuration diagnostic category. Omit to use DocumentationConfiguration.
 * @param extractedComments - Parsed comments with the same modifier vocabulary. Omit to parse all inputs here.
 * @returns A request-owned context or invalid-vocabulary diagnostics.
 * @throws If identities are duplicated, an included package name is blank, or parsing fails unexpectedly.
 */
export function createDocumentationContext<TInput extends ApiItemDocumentation>(
	inputs: readonly TInput[],
	options: ClassificationOptions = {},
	diagnosticCode:
		| DiagnosticCode.ClassificationConfiguration
		| DiagnosticCode.DocumentationConfiguration = DiagnosticCode.DocumentationConfiguration,
	extractedComments?: ReadonlyMap<ApiItemId, ReturnType<TSDocParser["parseString"]>>,
): Result<DocumentationContext<TInput>> {
	const configured = createTsdocConfiguration(options, diagnosticCode);
	if (!configured.ok) {
		return configured;
	}
	const parser = new TSDocParser(configured.value);
	const items = new Map<ApiItemId, ParsedDocumentationItem<TInput>>();
	let validation: Result = { ok: true };
	for (const input of inputs) {
		assert(!items.has(input.id), "Documentation inputs must have distinct identities.");
		if ("packageName" in input) {
			assert(
				typeof input.packageName === "string" && input.packageName.trim().length > 0,
				"Documentation inputs must retain non-blank originating package names.",
			);
		}
		const parsed =
			extractedComments?.get(input.id) ?? parser.parseString(input.documentation ?? "/** */");

		// Preserve strict syntax failures even when classification is configured to tolerate them.
		if (validation.ok && parsed.log.messages.length > 0) {
			validation = reportFailure(
				DiagnosticCode.DocumentationTsdoc,
				`Item ${input.id}: correct the TSDoc comment: ${parsed.log.messages.map((message) => message.text).join("; ")}`,
			);
		}
		items.set(input.id, {
			...input,
			parsed,
			originalLinks: collectApiLinkNodes(parsed.docComment),
			originalBlockTags: parsed.docComment
				.getChildNodes()
				.filter((node): node is DocBlock => node instanceof DocBlock)
				.map((block) => block.blockTag.tagName),
		});
	}
	return {
		ok: true,
		value: {
			configuration: configured.value,
			rules: Object.freeze({ ...options.rules }),
			items,
			validation,
		},
	};
}

/**
 * Collects API link nodes in traversal order, excluding URL links.
 *
 * @param node - A comment or one of its descendants.
 * @returns Original parsed nodes, including repeated occurrences.
 */
export function collectApiLinkNodes(node: DocNode): readonly DocLinkTag[] {
	const own = node instanceof DocLinkTag && node.codeDestination !== undefined ? [node] : [];
	return [...own, ...node.getChildNodes().flatMap(collectApiLinkNodes)];
}

/**
 * Collects labels from original parsed documentation without copying inherited labels.
 * @param node - Original comment node.
 * @returns Distinct label names in documentation order.
 */
export function collectDocumentationLabels(node: DocNode): readonly string[] {
	const own =
		"tagName" in node &&
		node.tagName === "@label" &&
		"tagContent" in node &&
		typeof node.tagContent === "string"
			? [node.tagContent.trim()]
			: [];
	return [...new Set([...own, ...node.getChildNodes().flatMap(collectDocumentationLabels)])];
}

/**
 * Indexes immutable facts and prepares supported original declaration and member comments.
 *
 * @remarks
 * Owns declaration and signature identity validation for the downstream pipeline.
 * Builds classification and its lookup index from the same original inputs.
 * Uses signature lookup context for package ownership, or the original declaration when no lookup is needed.
 * Includes effective callable signatures, supported property comments, and separately documented declaration members.
 * Does not copy property comments to signatures.
 * Accepts combined interface, property, and named namespace comments with original-scope lookup results supplied by extraction.
 * Rejects conflicting explicit release tags on merged non-overloaded declarations and members.
 * Applies declaring-container release inheritance and rejects mismatches before reference validation.
 * Untagged parts do not supply an implicit release level; callable overloads remain separate inputs.
 * Heritage comparison views are not separate receiving APIs and are not classified again.
 *
 * @param facts - One extracted fact set.
 * @param options - Shared classification and reference settings. Omit for standard tags, enabled classification rules, and no optional reference checks.
 * @param extractedComments - Parsed comments reused without copying nodes. Omit to parse all inputs during context creation.
 * @param dependencies - Validated dependency models whose metadata is retained for reference checks. Omit for an empty dependency list.
 * @returns The indexed analysis, or diagnostics for invalid configuration, classification, or documentation.
 * @throws If declaration or documentation input identities are duplicated or an original location is missing.
 */
export function createAnalysisContext(
	facts: AnalysisFacts,
	options: AnalysisContextOptions = {},
	extractedComments?: ExtractedComments,
	dependencies: readonly DependencyModel[] = [],
): Result<AnalysisContext> {
	const { declarations, inputs } = indexAnalysisInputs(facts.declarations);
	const parsed = createDocumentationContext(
		inputs,
		options,
		DiagnosticCode.ClassificationConfiguration,
		extractedComments,
	);
	if (!parsed.ok) {
		return parsed;
	}

	// Release consistency is required even for unsupported merges. Validate it before rejecting
	// ambiguous documentation requests so authors receive the actionable tag-conflict diagnostic first.
	const merged = validateMergedReleaseLevels(facts, parsed.value.configuration);
	if (!merged.ok) {
		return merged;
	}
	const mergedReferences = validateUnresolvedMergedComments(facts, parsed.value.configuration);
	if (!mergedReferences.ok) {
		return mergedReferences;
	}
	const containers = collectContainerReleaseContexts(inputs, declarations);
	const classification = classifyApiItems(parsed.value, containers);
	if (!classification.ok) {
		return classification;
	}
	const namespaceReleases = validateNamespaceReleases(
		facts,
		classification.value,
		parsed.value,
	);
	if (!namespaceReleases.ok) {
		return namespaceReleases;
	}
	const reexportReleases = validateReexportReleases(facts, classification.value);
	if (!reexportReleases.ok) {
		return reexportReleases;
	}
	return {
		ok: true,
		value: {
			...parsed.value,
			referencePolicies: options.referencePolicies ?? {},
			facts,
			dependencies,
			declarations,
			classification: classification.value,
			metadata: new Map([
				...classification.value.items.map((item) => [item.id, item] as const),
				...dependencies.flatMap((model) =>
					model.apis.map((api) => [api.id, api.metadata] as const),
				),
			]),
		},
	};
}

/**
 * Indexed declaration facts and the ordered original comments selected for analysis.
 */
interface IndexedAnalysisInputs {
	/**
	 * Original declarations indexed by unique identifier, without copying their contents.
	 */
	readonly declarations: ReadonlyMap<ApiItemId, DeclarationFact>;

	/**
	 * Documentation inputs in declaration order, retaining original fact references.
	 */
	readonly inputs: readonly AnalysisDocumentationInput[];
}

/**
 * Validates declaration identities while collecting the original documentation inputs.
 *
 * @param facts - Declarations in extraction order.
 * @returns A new declaration index and documentation input array without mutating the facts.
 * @throws If declaration identifiers repeat or a callable has no original location.
 */
function indexAnalysisInputs(facts: readonly DeclarationFact[]): IndexedAnalysisInputs {
	const declarations = new Map<ApiItemId, DeclarationFact>();
	const inputs: AnalysisDocumentationInput[] = [];
	for (const declaration of facts) {
		assert(
			!declarations.has(declaration.id),
			"Declaration facts must have distinct identities.",
		);
		declarations.set(declaration.id, declaration);
		inputs.push(...collectDeclarationDocumentationInputs(declaration));
	}
	return { declarations, inputs };
}

/**
 * Collects comments owned by a declaration, its declared members, and its effective members.
 *
 * @remarks
 * Preserves the input order: declared members, the declaration itself, callables, then properties.
 * Property comments remain property inputs instead of being copied to callable signatures.
 *
 * @param declaration - Immutable facts for one declaration and its member views.
 * @returns New input records that retain the original fact objects and comment strings.
 * @throws If a callable has no original declaration location.
 */
function collectDeclarationDocumentationInputs(
	declaration: DeclarationFact,
): AnalysisDocumentationInput[] {
	const inputs: AnalysisDocumentationInput[] = (
		declaration.container?.declaredMembers ?? []
	).map((declaredMember) => ({
		id: declaredMember.id,
		declaration,
		declaredMember,
		documentation: declaredMember.documentation,
		packageName: declaredMember.packageName,
	}));
	if (declaration.documentationContext !== undefined) {
		inputs.push({
			id: declaration.id,
			documentation:
				declaration.documentationContext.documentation ??
				declaration.declarations[0]?.documentation,
			packageName: declaration.documentationContext.origin.packageName,
			declaration,
		});
	}
	inputs.push(...collectCallableDocumentationInputs(declaration));
	for (const member of declaration.members) {
		const source = member.declarations[0];
		if (
			(member.declarations.length !== 1 && member.documentationContext === undefined) ||
			(source?.kind !== "PropertyDeclaration" && source?.kind !== "PropertySignature")
		) {
			continue;
		}
		inputs.push({
			id: member.id,
			documentation: member.documentationContext?.documentation ?? source.documentation,
			packageName: source.packageName,
			declaration,
			member,
		});
	}
	return inputs;
}

/**
 * Collects signature-owned comments without duplicating declaration or property-owned documentation.
 *
 * @param declaration - Declaration and effective members whose call signatures are inspected.
 * @returns Inputs in declaration-signature order followed by effective member-signature order.
 * @throws If neither a signature context nor its original declaration supplies a location.
 */
function collectCallableDocumentationInputs(
	declaration: DeclarationFact,
): AnalysisDocumentationInput[] {
	// Effective signatures have view-specific identities but retain their original comment scope.
	const callables = [
		...(declaration.documentationContext === undefined ||
		declaration.declarations.some((source) => source.kind === "FunctionDeclaration")
			? declaration.signatures.map((signature) => ({ signature, member: undefined }))
			: []),
		...declaration.members.flatMap((member) =>
			member.documentationContext === undefined
				? member.signatures.map((signature) => ({ signature, member }))
				: [],
		),
	];
	return callables.map(({ signature, member }) => {
		const origin =
			signature.documentationContext?.origin ?? (member ?? declaration).declarations[0];
		assert(
			origin !== undefined,
			"Signature facts must retain an original declaration location.",
		);
		return {
			id: signature.id,
			documentation: signature.documentation,
			packageName: origin.packageName,
			declaration,
			signature,
			...(member === undefined ? {} : { member }),
		};
	});
}

/**
 * Indexes original container ownership and diagnostic locations for release classification.
 *
 * @param inputs - Original documentation inputs in collection order.
 * @param declarations - Complete declaration index used to obtain container names.
 * @returns A new ownership map, excluding inputs without a recorded declaring container.
 */
function collectContainerReleaseContexts(
	inputs: readonly AnalysisDocumentationInput[],
	declarations: ReadonlyMap<ApiItemId, DeclarationFact>,
): ReadonlyMap<ApiItemId, ContainerReleaseContext> {
	const containers = new Map<ApiItemId, ContainerReleaseContext>();
	for (const item of inputs) {
		const context = (item.signature ?? item.declaredMember ?? item.member ?? item.declaration)
			.documentationContext;
		if (context?.container !== undefined) {
			const owner = declarations.get(context.container);
			containers.set(item.id, {
				id: context.container,
				name: `${owner?.name ?? context.container}.${item.member?.name ?? item.declaredMember?.kind ?? item.declaration.name}`,
				source: context.origin,
			});
		}
	}
	return containers;
}

/**
 * Rejects malformed comments and unsupported references in merges without extraction contexts.
 *
 * @remarks
 * Checks merged items that do not have a supported documentation context, excluding callable overloads.
 * Distinct descriptions are valid contributions, not conflicts.
 * Malformed comments cannot be combined safely, so this check does not use the general syntax-validation opt-out.
 *
 * @param facts - Detached declarations with each part's original comment retained.
 * @param configuration - Validated modifier vocabulary for this invocation.
 * @returns Success, or the first diagnostic for unsupported references or malformed comments.
 */
function validateUnresolvedMergedComments(
	facts: AnalysisFacts,
	configuration: TSDocConfiguration,
): Result {
	const parser = new TSDocParser(configuration);
	for (const declaration of facts.declarations) {
		for (const item of [declaration, ...declaration.members]) {
			// Extracted contexts retain combined content. Overloads keep separate comments for each signature.
			if (
				item.documentationContext !== undefined ||
				item.declarations.length < 2 ||
				item.declarations.every(
					(source) =>
						source.kind === "FunctionDeclaration" ||
						source.kind === "MethodDeclaration" ||
						source.kind === "MethodSignature",
				)
			) {
				continue;
			}
			const parsedSources = [];
			for (const source of item.declarations) {
				if (source.documentation === undefined) {
					continue;
				}

				// Comparing malformed comments could hide differences, even when general syntax checks are disabled.
				const parsed = parser.parseString(source.documentation);
				if (parsed.log.messages.length > 0) {
					return reportFailure(
						DiagnosticCode.DocumentationTsdoc,
						`Merged API ${declaration.name}/${item.name} at ${source.packageName}/${source.file}:${source.start}: correct the TSDoc comment: ${parsed.log.messages.map((message) => message.text).join("; ")}`,
					);
				}
				parsedSources.push({ source, comment: parsed.docComment });
			}
			for (const { source, comment } of parsedSources) {
				// A missing merged context is not proof that its comments have no references.
				if (comment.inheritDocTag !== undefined || collectApiLinkNodes(comment).length > 0) {
					return reportFailure(
						DiagnosticCode.DocumentationUnsupported,
						`Merged API ${declaration.name}/${item.name} at ${source.packageName}/${source.file}:${source.start}: this declaration form has no supported documentation context. Use a supported declaration form so each original reference can be resolved.`,
					);
				}
			}
		}
	}
	return { ok: true };
}

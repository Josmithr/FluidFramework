import assert from "node:assert/strict";
import {
	DocBlock,
	DocLinkTag,
	TSDocParser,
	type DocNode,
	type TSDocConfiguration,
} from "@microsoft/tsdoc";
import { classifyApiItems } from "./classification.js";
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
import { DiagnosticCode, failure, type Result } from "../analysis-types/result.js";
import { createTsdocConfiguration } from "./tsdocConfiguration.js";
import type { ReferencePolicies } from "../analysis-types/referencePolicy.js";
import type { DependencyModel } from "../analysis-types/dependencyModel.js";

/**
 * An original input and its parsed comment, with metadata captured before inheritance.
 *
 * @typeParam Input - The original input record retained by this context.
 */
export type ParsedDocumentationItem<Input extends ApiItemDocumentation> = Input & {
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
 * @typeParam Input - Original records indexed by identifier.
 */
export interface DocumentationContext<
	Input extends ApiItemDocumentation = DocumentationInput,
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
	readonly items: ReadonlyMap<ApiItemId, ParsedDocumentationItem<Input>>;

	/**
	 * The first syntax failure in input order, or success when all comments parse without errors.
	 * Classification rule opt-outs do not suppress this result for binding and resolution.
	 */
	readonly validation: Result<void>;
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
 * @typeParam Input - Original input records to index.
 * @param inputs - Original comments with distinct identifiers.
 * @param options - Shared vocabulary and classification rules. Omit for standard tags and enabled classification rules.
 * @param diagnosticCode - Configuration diagnostic category. Omit to use DocumentationConfiguration.
 * @param extractedComments - Parsed comments with the same modifier vocabulary. Omit to parse all inputs here.
 * @returns A request-owned context or invalid-vocabulary diagnostics.
 * @throws If identities are duplicated, an included package name is blank, or parsing fails unexpectedly.
 */
export function createDocumentationContext<Input extends ApiItemDocumentation>(
	inputs: readonly Input[],
	options: ClassificationOptions = {},
	diagnosticCode:
		| DiagnosticCode.ClassificationConfiguration
		| DiagnosticCode.DocumentationConfiguration = DiagnosticCode.DocumentationConfiguration,
	extractedComments?: ReadonlyMap<ApiItemId, ReturnType<TSDocParser["parseString"]>>,
): Result<DocumentationContext<Input>> {
	const configured = createTsdocConfiguration(options, diagnosticCode);
	if (!configured.ok) {
		return configured;
	}
	const parser = new TSDocParser(configured.value);
	const items = new Map<ApiItemId, ParsedDocumentationItem<Input>>();
	let validation: Result<void> = { ok: true, value: undefined };
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
			validation = failure(
				DiagnosticCode.DocumentationTsdoc,
				`Item ${input.id}: correct the TSDoc comment: ${parsed.log.messages.map((message) => message.text).join("; ")}`,
			);
		}
		items.set(input.id, {
			...input,
			parsed,
			originalLinks: apiLinkNodes(parsed.docComment),
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
export function apiLinkNodes(node: DocNode): readonly DocLinkTag[] {
	const own = node instanceof DocLinkTag && node.codeDestination !== undefined ? [node] : [];
	return [...own, ...node.getChildNodes().flatMap(apiLinkNodes)];
}

/**
 * Indexes immutable facts and prepares supported original declaration and member comments.
 *
 * @remarks
 * Owns declaration and signature identity validation for the downstream pipeline.
 * Builds classification and its lookup index from the same original inputs.
 * Uses signature lookup context for package ownership, or the original declaration when no lookup is needed.
 * Includes effective callable signatures, single-declaration properties, and separately documented declaration members.
 * Does not merge property and signature comments or choose precedence for merged declarations.
 * Heritage comparison views are not separate receiving APIs and are not classified again.
 *
 * @param facts - One extracted fact set.
 * @param options - Shared classification and reference settings. Omit for standard tags, enabled classification rules, and no optional reference checks.
 * @param extractedComments - Parsed comments reused without copying nodes. Omit to parse all inputs during context creation.
 * @param dependencies - Validated dependency models whose metadata is retained for reference checks. Omit for an empty dependency list.
 * @returns The indexed analysis or configuration and classification diagnostics.
 * @throws If declaration or documentation input identities are duplicated or an original location is missing.
 */
export function createAnalysisContext(
	facts: AnalysisFacts,
	options: AnalysisContextOptions = {},
	extractedComments?: ExtractedComments,
	dependencies: readonly DependencyModel[] = [],
): Result<AnalysisContext> {
	const declarations = new Map<ApiItemId, DeclarationFact>();
	const inputs: AnalysisDocumentationInput[] = [];
	for (const declaration of facts.declarations) {
		assert(
			!declarations.has(declaration.id),
			"Declaration facts must have distinct identities.",
		);
		declarations.set(declaration.id, declaration);
		for (const declaredMember of declaration.container?.declaredMembers ?? []) {
			inputs.push({
				id: declaredMember.id,
				declaration,
				declaredMember,
				documentation: declaredMember.documentation,
				packageName: declaredMember.packageName,
			});
		}
		if (declaration.documentationContext !== undefined) {
			inputs.push({
				id: declaration.id,
				documentation: declaration.declarations[0]?.documentation,
				packageName: declaration.documentationContext.origin.packageName,
				declaration,
			});
		}

		// Effective signatures have view-specific identities but retain their original comment scope.
		const callables = [
			...(declaration.documentationContext === undefined
				? declaration.signatures.map((signature) => ({ signature, member: undefined }))
				: []),
			...declaration.members.flatMap((member) =>
				member.documentationContext === undefined
					? member.signatures.map((signature) => ({ signature, member }))
					: [],
			),
		];
		for (const { signature, member } of callables) {
			const origin =
				signature.documentationContext?.origin ?? (member ?? declaration).declarations[0];
			assert(
				origin !== undefined,
				"Signature facts must retain an original declaration location.",
			);
			inputs.push({
				id: signature.id,
				documentation: signature.documentation,
				packageName: origin.packageName,
				declaration,
				signature,
				...(member === undefined ? {} : { member }),
			});
		}
		for (const member of declaration.members) {
			const source = member.declarations[0];
			if (
				member.declarations.length !== 1 ||
				(source?.kind !== "PropertyDeclaration" && source?.kind !== "PropertySignature")
			) {
				continue;
			}
			inputs.push({
				id: member.id,
				documentation: source.documentation,
				packageName: source.packageName,
				declaration,
				member,
			});
		}
	}
	const parsed = createDocumentationContext(
		inputs,
		options,
		DiagnosticCode.ClassificationConfiguration,
		extractedComments,
	);
	if (!parsed.ok) {
		return parsed;
	}
	const classification = classifyApiItems(parsed.value);
	return classification.ok
		? {
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
			}
		: classification;
}

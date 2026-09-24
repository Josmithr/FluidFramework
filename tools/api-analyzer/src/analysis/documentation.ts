import type {
	DocumentationInput,
	DocumentationReferenceBinding,
	AutomaticDocumentationBinding,
	DocumentationLinkBinding,
	DocumentationResolutionOptions,
	ResolvedDocumentation,
	DocumentationSectionSource,
} from "../analysis-types/documentation.js";
import assert from "node:assert/strict";
import { mergeDocumentationComments } from "./mergedDocumentation.js";
import {
	type DocLinkTag,
	SelectorKind,
	type DocComment,
	type DocNode,
	DocParamBlock,
	TSDocParser,
	type DocDeclarationReference,
} from "@microsoft/tsdoc";
import { ReleaseLevel, type ApiItemMetadata } from "../analysis-types/classification.js";
import type {
	AnalysisFacts,
	ApiItemId,
	MemberFact,
	DeclarationFact,
	SignatureFact,
	SignatureDocumentationContext,
	DocumentationReferenceContext,
	DocumentationReferenceLookup,
} from "../analysis-types/facts.js";
import { DiagnosticCode, reportFailure, type Result } from "../analysis-types/result.js";
import { freezeData } from "../utilities/freezeData.js";
import { assertDefined } from "../utilities/assertDefined.js";
import { resolveDependencyReference } from "./dependencyReferences.js";
import type { DependencyApi } from "../analysis-types/dependencyModel.js";
import type { CompletedPackageDocumentation } from "../analysis-types/completedGraph.js";
import {
	collectApiLinkNodes,
	collectDocumentationLabels,
	type AnalysisContext,
	type DocumentationContext,
	type ParsedDocumentationItem,
	type AnalysisDocumentationInput,
} from "./documentationContext.js";

/**
 * Associates explicit documentation inheritance requests with target documentation identifiers.
 *
 * @remarks
 * Internal operation. Not exported from the package entrypoint.
 * Uses compiler lookup facts that contain no compiler objects.
 * Supports unqualified names, such as `base`, export aliases, and namespace or instance method paths.
 * The compiler resolves names in the original declaration scope, including imported aliases.
 *
 * Callable sources include effective method signatures; targets are functions or methods.
 * Non-callable declarations can inherit from their own supported category, including merged contexts.
 * Generic declaration type-parameter names and order must match. Numeric selectors apply only to callable documentation.
 * Targets can belong to the same original package or to selected dependency models.
 * Numeric method references use a terminal selector, such as `Base.(method:2)`.
 * Static and instance member paths are supported. Colliding names require an explicit side selector.
 * Numeric selectors choose a callable overload by its one-based declaration order.
 * Without a selector, the target must have exactly one callable signature. No overload is inferred.
 * Parameter names, order, and count must match.
 * Optional parameter flags, rest parameter flags, and type-parameter names must also match.
 * The function rejects destructured parameters because they require documentation changes.
 * These checks do not establish TypeScript assignability.
 * The function does not compare parameter types, return types, generic constraints, or generic defaults.
 *
 * Uses the context's parsed original comments, shared indexes, and syntax validation result.
 * Run this operation before content resolution updates the parsed comments.
 * Unsupported references, ambiguous overloads, and incompatible parameters produce diagnostics.
 * The function does not query the compiler, change the facts, or copy inherited content.
 *
 * @param analysis - The indexed analysis with original parsed comments and compiler lookup results.
 * @returns Deeply frozen bindings sorted by source documentation identifier, or diagnostics without partial bindings.
 * @throws If required lookup data is missing or inconsistent, or an unexpected processing error occurs.
 */
export function bindDocumentationReferences(
	analysis: AnalysisContext,
): Result<readonly DocumentationReferenceBinding[]> {
	const { declarations, validation } = analysis;
	if (!validation.ok) {
		return validation;
	}
	const bindings: DocumentationReferenceBinding[] = [];
	for (const {
		id,
		declaration,
		member,
		declaredMember,
		signature,
		parsed,
	} of analysis.items.values()) {
		if (analysis.dependencies.some((model) => model.apis.some((api) => api.id === id))) {
			continue;
		}
		const request = parsed.docComment.inheritDocTag;
		if (request === undefined) {
			continue;
		}

		const sources =
			declaredMember === undefined ? (member ?? declaration).declarations : [declaredMember];
		if (
			sources.length === 0 ||
			sources.some(
				(source) =>
					source.kind !== "FunctionDeclaration" &&
					source.kind !== "MethodDeclaration" &&
					source.kind !== "MethodSignature" &&
					!(
						signature === undefined &&
						(source.kind === "PropertyDeclaration" ||
							source.kind === "PropertySignature" ||
							[
								"InterfaceDeclaration",
								"ClassDeclaration",
								"TypeAliasDeclaration",
								"VariableDeclaration",
								"EnumDeclaration",
								"ModuleDeclaration",
								"NamespaceExport",
							].includes(source.kind))
					),
			)
		) {
			return reportFailure(
				DiagnosticCode.DocumentationUnsupported,
				`Item ${id}: @inheritDoc requires a supported declaration or callable documentation context. Supply local documentation for this declaration.`,
			);
		}
		const context = assertDefined(
			(signature ?? declaredMember ?? member ?? declaration).documentationContext,
			"Supported inheritance sources must retain documentation context.",
		);
		const lookup = assertDefined(
			context.inheritance,
			"Inheritance requests must retain compiler lookup facts.",
		);
		const origin = lookup.origin ?? context.origin;
		assert.equal(
			lookup.reference,
			request.declarationReference?.emitAsTsdoc() ?? "",
			"Inheritance lookup facts must match the original comment.",
		);
		const sourceShape = getNonCallableDocumentationShape(
			sources.map((source) => source.kind),
			context.typeParameters,
		);
		if (
			signature === undefined &&
			request.declarationReference?.memberReferences.some(
				(part) => part.selector?.selectorKind === SelectorKind.Index,
			) === true
		) {
			return reportFailure(
				DiagnosticCode.DocumentationReference,
				`Item ${id}: interface and property inheritance do not accept overload selectors.`,
			);
		}
		const dependency = resolveDependencyReference(
			analysis,
			request.declarationReference,
			lookup,
			origin.packageName,
			signature !== undefined,
		);
		if (!dependency.ok) {
			return dependency;
		}
		if (dependency.value !== undefined) {
			const compatible = bindDependencyInheritance(
				id,
				lookup.reference,
				signature,
				sourceShape,
				dependency.value,
			);
			if (!compatible.ok) {
				return compatible;
			}
			bindings.push(compatible.value);
			continue;
		}
		if (lookup.status === "unsupported") {
			return reportFailure(
				DiagnosticCode.DocumentationUnsupported,
				`Item ${id}: unsupported @inheritDoc reference "${lookup.reference}". Reference a supported function, method, interface, or property in the original package or selected suite, for example {@inheritDoc base} or {@inheritDoc Base.method}. To select a callable overload, use {@inheritDoc (base:2)} or {@inheritDoc Base.(method:2)}. Otherwise, replace @inheritDoc with local documentation.`,
			);
		}
		if (lookup.status === "not-found") {
			return reportFailure(
				DiagnosticCode.DocumentationReference,
				`Item ${id}: target ${lookup.reference} was not found in ${origin.packageName}/${origin.file}. Correct the reference.`,
			);
		}
		const target = declarations.get(lookup.target);
		assert(
			target !== undefined,
			"Documentation lookup targets must be retained in declaration facts.",
		);
		if (signature === undefined) {
			const targetContext = target.documentationContext;
			if (targetContext === undefined) {
				return reportFailure(
					DiagnosticCode.DocumentationUnsupported,
					`Item ${id}: target ${lookup.reference} has no supported documentation context.`,
				);
			}
			const selector = request.declarationReference?.memberReferences.at(-1)?.selector;
			if (
				(selector?.selectorKind === SelectorKind.Label &&
					targetContext.labels?.includes(selector.selector) !== true) ||
				selector?.selector === "constructor"
			) {
				return reportFailure(
					DiagnosticCode.DocumentationReference,
					`Item ${id}: selector ${selector.selector} does not identify compatible declaration documentation on ${lookup.reference}.`,
				);
			}
			const targetShape = getNonCallableDocumentationShape(
				target.declarations.map((source) => source.kind),
				targetContext.typeParameters,
			);
			const compatible = validateNonCallableInheritance(
				id,
				lookup.reference,
				sourceShape,
				targetShape?.kind === "property" && target.signatures.length > 0
					? undefined
					: targetShape,
			);
			if (!compatible.ok) {
				return compatible;
			}
			if (targetContext.origin.packageName !== origin.packageName) {
				return reportFailure(
					DiagnosticCode.DocumentationUnsupported,
					`Item ${id}: cross-package declaration inheritance requires suite resolution.`,
				);
			}
			bindings.push({ source: id, reference: lookup.reference, target: target.id });
			continue;
		}
		const callable = bindCallableInheritance(
			signature,
			target,
			request.declarationReference,
			lookup.reference,
		);
		if (!callable.ok) {
			return callable;
		}
		bindings.push(callable.value);
	}
	return freezeData({
		ok: true,
		value: bindings.sort((left, right) =>
			left.source < right.source ? -1 : left.source > right.source ? 1 : 0,
		),
	});
}

/**
 * Binds a selected dependency target after validating callable or non-callable documentation shapes.
 *
 * @param id - Receiving documentation input identity.
 * @param reference - Original target reference text for diagnostics and the binding.
 * @param signature - Receiving callable facts, or undefined for declaration-owned comments.
 * @param sourceShape - Receiving non-callable shape, or undefined for callables or unsupported forms.
 * @param target - Selected dependency API with validated model facts.
 * @returns A binding, or a documentation-kind or parameter mismatch diagnostic.
 */
function bindDependencyInheritance(
	id: ApiItemId,
	reference: string,
	signature: SignatureFact | undefined,
	sourceShape: NonCallableDocumentationShape | undefined,
	target: DependencyApi,
): Result<DocumentationReferenceBinding> {
	if (signature === undefined) {
		const compatible = validateNonCallableInheritance(
			id,
			reference,
			sourceShape,
			target.parameters === undefined
				? getNonCallableDocumentationShape([target.kind], target.typeParameters)
				: undefined,
		);
		if (!compatible.ok) {
			return compatible;
		}
	} else {
		const parameters = assertDefined(
			signature.documentationContext,
			"Supported inheritance sources must retain documentation context.",
		);
		if (
			parameters.parameters.length !== target.parameters?.length ||
			parameters.parameters.some(
				(parameter, index) =>
					parameter.name === undefined ||
					parameter.name !== target.parameters?.[index]?.name ||
					parameter.optional !== target.parameters?.[index]?.optional ||
					parameter.rest !== target.parameters?.[index]?.rest,
			) ||
			JSON.stringify(parameters.typeParameters) !== JSON.stringify(target.typeParameters)
		) {
			return reportFailure(
				DiagnosticCode.DocumentationReference,
				`Item ${id}: parameter documentation does not match dependency target ${reference}. Supply local documentation.`,
			);
		}
	}
	return { ok: true, value: { source: id, reference, target: target.id } };
}

/**
 * Documentation shape used to validate non-callable inheritance without printed-type parsing.
 */
interface NonCallableDocumentationShape {
	/**
	 * Supported declaration category; distinct categories do not exchange documentation.
	 */
	readonly kind:
		| "InterfaceDeclaration"
		| "ClassDeclaration"
		| "TypeAliasDeclaration"
		| "VariableDeclaration"
		| "EnumDeclaration"
		| "ModuleDeclaration"
		| "property";

	/**
	 * Original type-parameter names, or an empty array for non-generic declaration categories.
	 */
	readonly typeParameters: readonly string[];
}

/**
 * Identifies supported non-callable shapes from original declaration kinds and parameter facts.
 *
 * @param kinds - Syntax kinds of every original declaration part.
 * @param typeParameters - Retained generic declaration parameter names; undefined means no supported generic shape.
 * @returns The supported shape, or undefined for missing or unsupported declaration facts.
 */
function getNonCallableDocumentationShape(
	kinds: readonly string[],
	typeParameters: readonly string[] | undefined,
): NonCallableDocumentationShape | undefined {
	if (kinds.length === 0) {
		return undefined;
	}
	const kind = kinds[0];
	if (kinds.every((part) => part === "ModuleDeclaration" || part === "NamespaceExport")) {
		return { kind: "ModuleDeclaration", typeParameters: [] };
	}
	if (
		(kind === "InterfaceDeclaration" ||
			kind === "ClassDeclaration" ||
			kind === "TypeAliasDeclaration") &&
		kinds.every((part) => part === kind)
	) {
		return typeParameters === undefined ? undefined : { kind, typeParameters };
	}
	if (
		(kind === "VariableDeclaration" ||
			kind === "EnumDeclaration" ||
			kind === "ModuleDeclaration") &&
		kinds.every((part) => part === kind)
	) {
		return { kind, typeParameters: [] };
	}
	return kinds.every((part) => part === "PropertyDeclaration" || part === "PropertySignature")
		? { kind: "property", typeParameters: [] }
		: undefined;
}

/**
 * Checks local and dependency non-callable inheritance using the same documentation shape rules.
 *
 * @param id - Receiving documentation input identity for diagnostics.
 * @param reference - Original target reference text.
 * @param source - Receiving shape; undefined means the source is unsupported.
 * @param target - Target shape; undefined means the target is unsupported or callable.
 * @returns Success, or a declaration-kind or type-parameter mismatch diagnostic.
 */
function validateNonCallableInheritance(
	id: ApiItemId,
	reference: string,
	source: NonCallableDocumentationShape | undefined,
	target: NonCallableDocumentationShape | undefined,
): Result {
	if (source === undefined || source.kind !== target?.kind) {
		return reportFailure(
			DiagnosticCode.DocumentationUnsupported,
			`Item ${id}: target ${reference} must have the same supported declaration kind as the receiver.`,
		);
	}
	if (
		source.typeParameters.length !== target.typeParameters.length ||
		source.typeParameters.some((name, index) => name !== target.typeParameters[index])
	) {
		return reportFailure(
			DiagnosticCode.DocumentationReference,
			`Item ${id}: type parameters do not match ${reference}. Supply local documentation; parameter adaptation is not supported.`,
		);
	}
	return { ok: true };
}

/**
 * Selects and validates an explicit same-package callable inheritance target.
 * @param signature - Receiving callable signature with original lookup context.
 * @param target - Compiler-resolved target declaration.
 * @param reference - Parsed target reference; undefined means no selector was supplied.
 * @param referenceText - Original reference text used in bindings and diagnostics.
 * @returns A validated binding or a target, selector, package, or parameter diagnostic.
 */
function bindCallableInheritance(
	signature: SignatureFact,
	target: DeclarationFact,
	reference: DocDeclarationReference | undefined,
	referenceText: string,
): Result<DocumentationReferenceBinding> {
	const sourceContext = assertDefined(
		signature.documentationContext,
		"Supported inheritance sources must retain documentation context.",
	);
	const selected = selectCallableOverload(signature.id, target, reference, referenceText);
	if (!selected.ok) {
		return selected;
	}
	const targetContext = assertDefined(
		selected.value.documentationContext,
		"Supported inheritance targets must retain documentation context.",
	);
	if (targetContext.origin.packageName !== sourceContext.origin.packageName) {
		return reportFailure(
			DiagnosticCode.DocumentationUnsupported,
			`Item ${signature.id}: target ${referenceText} requires same-package callable facts or a selected dependency model. Select and build the target package's model for cross-package inheritance.`,
		);
	}
	if (!haveMatchingDocumentationParameters(sourceContext, targetContext)) {
		return reportFailure(
			DiagnosticCode.DocumentationReference,
			`Item ${signature.id}: parameters or type parameters do not match ${referenceText}. Supply local documentation; parameter adaptation is not supported yet.`,
		);
	}
	return {
		ok: true,
		value: { source: signature.id, reference: referenceText, target: selected.value.id },
	};
}

/**
 * Selects a callable by explicit one-based ordinal, never by inferred overload similarity.
 * @param source - Receiving signature identity for diagnostics.
 * @param target - Original target declaration and callable signatures in compiler order.
 * @param reference - Parsed reference; absent numeric selectors require an unambiguous single-signature target. Member-side selectors are handled during lookup.
 * @param referenceText - Original text used in diagnostics.
 * @returns Selected signature or a target-form, selector-kind, or range diagnostic.
 */
function selectCallableOverload(
	source: ApiItemId,
	target: DeclarationFact,
	reference: DocDeclarationReference | undefined,
	referenceText: string,
): Result<SignatureFact> {
	if (
		target.declarations.length === 0 ||
		target.signatures.length === 0 ||
		target.declarations.some(
			(declaration) =>
				declaration.kind !== "FunctionDeclaration" &&
				declaration.kind !== "MethodDeclaration" &&
				declaration.kind !== "MethodSignature" &&
				declaration.kind !== "ModuleDeclaration",
		)
	) {
		return reportFailure(
			DiagnosticCode.DocumentationUnsupported,
			`Item ${source}: target ${referenceText} must be a function or method.`,
		);
	}
	const terminal = reference?.memberReferences.at(-1)?.selector;
	if (terminal?.selectorKind === SelectorKind.Label) {
		const matches = target.signatures.filter((candidate) =>
			(
				candidate.documentationContext?.labels ??
				collectDocumentationLabels(
					new TSDocParser().parseString(candidate.documentation ?? "/** */").docComment,
				)
			).includes(terminal.selector),
		);
		return matches.length === 1
			? { ok: true, value: assertDefined(matches[0]) }
			: reportFailure(
					DiagnosticCode.DocumentationReference,
					`Item ${source}: label ${terminal.selector} identifies ${matches.length} callable signatures on ${referenceText}.`,
				);
	}
	const selector = terminal?.selectorKind === SelectorKind.Index ? terminal : undefined;
	if (
		terminal !== undefined &&
		terminal.selectorKind !== SelectorKind.Index &&
		!(
			terminal.selectorKind === SelectorKind.System &&
			["static", "instance", "function"].includes(terminal.selector)
		)
	) {
		return reportFailure(
			DiagnosticCode.DocumentationUnsupported,
			`Item ${source}: use a numeric overload selector.`,
		);
	}
	if (selector === undefined && target.signatures.length !== 1) {
		return reportFailure(
			DiagnosticCode.DocumentationReference,
			`Item ${source}: target ${referenceText} has ${target.signatures.length} callable signatures. Supply a one-based numeric selector such as (foo:1), or local documentation.`,
		);
	}
	const ordinal = selector === undefined ? 1 : Number(selector.selector);
	if (!Number.isSafeInteger(ordinal) || ordinal < 1 || ordinal > target.signatures.length) {
		return reportFailure(
			DiagnosticCode.DocumentationReference,
			`Item ${source}: overload selector ${selector?.selector} is outside the callable signature range 1..${target.signatures.length} for ${referenceText}.`,
		);
	}
	const signature = target.signatures[ordinal - 1];
	assert(signature !== undefined, "Validated overload selectors must identify a signature.");
	return { ok: true, value: signature };
}

/**
 * Checks whether parameter documentation can be copied without renaming or adapting it.
 * @param source - Original receiving callable parameter facts.
 * @param target - Original selected target parameter facts.
 * @returns Whether names, ordering, optional/rest flags, and type-parameter names match.
 */
function haveMatchingDocumentationParameters(
	source: SignatureDocumentationContext,
	target: SignatureDocumentationContext,
): boolean {
	// This checks documentation shape only; compiler type compatibility is a separate concern.
	return (
		!source.parameters.some((parameter) => parameter.name === undefined) &&
		!target.parameters.some((parameter) => parameter.name === undefined) &&
		source.parameters.length === target.parameters.length &&
		source.parameters.every((parameter, index) => {
			const other = target.parameters[index];
			return (
				other !== undefined &&
				parameter.name === other.name &&
				parameter.optional === other.optional &&
				parameter.rest === other.rest
			);
		}) &&
		source.typeParameters.length === target.typeParameters.length &&
		source.typeParameters.every((name, index) => name === target.typeParameters[index])
	);
}

/**
 * Selects unique automatic documentation sources from detached compiler compatibility facts.
 *
 * @remarks
 * Internal operation. Requires single-declaration members and same-package original sources.
 * Any local comment, overloaded candidate, or unproven same-name relationship suppresses inheritance.
 * Multiple paths to the same original source are one candidate; distinct sources are ambiguous.
 * No class or interface source wins an ambiguous choice by traversal order.
 * Original member identifiers permit resolution through base classes and implemented contracts.
 *
 * @param facts - Detached facts with compiler-checked heritage documentation matches.
 * @param packages - Authorized dependency packages. Omit for same-package automatic inheritance only.
 * @returns Frozen automatic bindings, sorted by receiving member identifier.
 */
export function bindAutomaticDocumentationReferences(
	facts: AnalysisFacts,
	packages: ReadonlySet<string> = new Set(),
): readonly AutomaticDocumentationBinding[] {
	// TODO (Future automatic matching): Extend automatic matching to merged members and accessors
	// only when the compiler establishes an unambiguous source and compatible documentation shape.
	const declarations = new Map(facts.declarations.map((entry) => [entry.id, entry]));
	const bindings: AutomaticDocumentationBinding[] = [];
	for (const declaration of facts.declarations) {
		for (const member of declaration.members) {
			if (
				member.declarations.length !== 1 ||
				member.signatures.length > 1 ||
				member.declarations[0]?.documentation !== undefined
			) {
				continue;
			}
			const candidates = new Map<string, MemberFact>();
			let uncertain = false;
			for (const view of declaration.heritage) {
				const candidate = view.members.find((entry) => entry.name === member.name);
				if (!candidate) {
					continue;
				}
				const original = declarations
					.get(view.target)
					?.members.find((entry) => entry.name === member.name);
				if (
					!original ||
					candidate.declarations.length !== 1 ||
					candidate.signatures.length > 1 ||
					original.declarations.length !== 1 ||
					original.signatures.length > 1 ||
					!view.documentationMatches.some(
						(match) => match.source === member.id && match.target === candidate.id,
					) ||
					(candidate.declarations[0]?.packageName !== member.declarations[0]?.packageName &&
						!packages.has(candidate.declarations[0]?.packageName ?? ""))
				) {
					uncertain = true;
					break;
				}
				const key = getMemberSourceKey(candidate);
				if (getMemberSourceKey(original) !== key) {
					uncertain = true;
					break;
				}
				const previous = candidates.get(key);
				if (!previous || original.id < previous.id) {
					candidates.set(key, original);
				}
			}
			if (!uncertain && candidates.size === 1) {
				const candidate = [...candidates.values()][0];
				assert(candidate !== undefined);
				if (candidate.id !== member.id) {
					bindings.push({ source: member.id, target: candidate.id });
				}
			}
		}
	}
	return freezeData(
		bindings.sort((left, right) =>
			left.source < right.source ? -1 : left.source > right.source ? 1 : 0,
		),
	);
}

/**
 * Identifies a member's original source declarations independently of its instantiated view.
 *
 * @param member - A detached member with original source records.
 * @returns An operation-local source identity, not a portable API identifier.
 */
function getMemberSourceKey(member: MemberFact): string {
	return JSON.stringify(
		member.declarations.map((entry) => [
			entry.packageName,
			entry.file,
			entry.start,
			entry.kind,
		]),
	);
}

/**
 * Binds and validates API links in original function, method, and non-callable property comments.
 *
 * @remarks
 * Internal operation. Should not be exported from the package entrypoint.
 * Uses the context's original classification, parsed link nodes, and compiler lookup results.
 * Does not reparse comments or recompute classification.
 * Run this operation before content resolution updates the parsed comments.
 * Targets can be supported declarations or callable signatures in the original package or selected dependency models.
 * Overloaded callables require a one-based numeric selector; non-callable targets reject numeric selectors.
 * Parameter compatibility is not required for links.
 * Public, beta, and alpha sources can link to each other, but cannot link to internal targets.
 * Internal sources can link to any release level. Missing release levels produce diagnostics.
 * Repeated links retain separate indices. URL links require no lookup or network access.
 * This operation does not resolve inherited content or change report behavior.
 *
 * @param analysis - The indexed analysis, including unselected link targets and their original metadata.
 * @returns Deeply frozen bindings sorted by source identifier and link index, or diagnostics without partial bindings.
 * @throws If required lookup data or metadata is missing or inconsistent, or an unexpected processing error occurs.
 */
export function bindDocumentationLinks(
	analysis: AnalysisContext,
): Result<readonly DocumentationLinkBinding[]> {
	const { metadata, validation } = analysis;
	if (!validation.ok) {
		return validation;
	}
	const bindings: DocumentationLinkBinding[] = [];
	for (const item of analysis.items.values()) {
		if (analysis.dependencies.some((model) => model.apis.some((api) => api.id === item.id))) {
			continue;
		}
		const sourceContext = validateLinkSource(item);
		if (!sourceContext.ok) {
			return sourceContext;
		}
		const context = sourceContext.value;
		if (context === undefined) {
			continue;
		}
		for (const [linkIndex, lookup] of context.links.entries()) {
			const origin = lookup.origin ?? context.origin;
			const dependency = resolveDependencyReference(
				analysis,
				item.originalLinks[linkIndex]?.codeDestination,
				lookup,
				origin.packageName,
			);
			if (!dependency.ok) {
				return dependency;
			}
			if (dependency.value !== undefined) {
				const dependencyTarget = dependency.value;
				const receivingLevel = metadata.get(item.id)?.releaseLevel;
				if (
					receivingLevel === undefined ||
					dependencyTarget.metadata.releaseLevel === undefined
				) {
					return reportFailure(
						DiagnosticCode.DocumentationConfiguration,
						`Item ${item.id}: dependency links require release tags on source and target ${lookup.reference}.`,
					);
				}
				if (
					receivingLevel !== ReleaseLevel.Internal &&
					dependencyTarget.metadata.releaseLevel === ReleaseLevel.Internal
				) {
					return reportFailure(
						DiagnosticCode.DocumentationLinkPolicy,
						`Item ${item.id}: non-internal APIs cannot link to internal dependency target ${lookup.reference}.`,
					);
				}
				bindings.push({
					source: item.id,
					linkIndex,
					reference: lookup.reference,
					target: dependencyTarget.declarationId,
					targetSignature: dependencyTarget.id,
					origin,
				});
				continue;
			}
			const local = bindLocalLink(
				analysis,
				item.id,
				{ ...context, origin },
				lookup,
				linkIndex,
				item.originalLinks[linkIndex]?.codeDestination,
			);
			if (!local.ok) {
				return local;
			}
			bindings.push(local.value);
		}
	}
	return freezeData({
		ok: true,
		value: bindings.sort((left, right) =>
			left.source < right.source
				? -1
				: left.source > right.source
					? 1
					: left.linkIndex - right.linkIndex,
		),
	});
}

/**
 * Checks that a supported source comment still corresponds to its retained lookup occurrences.
 * @param item - Original parsed input with detached source records.
 * @returns Its original context, undefined when no context or links exist, or an unsupported-source diagnostic.
 * @throws If supported sources lack context or recorded links do not match the parsed comment.
 */
function validateLinkSource(
	item: ParsedDocumentationItem<AnalysisDocumentationInput>,
): Result<DocumentationReferenceContext | undefined> {
	const { declaration, member, declaredMember, originalLinks } = item;
	const source = item.signature ?? declaredMember ?? member ?? declaration;
	const references = originalLinks.map((node) => node.codeDestination?.emitAsTsdoc());
	const context = source.documentationContext;
	if (context === undefined && references.length === 0) {
		return { ok: true, value: undefined };
	}
	const sources =
		declaredMember === undefined ? (member ?? declaration).declarations : [declaredMember];
	if (
		references.length > 0 &&
		declaredMember === undefined &&
		declaration.documentationContext === undefined &&
		(sources.length === 0 ||
			sources.some(
				(record) =>
					record.kind !== "FunctionDeclaration" &&
					record.kind !== "MethodDeclaration" &&
					record.kind !== "MethodSignature" &&
					!(
						item.signature === undefined &&
						sources.length === 1 &&
						(record.kind === "PropertyDeclaration" || record.kind === "PropertySignature")
					),
			))
	) {
		return reportFailure(
			DiagnosticCode.DocumentationUnsupported,
			`Item ${source.id}: API links are supported only in function, method, and single-declaration non-callable property comments. Use plain text for this declaration.`,
		);
	}
	assert(
		context !== undefined,
		"Supported API link sources must retain documentation context.",
	);
	assert.equal(
		references.length,
		context.links.length,
		"API link lookup counts must match the original comment.",
	);
	assert(
		references.every(
			(reference, index) => reference === assertDefined(context.links[index]).reference,
		),
		"API link lookup references must match the original comment.",
	);
	return { ok: true, value: context };
}

/**
 * Binds one local API link after the source occurrence has been validated.
 * @param analysis - Detached declarations and original metadata.
 * @param source - Receiving documentation input identity.
 * @param context - Source lookup facts and original package location.
 * @param lookup - Retained compiler lookup outcome for this occurrence.
 * @param linkIndex - Original occurrence index in TSDoc traversal order.
 * @param reference - Parsed link reference; undefined means no explicit selector is available.
 * @param packageLevel - Explicit visibility baseline for package comments. Omit to use the source API's classification.
 * @returns A binding or the first lookup, target-form, package, or visibility diagnostic.
 */
function bindLocalLink(
	analysis: AnalysisContext,
	source: ApiItemId,
	context: DocumentationReferenceContext,
	lookup: DocumentationReferenceLookup,
	linkIndex: number,
	reference: DocDeclarationReference | undefined,
	packageLevel?: ReleaseLevel,
): Result<DocumentationLinkBinding> {
	if (lookup.status === "unsupported") {
		return reportFailure(
			DiagnosticCode.DocumentationUnsupported,
			`Item ${source}: unsupported or ambiguous API link ${lookup.reference}. Use a named path with declaration-kind or static/instance selectors, or a numeric callable selector. Qualified dependency paths require a selected model.`,
		);
	}
	if (lookup.status === "not-found") {
		return reportFailure(
			DiagnosticCode.DocumentationReference,
			`Item ${source}: target ${lookup.reference} was not found in ${context.origin.packageName}/${context.origin.file}. Correct the API link.`,
		);
	}
	const target = analysis.declarations.get(lookup.target);
	assert(
		target !== undefined,
		"Documentation lookup targets must be retained in declaration facts.",
	);

	const selected = selectLinkTarget(source, target, reference, lookup.reference);
	if (!selected.ok) {
		return selected;
	}
	const targetSignature = selected.value;
	const targetContext = assertDefined(
		targetSignature.documentationContext,
		"Supported API link targets must retain documentation context.",
	);
	if (
		targetContext.origin.packageName !== context.origin.packageName ||
		target.declarations.some((record) => record.packageName !== context.origin.packageName)
	) {
		return reportFailure(
			DiagnosticCode.DocumentationUnsupported,
			`Item ${source}: target ${lookup.reference} is outside the original package ${context.origin.packageName}. Select and build its dependency model before resolving the link.`,
		);
	}

	// Link visibility uses original metadata, independently of whether the target appears in a report.
	const sourceLevel =
		packageLevel ??
		assertDefined(
			analysis.metadata.get(source),
			"API link sources must have original classification metadata.",
		).releaseLevel;
	const targetLevel = assertDefined(
		analysis.metadata.get(targetSignature.id),
		"API link targets must have original classification metadata.",
	).releaseLevel;
	if (sourceLevel === undefined || targetLevel === undefined) {
		return reportFailure(
			DiagnosticCode.DocumentationConfiguration,
			`Item ${source}: API links require release tags on both the source and target ${lookup.reference}. Add a release tag to each untagged declaration.`,
		);
	}
	if (sourceLevel !== ReleaseLevel.Internal && targetLevel === ReleaseLevel.Internal) {
		return reportFailure(
			DiagnosticCode.DocumentationLinkPolicy,
			`Item ${source}: non-internal APIs cannot link to internal target ${lookup.reference}. Remove the link or correct the original release tags.`,
		);
	}
	return {
		ok: true,
		value: {
			source,
			linkIndex,
			reference: lookup.reference,
			target: target.id,
			targetSignature: targetSignature.id,
			origin: { ...context.origin },
		},
	};
}

/**
 * Selects target documentation without imposing inheritance's parameter-shape requirements.
 * @param source - Receiving API identity for diagnostics.
 * @param target - Compiler-resolved declaration and its callable or constructor facets.
 * @param reference - Parsed reference with an optional terminal selector.
 * @param referenceText - Original reference text for diagnostics.
 * @returns A uniquely selected documentation record, or an invalid or ambiguous selector diagnostic.
 */
function selectLinkTarget(
	source: ApiItemId,
	target: DeclarationFact,
	reference: DocDeclarationReference | undefined,
	referenceText: string,
): Result<Pick<DeclarationFact, "id" | "documentationContext">> {
	const terminal = reference?.memberReferences.at(-1)?.selector;
	if (
		terminal?.selectorKind === SelectorKind.Label ||
		(terminal?.selectorKind === SelectorKind.System && terminal.selector === "constructor")
	) {
		const candidates = [
			target,
			...target.signatures,
			...(target.container?.declaredMembers ?? []),
		].filter((candidate) =>
			terminal.selectorKind === SelectorKind.Label
				? candidate.documentationContext?.labels?.includes(terminal.selector) === true
				: "kind" in candidate && candidate.kind === "Constructor",
		);
		return candidates.length === 1
			? { ok: true, value: assertDefined(candidates[0]) }
			: reportFailure(
					DiagnosticCode.DocumentationReference,
					`Item ${source}: selector ${terminal.selector} identifies ${candidates.length} declarations on ${referenceText}.`,
				);
	}
	const numeric = terminal?.selectorKind === SelectorKind.Index;
	if (
		target.documentationContext === undefined ||
		(numeric && target.declarations.some((part) => part.kind === "FunctionDeclaration"))
	) {
		return selectCallableOverload(source, target, reference, referenceText);
	}
	if (numeric) {
		return reportFailure(
			DiagnosticCode.DocumentationReference,
			`Item ${source}: non-callable target ${referenceText} does not accept an overload selector.`,
		);
	}
	return { ok: true, value: target };
}

/**
 * Resolves package-owned API links without assigning the package API-item metadata.
 *
 * @remarks
 * Package overviews currently use the non-internal visibility rule. Target syntax and overload selection
 * are identical to item links; source-scoped custom API rules do not classify the package.
 *
 * @param analysis - Detached original lookups, classified targets, and selected dependency models.
 * @returns Completed package documentation, undefined when absent, or a reference diagnostic.
 */
export function bindPackageDocumentation(
	analysis: AnalysisContext,
): Result<CompletedPackageDocumentation | undefined> {
	const documentation = analysis.facts.packageDocumentation;
	if (documentation === undefined) {
		return { ok: true, value: undefined };
	}
	const nodes = collectApiLinkNodes(
		new TSDocParser(analysis.configuration).parseString(documentation.documentation)
			.docComment,
	);
	const references = documentation.references ?? [];
	assert.equal(
		nodes.length,
		references.length,
		"Package API links must retain original lookup facts.",
	);
	const links: Omit<DocumentationLinkBinding, "source">[] = [];
	for (const [linkIndex, lookup] of references.entries()) {
		const reference = nodes[linkIndex]?.codeDestination;
		assert.equal(
			reference?.emitAsTsdoc(),
			lookup.reference,
			"Package link lookup order must match comment order.",
		);
		const dependency = resolveDependencyReference(
			analysis,
			reference,
			lookup,
			documentation.origin.packageName,
		);
		if (!dependency.ok) {
			return dependency;
		}
		if (dependency.value === undefined) {
			const bound = bindLocalLink(
				analysis,
				`Package ${analysis.facts.packageName}`,
				{ origin: documentation.origin, links: references },
				lookup,
				linkIndex,
				reference,
				ReleaseLevel.Public,
			);
			if (!bound.ok) {
				return bound;
			}
			const { source: _source, ...link } = bound.value;
			links.push(link);
		} else {
			const target = dependency.value;
			if (target.metadata.releaseLevel === undefined) {
				return reportFailure(
					DiagnosticCode.DocumentationConfiguration,
					`Package ${analysis.facts.packageName}: link target ${lookup.reference} requires a release level.`,
				);
			}
			if (target.metadata.releaseLevel === ReleaseLevel.Internal) {
				return reportFailure(
					DiagnosticCode.DocumentationLinkPolicy,
					`Package ${analysis.facts.packageName}: package documentation cannot link to internal target ${lookup.reference}.`,
				);
			}
			links.push({
				linkIndex,
				reference: lookup.reference,
				target: target.declarationId,
				targetSignature: target.id,
				origin: documentation.origin,
			});
		}
	}
	return freezeData({
		ok: true,
		value: { origin: documentation.origin, documentation: documentation.documentation, links },
	});
}

/**
 * Resolves explicit or validated automatic inheritance within the package and its selected suite.
 *
 * @remarks
 * Uses the context's TSDoc nodes and the official printer without re-parsing.
 * Processes all supplied items, regardless of report selection.
 * Updates the context's parsed comments once, while original text, facts, and classification remain unchanged.
 * Do not reuse this working context for another resolution attempt, including after failure.
 * An absent or empty target comment supplies no inherited descriptive content.
 * A target comment that contains only metadata tags also supplies no descriptive content.
 * Local modifier tags and blocks that are not inherited remain unchanged.
 * Target release tags are not copied.
 *
 * Each explicit request requires exactly one matching {@link DocumentationReferenceBinding}.
 * A binding uses the declaration reference printed by TSDoc and a target from the original comment's package.
 * The internal reference binder looks up targets in supported compiler facts.
 *
 * The context owns the modifier vocabulary used for classification and reference binding.
 * Supply original API link bindings and the existing metadata index through the link validation options.
 * Links retain their original context when sections are inherited. Each receiving API is checked
 * against the target's original release level; non-internal APIs cannot link to internal targets.
 * Binding owns identity, occurrence, reference-text, and scope validation; the resolver does not repeat it.
 * Required missing inputs still assert where resolution needs them.
 * Automatic bindings require prior compiler compatibility and unique source selection.
 * Any local comment suppresses automatic inheritance; competing automatic targets are skipped.
 * Cross-package targets must be authorized and supplied as already-resolved dependency documentation.
 * Configuration currently supports custom modifier tags, not custom block or inline tag semantics.
 * Links to URLs remain unchanged. The function does not access or validate their destinations.
 *
 * @param context - Invocation-owned parsed comments before inheritance, with validated original identities.
 * @param bindings - Validated associations produced from these original comments.
 * @param options - Automatic bindings, link metadata, and authorized dependency results. Omit for same-package explicit resolution without automatic inheritance or API links.
 * @returns Deeply frozen comments and inheritance paths sorted by item identifier,
 * or diagnostics without a partial value.
 * @throws If an internal invariant fails or an unexpected processing error occurs.
 */
export function resolveDocumentation(
	context: DocumentationContext,
	bindings: readonly DocumentationReferenceBinding[],
	options: DocumentationResolutionOptions = {},
): Result<readonly ResolvedDocumentation[]> {
	const inputs = context.items;
	const ordered = [...inputs.values()].sort((left, right) =>
		left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
	);
	if (!context.validation.ok) {
		return context.validation;
	}
	const targets = new Map(bindings.map((binding) => [binding.source, binding]));

	// Associate already-parsed link nodes with their original bindings before copying sections.
	const metadata = options.linkValidation?.metadata ?? new Map<ApiItemId, ApiItemMetadata>();
	const linksBySource = new Map<ApiItemId, Map<number, DocumentationLinkBinding>>();
	for (const link of options.linkValidation?.bindings ?? []) {
		const links =
			linksBySource.get(link.source) ?? new Map<number, DocumentationLinkBinding>();
		links.set(link.linkIndex, link);
		linksBySource.set(link.source, links);
	}
	const parsed = associateDocumentationBindings(
		ordered,
		inputs,
		targets,
		linksBySource,
		options.linkValidation !== undefined,
		options,
	);
	if (!parsed.ok) {
		return parsed;
	}
	const { comments, nodesToBindings, sectionSources } = parsed.value;

	// Validate automatic bindings even when suppressed. Any local comment prevents automatic inheritance.
	const automatic = new Map<ApiItemId, Set<ApiItemId>>();
	for (const binding of options.automaticInheritance ?? []) {
		const source = assertDefined(inputs.get(binding.source), "Automatic sources must exist.");
		const target = assertDefined(inputs.get(binding.target), "Automatic targets must exist.");
		if (source.packageName !== target.packageName) {
			assert(
				options.packages?.has(target.packageName) === true,
				"Automatic bindings must retain same-package source and target inputs.",
			);
		}
		if (source.documentation !== undefined) {
			continue;
		}
		const candidates = automatic.get(source.id) ?? new Set<ApiItemId>();
		candidates.add(target.id);
		automatic.set(source.id, candidates);
	}

	// Repeated bindings to one target are harmless; distinct competing targets leave documentation absent.
	const automaticTargets = new Map<ApiItemId, ApiItemId>();
	for (const [source, candidates] of automatic) {
		if (candidates.size === 1) {
			const target = [...candidates][0];
			assert(target !== undefined);
			automaticTargets.set(source, target);
		}
	}

	// Share parsed comments, a resolution cache, and an active path across recursive inheritance traversal.
	// The traversal resolves targets first, detects cycles, and validates links for each receiving API.
	const resolved = new Map<ApiItemId, ResolvedDocumentation>(options.dependencies);
	const visiting = new Set<ApiItemId>();
	const results: ResolvedDocumentation[] = [];
	const state: DocumentationTraversalState = {
		parser: new TSDocParser(context.configuration),
		mergedInputs: options.mergedInputs ?? new Map(),
		inputs,
		targets,
		automaticTargets,
		comments,
		nodesToBindings,
		sectionSources,
		metadata,
		resolved,
		visiting,
	};
	for (const item of ordered) {
		const result = resolveDocumentationItem(item.id, state);
		if (!result.ok) {
			// Do not expose partially resolved documentation when any item fails validation.
			return result;
		}
		results.push(result.value);
	}

	// Freeze only the completed output; mutable parser and traversal state remain local to this request.
	return freezeData({ ok: true, value: results });
}

/**
 * Associates original comment nodes with bindings before inheritance replaces sections.
 *
 * @param ordered - Inputs in diagnostic evaluation order.
 * @param inputs - All request inputs indexed by identifier.
 * @param targets - Validated inheritance binding identities.
 * @param linksBySource - Validated original link identities and occurrence indices.
 * @param hasLinkValidation - Whether link validation inputs were supplied.
 * @param options - Resolution settings with stored dependency links and section provenance.
 * @returns Request-owned mutable comments and original link-node associations, or diagnostics.
 */
function associateDocumentationBindings(
	ordered: readonly ParsedDocumentationItem<DocumentationInput>[],
	inputs: ReadonlyMap<ApiItemId, DocumentationInput>,
	targets: ReadonlyMap<ApiItemId, DocumentationReferenceBinding>,
	linksBySource: ReadonlyMap<ApiItemId, ReadonlyMap<number, DocumentationLinkBinding>>,
	hasLinkValidation: boolean,
	options: DocumentationResolutionOptions,
): Result<{
	readonly comments: ReadonlyMap<ApiItemId, DocComment>;
	readonly nodesToBindings: ReadonlyMap<DocLinkTag, DocumentationLinkBinding>;
	readonly sectionSources: Map<
		DocNode,
		readonly Omit<DocumentationSectionSource, "section">[]
	>;
}> {
	const comments = new Map<ApiItemId, DocComment>();
	const nodesToBindings = new Map<DocLinkTag, DocumentationLinkBinding>();
	const sectionSources = new Map<
		DocNode,
		readonly Omit<DocumentationSectionSource, "section">[]
	>();
	for (const item of ordered) {
		const comment = item.parsed.docComment;
		const dependency = options.dependencies?.get(item.id);
		for (const section of collectDocumentationSections(comment)) {
			const original = dependency?.sections?.filter(
				(entry) => entry.section === section.section,
			);
			sectionSources.set(
				section.node,
				original !== undefined && original.length > 0
					? original
					: [{ source: item.id, packageName: item.packageName }],
			);
		}
		const linkNodes = item.originalLinks;
		assert(
			linkNodes.length === 0 || hasLinkValidation,
			"Comments with API links must have original link validation inputs.",
		);
		const sourceLinks = linksBySource.get(item.id);
		for (const [linkIndex, node] of linkNodes.entries()) {
			const link = assertDefined(
				dependency?.links[linkIndex] ?? sourceLinks?.get(linkIndex),
				"Every API link occurrence must have a binding.",
			);
			nodesToBindings.set(node, link);
		}
		const request = comment.inheritDocTag;
		const binding = targets.get(item.id);
		if (request !== undefined) {
			const reference = request.declarationReference;

			if (
				reference === undefined ||
				(reference.packageName !== undefined &&
					reference.packageName !== item.packageName &&
					options.packages?.has(reference.packageName) !== true)
			) {
				return reportFailure(
					DiagnosticCode.DocumentationUnsupported,
					`Item ${item.id}: supply an explicit inheritance target in the original package or an authorized suite package.`,
				);
			}
			assert(
				binding !== undefined,
				"Explicit inheritance requests must have validated bindings.",
			);
			const target = inputs.get(binding.target);
			assert(
				target !== undefined,
				"Validated documentation bindings must have target inputs.",
			);
			if (
				target.packageName !== item.packageName &&
				options.packages?.has(target.packageName) !== true
			) {
				return reportFailure(
					DiagnosticCode.DocumentationUnsupported,
					`Item ${item.id}: target ${target.id} belongs to ${target.packageName}. Supply its resolved model and authorize that package in the suite.`,
				);
			}
		}
		comments.set(item.id, comment);
	}
	return { ok: true, value: { comments, nodesToBindings, sectionSources } };
}

/**
 * Dependencies and mutable traversal state owned by one documentation resolution request.
 */
interface DocumentationTraversalState {
	/**
	 * Shared vocabulary used when merging fully resolved contributions.
	 */
	readonly parser: TSDocParser;

	/**
	 * Ordered private contribution inputs for merged API comments.
	 */
	readonly mergedInputs: ReadonlyMap<ApiItemId, readonly ApiItemId[]>;

	/**
	 * Original identity associated with each section node before content copying.
	 */
	readonly sectionSources: Map<
		DocNode,
		readonly Omit<DocumentationSectionSource, "section">[]
	>;

	/**
	 * Unique automatic sources for inputs without local comments.
	 */
	readonly automaticTargets: ReadonlyMap<ApiItemId, ApiItemId>;

	/**
	 * Original inputs, which are never mutated.
	 */
	readonly inputs: ReadonlyMap<ApiItemId, DocumentationInput>;

	/**
	 * Validated explicit inheritance bindings.
	 */
	readonly targets: ReadonlyMap<ApiItemId, DocumentationReferenceBinding>;

	/**
	 * Request-owned parsed comments whose inherited sections are updated during traversal.
	 */
	readonly comments: ReadonlyMap<ApiItemId, DocComment>;

	/**
	 * Original parsed link nodes and their validated bindings.
	 */
	readonly nodesToBindings: ReadonlyMap<DocLinkTag, DocumentationLinkBinding>;

	/**
	 * Original classification used to check each receiving API.
	 */
	readonly metadata: ReadonlyMap<ApiItemId, ApiItemMetadata>;

	/**
	 * Successful results cached during this traversal.
	 */
	readonly resolved: Map<ApiItemId, ResolvedDocumentation>;

	/**
	 * Active inheritance path in insertion order, used for cycle diagnostics.
	 */
	readonly visiting: Set<ApiItemId>;
}

/**
 * Resolves one item after resolving its inheritance target.
 *
 * @param id - The identifier of an item that passed input validation.
 * @param state - Explicit request-local dependencies, mutable comments, cache, and active path.
 * @returns The resolved item, or a cycle or link-policy diagnostic.
 */
function resolveDocumentationItem(
	id: ApiItemId,
	state: DocumentationTraversalState,
): Result<ResolvedDocumentation> {
	const { inputs, targets, comments, nodesToBindings, metadata, resolved, visiting } = state;
	const cached = resolved.get(id);
	if (cached !== undefined) {
		return { ok: true, value: cached };
	}
	if (visiting.has(id)) {
		return reportFailure(
			DiagnosticCode.DocumentationCycle,
			`Remove the documentation inheritance cycle: ${[...visiting, id].join(" -> ")}.`,
		);
	}
	visiting.add(id);
	const item = inputs.get(id);
	const comment = comments.get(id);
	assert(
		item !== undefined && comment !== undefined,
		"Documentation traversal must use validated item identities.",
	);
	const targetId = targets.get(id)?.target ?? state.automaticTargets.get(id);
	let inheritedFrom: readonly ApiItemId[] = [];
	if (targetId !== undefined) {
		const target = resolveDocumentationItem(targetId, state);
		if (!target.ok) {
			return target;
		}
		const inherited = comments.get(targetId);
		assert(
			inherited !== undefined,
			"Resolved documentation targets must have parsed comments.",
		);
		copyInheritedSections(comment, inherited);
		inheritedFrom = [targetId, ...target.value.inheritedFrom];
	}
	const contributions = state.mergedInputs.get(id);
	if (contributions !== undefined) {
		const parts: DocComment[] = [];
		const ancestors: ApiItemId[] = [];
		for (const contribution of contributions) {
			const part = resolveDocumentationItem(contribution, state);
			if (!part.ok) {
				return part;
			}
			parts.push(assertDefined(comments.get(contribution)));
			ancestors.push(...part.value.inheritedFrom);
		}
		const merged = mergeResolvedDocumentation(state, parts);
		Object.assign(comment, merged);
		inheritedFrom = [...new Set(ancestors)];
	}
	const links = resolveEffectiveLinks(id, comment, nodesToBindings, metadata);
	if (!links.ok) {
		return links;
	}

	// TODO (Stage 3 portable models): Add structured content and complete type relationships to the
	// retained section provenance and link identities; these text records cannot restore the full API graph.
	const value: ResolvedDocumentation = {
		id: item.id,
		sections: collectDocumentationSections(comment).flatMap(({ section, node }) =>
			assertDefined(
				state.sectionSources.get(node),
				"Resolved sections must retain their original input identity.",
			).map((source) => ({ ...source, section })),
		),
		packageName: item.packageName,
		documentation:
			item.documentation === undefined && targetId === undefined
				? undefined
				: comment.emitAsTsdoc() || "/** */",
		inheritedFrom,
		links: links.value,
	};
	visiting.delete(id);
	resolved.set(id, value);
	return { ok: true, value };
}

/**
 * Merges resolved comments while associating retained content nodes with their original section sources.
 * @param state - Invocation-owned parser and provenance map.
 * @param comments - Resolved contributions in compiler order.
 * @returns Combined documentation with unchanged original link-node identities.
 */
function mergeResolvedDocumentation(
	state: DocumentationTraversalState,
	comments: readonly DocComment[],
): DocComment {
	/**
	 * Associates retained child nodes with their original section sources before merging containers.
	 * @param current - Original section or descendant node.
	 * @param sources - Provenance to use only where more specific provenance is absent.
	 */
	function associate(
		current: DocNode,
		sources: readonly Omit<DocumentationSectionSource, "section">[],
	): void {
		if (!state.sectionSources.has(current)) {
			state.sectionSources.set(current, sources);
		}
		for (const child of current.getChildNodes()) {
			associate(child, sources);
		}
	}

	/**
	 * Finds the source records on retained nodes within a newly merged section.
	 * @param current - Merged section or retained descendant.
	 * @returns Provenance in content traversal order.
	 */
	function findSources(
		current: DocNode,
	): readonly Omit<DocumentationSectionSource, "section">[] {
		return state.sectionSources.get(current) ?? current.getChildNodes().flatMap(findSources);
	}
	for (const comment of comments) {
		for (const { node } of collectDocumentationSections(comment)) {
			const sources = assertDefined(state.sectionSources.get(node));
			associate(node, sources);
		}
	}
	const merged = assertDefined(mergeDocumentationComments(state.parser, comments));
	for (const { node } of collectDocumentationSections(merged)) {
		const sources = findSources(node);
		const fallback = assertDefined(
			state.sectionSources.get(assertDefined(comments[0]).summarySection),
		);
		state.sectionSources.set(node, [
			...new Map(
				(sources.length > 0 ? sources : fallback).map((source) => [
					JSON.stringify([source.source, source.packageName]),
					source,
				]),
			).values(),
		]);
	}
	return merged;
}

/**
 * Enumerates descriptive sections and retained local blocks in deterministic order.
 *
 * @param comment - Original or resolved TSDoc comment.
 * @returns Section identities and their existing nodes, without cloning content.
 */
function collectDocumentationSections(
	comment: DocComment,
): { section: string; node: DocNode }[] {
	const sections: { section: string; node: DocNode }[] = [
		{ section: "summary", node: comment.summarySection },
	];
	const counts = new Map<string, number>();
	for (const block of [
		comment.remarksBlock,
		comment.returnsBlock,
		...comment.params.blocks,
		...comment.typeParams.blocks,
		comment.deprecatedBlock,
		...comment.seeBlocks,
		...comment.customBlocks,
	]) {
		if (block === undefined) {
			continue;
		}
		const name =
			block instanceof DocParamBlock
				? `${block.blockTag.tagName}:${block.parameterName}`
				: block.blockTag.tagName;
		const ordinal = counts.get(name) ?? 0;
		counts.set(name, ordinal + 1);
		sections.push({ section: ordinal === 0 ? name : `${name}:${ordinal}`, node: block });
	}
	return sections;
}

/**
 * Copies supported inherited sections while retaining original TSDoc node identities.
 *
 * @remarks
 * Mutates only the receiving comment's section references and parameter collections.
 * Shared nodes preserve API link provenance. Local ancillary blocks and modifiers remain unchanged.
 *
 * @param comment - The request-owned receiving comment to update.
 * @param inherited - The target comment after its own inheritance has been resolved.
 */
function copyInheritedSections(comment: DocComment, inherited: DocComment): void {
	comment.summarySection = inherited.summarySection;
	comment.remarksBlock = inherited.remarksBlock;
	comment.returnsBlock = inherited.returnsBlock;
	comment.params.clear();
	for (const parameter of inherited.params) {
		comment.params.add(parameter);
	}
	comment.typeParams.clear();
	for (const parameter of inherited.typeParams) {
		comment.typeParams.add(parameter);
	}
	comment.inheritDocTag = undefined;
}

/**
 * Validates effective links against the receiving API's original release metadata.
 *
 * @param id - The receiving API identifier.
 * @param comment - The comment after inherited sections have been copied.
 * @param nodesToBindings - Original parsed link nodes and their validated bindings.
 * @param metadata - Original classification for receivers and targets.
 * @returns Copied bindings in effective traversal order, or metadata and policy diagnostics.
 * @throws If an effective link node has no original binding.
 */
function resolveEffectiveLinks(
	id: ApiItemId,
	comment: DocComment,
	nodesToBindings: ReadonlyMap<DocLinkTag, DocumentationLinkBinding>,
	metadata: ReadonlyMap<ApiItemId, ApiItemMetadata>,
): Result<readonly DocumentationLinkBinding[]> {
	const links: DocumentationLinkBinding[] = [];
	for (const node of collectApiLinkNodes(comment)) {
		const link = nodesToBindings.get(node);
		assert(
			link !== undefined,
			"Effective API link nodes must retain their original bindings.",
		);
		const sourceLevel = assertDefined(
			metadata.get(id),
			"Effective API link receivers must have original classification metadata.",
		).releaseLevel;
		const targetLevel = assertDefined(
			metadata.get(link.targetSignature),
			"Effective API link targets must have original classification metadata.",
		).releaseLevel;
		if (sourceLevel === undefined || targetLevel === undefined) {
			return reportFailure(
				DiagnosticCode.DocumentationConfiguration,
				`Item ${id}: inherited API links require release tags on both the receiving API and target ${link.reference}. Add a release tag to each untagged declaration.`,
			);
		}
		if (sourceLevel !== ReleaseLevel.Internal && targetLevel === ReleaseLevel.Internal) {
			return reportFailure(
				DiagnosticCode.DocumentationLinkPolicy,
				`Item ${id}: non-internal APIs cannot receive a link to internal target ${link.reference} from ${link.source}. Remove the link or correct the original release tags.`,
			);
		}
		links.push({ ...link, origin: { ...link.origin } });
	}
	return { ok: true, value: links };
}

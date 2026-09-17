import assert from "node:assert/strict";
import { type DocLinkTag, SelectorKind, type DocComment } from "@microsoft/tsdoc";
import { ReleaseLevel, type ApiItemMetadata } from "./classification.js";
import type { AnalysisFacts, ApiItemId, MemberFact, Origin } from "./facts.js";
import { DiagnosticCode, failure, freezeData, type Result } from "./result.js";
import { assertDefined } from "./utilities.js";
import {
	apiLinkNodes,
	type AnalysisContext,
	type DocumentationContext,
	type ParsedDocumentationItem,
} from "./documentationContext.js";

/**
 * A local documentation comment and the name of the package that contains its declaration.
 */
export interface DocumentationInput {
	/**
	 * The identifier of the declaration or individual signature.
	 */
	readonly id: ApiItemId;
	/**
	 * The name of the package that contains the original comment.
	 *
	 * @remarks
	 * Do not replace this name with the name of a package that re-exports the declaration.
	 */
	readonly packageName: string;
	/**
	 * The local TSDoc comment, or `undefined` when no local comment exists.
	 */
	readonly documentation: string | undefined;
}

/**
 * An association between an explicit documentation inheritance request and its target.
 *
 * @remarks
 * This association is called a binding.
 * The internal reference binder creates bindings from supported compiler facts.
 * If you create a binding directly, resolve the target in the original comment's declaration scope.
 * Verify that the target signature and its parameters are compatible with the source signature.
 * {@link resolveDocumentation} does not repeat these checks or rename inherited parameters.
 */
export interface DocumentationReferenceBinding {
	/**
	 * The identifier of the item that contains the inheritance request.
	 */
	readonly source: ApiItemId;
	/**
	 * The declaration reference in the format produced by TSDoc's `emitAsTsdoc()` method.
	 */
	readonly reference: string;
	/**
	 * The identifier of the target declaration or individual signature.
	 */
	readonly target: ApiItemId;
}

/**
 * Associates explicit callable documentation inheritance requests with target signature identifiers.
 *
 * @remarks
 * Internal operation. Not exported from the package entrypoint.
 * Uses compiler lookup facts that contain no compiler objects.
 * Supports unqualified names, such as `base`, export aliases, and namespace or instance method paths.
 * The compiler resolves names in the original declaration scope, including imported aliases.
 *
 * The target must be a function or method in the same package.
 * Numeric method references use a terminal selector, such as `Base.(method:2)`.
 * Static class member paths and static/instance name collisions are unsupported.
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
 * @returns Deeply frozen bindings sorted by source signature identifier, or diagnostics without partial bindings.
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
	for (const { declaration, signature, parsed } of analysis.items.values()) {
		const request = parsed.docComment.inheritDocTag;
		if (request === undefined) {
			continue;
		}
		// TODO (Stage 2 documentation references): Support other declaration kinds once
		// the adapter extracts their original-scope documentation lookup context.
		if (
			declaration.declarations.length === 0 ||
			declaration.declarations.some(
				(source) =>
					source.kind !== "FunctionDeclaration" &&
					source.kind !== "MethodDeclaration" &&
					source.kind !== "MethodSignature",
			)
		) {
			return failure(
				DiagnosticCode.DocumentationUnsupported,
				`Item ${signature.id}: @inheritDoc is supported only on functions and methods. Replace @inheritDoc with local documentation for this declaration.`,
			);
		}
		const context = assertDefined(
			signature.documentationContext,
			"Supported inheritance sources must retain documentation context.",
		);
		const lookup = assertDefined(
			context.inheritance,
			"Inheritance requests must retain compiler lookup facts.",
		);
		assert.equal(
			lookup.reference,
			request.declarationReference?.emitAsTsdoc() ?? "",
			"Inheritance lookup facts must match the original comment.",
		);
		if (lookup.status === "unsupported") {
			return failure(
				DiagnosticCode.DocumentationUnsupported,
				`Item ${signature.id}: unsupported @inheritDoc reference "${lookup.reference}". Reference a function or instance method in the same package, for example {@inheritDoc base} or {@inheritDoc Base.method}. To select an overload, use {@inheritDoc (base:2)} or {@inheritDoc Base.(method:2)}. Otherwise, replace @inheritDoc with local documentation.`,
			);
		}
		if (lookup.status === "not-found") {
			return failure(
				DiagnosticCode.DocumentationReference,
				`Item ${signature.id}: target ${lookup.reference} was not found in ${context.origin.packageName}/${context.origin.file}. Correct the reference.`,
			);
		}
		const target = declarations.get(lookup.target);
		assert.ok(target, "Documentation lookup targets must be retained in declaration facts.");
		// TODO (Stage 2 documentation targets): Support non-callable targets with declaration-level
		// documentation contexts and bindings instead of requiring a callable signature below.
		if (
			target.declarations.length === 0 ||
			target.declarations.some(
				(source) =>
					source.kind !== "FunctionDeclaration" &&
					source.kind !== "MethodDeclaration" &&
					source.kind !== "MethodSignature",
			)
		) {
			return failure(
				DiagnosticCode.DocumentationUnsupported,
				`Item ${signature.id}: target ${lookup.reference} must be a function or method.`,
			);
		}
		const selector = request.declarationReference?.memberReferences.at(-1)?.selector;
		if (selector !== undefined && selector.selectorKind !== SelectorKind.Index) {
			return failure(
				DiagnosticCode.DocumentationUnsupported,
				`Item ${signature.id}: use a numeric overload selector.`,
			);
		}
		if (selector === undefined && target.signatures.length !== 1) {
			return failure(
				DiagnosticCode.DocumentationReference,
				`Item ${signature.id}: target ${lookup.reference} has ${target.signatures.length} callable signatures. Supply a one-based numeric selector such as (foo:1), or local documentation.`,
			);
		}
		const ordinal = selector === undefined ? 1 : Number(selector.selector);
		if (!Number.isSafeInteger(ordinal) || ordinal < 1 || ordinal > target.signatures.length) {
			return failure(
				DiagnosticCode.DocumentationReference,
				`Item ${signature.id}: overload selector ${selector?.selector} is outside the callable signature range 1..${target.signatures.length} for ${lookup.reference}.`,
			);
		}
		const targetSignature = target.signatures[ordinal - 1];
		assert.ok(targetSignature, "Validated overload selectors must identify a signature.");
		const targetContext = assertDefined(
			targetSignature.documentationContext,
			"Supported inheritance targets must retain documentation context.",
		);
		if (targetContext.origin.packageName !== context.origin.packageName) {
			return failure(
				DiagnosticCode.DocumentationUnsupported,
				`Item ${signature.id}: target ${lookup.reference} requires same-package callable documentation facts. Cross-package targets require future suite resolution.`,
			);
		}
		if (
			context.parameters.some((parameter) => parameter.name === undefined) ||
			targetContext.parameters.some((parameter) => parameter.name === undefined) ||
			context.parameters.length !== targetContext.parameters.length ||
			context.parameters.some((parameter, index) => {
				const other = targetContext.parameters[index];
				return (
					other === undefined ||
					parameter.name !== other.name ||
					parameter.optional !== other.optional ||
					parameter.rest !== other.rest
				);
			}) ||
			context.typeParameters.length !== targetContext.typeParameters.length ||
			context.typeParameters.some(
				(name, index) => name !== targetContext.typeParameters[index],
			)
		) {
			return failure(
				DiagnosticCode.DocumentationReference,
				`Item ${signature.id}: parameters or type parameters do not match ${lookup.reference}. Supply local documentation; parameter adaptation is not supported yet.`,
			);
		}
		bindings.push({
			source: signature.id,
			reference: lookup.reference,
			target: targetSignature.id,
		});
	}
	return freezeData({
		ok: true,
		value: bindings.sort((left, right) =>
			left.source < right.source ? -1 : left.source > right.source ? 1 : 0,
		),
	});
}

/**
 * A confidently selected non-overloaded member documentation source.
 *
 * @remarks
 * Callers must establish compiler compatibility and exclude overloaded or uncertain sources.
 * The resolver suppresses this binding when any local comment exists.
 */
export interface AutomaticDocumentationBinding {
	/**
	 * The receiving member identifier.
	 */
	readonly source: ApiItemId;
	/**
	 * The original source member identifier, not an instantiated view identifier.
	 */
	readonly target: ApiItemId;
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
 * @returns Frozen automatic bindings, sorted by receiving member identifier.
 */
export function bindAutomaticDocumentationReferences(
	facts: AnalysisFacts,
): readonly AutomaticDocumentationBinding[] {
	// TODO (Stage 2 member documentation): Define merged-member precedence and extract original
	// member link/reference contexts before integrating this binder into class/interface reports.
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
					candidate.declarations[0]?.packageName !== member.declarations[0]?.packageName
				) {
					uncertain = true;
					break;
				}
				const key = memberSourceKey(candidate);
				if (memberSourceKey(original) !== key) {
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
				assert.ok(candidate);
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
function memberSourceKey(member: MemberFact): string {
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
 * A validated API link occurrence in an original function comment.
 *
 * @remarks
 * Created by the internal compiler-backed binder and consumed by documentation resolution.
 * Manual bindings must pass the same original-scope and target-form checks as the binder.
 * Identifiers belong to the supplied analysis and are not portable model identities.
 */
export interface DocumentationLinkBinding {
	/**
	 * The identifier of the signature that contains the original comment.
	 */
	readonly source: ApiItemId;
	/**
	 * The zero-based API link index in TSDoc tree traversal order, excluding URL links.
	 */
	readonly linkIndex: number;
	/**
	 * The declaration reference printed by TSDoc, without the display label.
	 */
	readonly reference: string;
	/**
	 * The resolved declaration identifier, not its signature identifier.
	 */
	readonly target: ApiItemId;
	/**
	 * The target's single callable signature identifier used for original release classification.
	 */
	readonly targetSignature: ApiItemId;
	/**
	 * The original comment's location, independent of re-exporting entrypoints.
	 */
	readonly origin: Origin;
}

/**
 * Binds and validates API links in collected function and method comments.
 *
 * @remarks
 * Internal operation. Should not be exported from the package entrypoint.
 * Uses the context's original classification, parsed link nodes, and compiler lookup results.
 * Does not reparse comments or recompute classification.
 * Run this operation before content resolution updates the parsed comments.
 * Targets must be same-package standalone functions with exactly one callable signature.
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
	const { declarations, metadata, validation } = analysis;
	if (!validation.ok) {
		return validation;
	}
	const bindings: DocumentationLinkBinding[] = [];
	for (const { declaration, signature, originalLinks } of analysis.items.values()) {
		const references = originalLinks.map((node) => node.codeDestination?.emitAsTsdoc());
		const context = signature.documentationContext;
		if (context === undefined && references.length === 0) {
			continue;
		}
		// TODO (Stage 2 link sources): Bind links on other declaration kinds and effective members
		// once their original-scope lookup contexts and original classification are available.
		if (
			references.length > 0 &&
			(declaration.declarations.length === 0 ||
				declaration.declarations.some(
					(source) =>
						source.kind !== "FunctionDeclaration" &&
						source.kind !== "MethodDeclaration" &&
						source.kind !== "MethodSignature",
				))
		) {
			return failure(
				DiagnosticCode.DocumentationUnsupported,
				`Item ${signature.id}: API links are supported only in function and method comments. Use plain text for this declaration.`,
			);
		}
		assert.ok(context, "Supported API link sources must retain documentation context.");
		assert.equal(
			references.length,
			context.links.length,
			"API link lookup counts must match the original comment.",
		);
		assert.ok(
			references.every(
				(reference, index) => reference === assertDefined(context.links[index]).reference,
			),
			"API link lookup references must match the original comment.",
		);
		for (const [linkIndex, lookup] of context.links.entries()) {
			if (lookup.status === "unsupported") {
				return failure(
					DiagnosticCode.DocumentationUnsupported,
					`Item ${signature.id}: use an unqualified API link reference. Qualified references and selectors are not supported yet.`,
				);
			}
			if (lookup.status === "not-found") {
				return failure(
					DiagnosticCode.DocumentationReference,
					`Item ${signature.id}: target ${lookup.reference} was not found in ${context.origin.packageName}/${context.origin.file}. Correct the API link.`,
				);
			}
			const target = declarations.get(lookup.target);
			assert.ok(target, "Documentation lookup targets must be retained in declaration facts.");
			// TODO (Stage 2 link targets): Add declaration-level classification and overload
			// target semantics before accepting other target forms or selecting a signature.
			if (
				target.declarations.length === 0 ||
				target.declarations.some((source) => source.kind !== "FunctionDeclaration") ||
				target.signatures.length !== 1
			) {
				return failure(
					DiagnosticCode.DocumentationUnsupported,
					`Item ${signature.id}: target ${lookup.reference} requires a standalone function with one callable signature and documentation context. Other declaration forms and overload targets are not supported yet.`,
				);
			}
			const targetSignature = assertDefined(
				target.signatures[0],
				"Single-signature targets must have a signature.",
			);
			const targetContext = assertDefined(
				targetSignature.documentationContext,
				"Supported API link targets must retain documentation context.",
			);
			if (
				targetContext.origin.packageName !== context.origin.packageName ||
				target.declarations.some((source) => source.packageName !== context.origin.packageName)
			) {
				return failure(
					DiagnosticCode.DocumentationUnsupported,
					`Item ${signature.id}: target ${lookup.reference} is outside the original package ${context.origin.packageName}. Cross-package links require future suite resolution.`,
				);
			}
			const sourceLevel = assertDefined(
				metadata.get(signature.id),
				"API link sources must have original classification metadata.",
			).releaseLevel;
			const targetLevel = assertDefined(
				metadata.get(targetSignature.id),
				"API link targets must have original classification metadata.",
			).releaseLevel;
			if (sourceLevel === undefined || targetLevel === undefined) {
				return failure(
					DiagnosticCode.DocumentationConfiguration,
					`Item ${signature.id}: API links require release tags on both the source and target ${lookup.reference}. Add a release tag to each untagged declaration.`,
				);
			}
			if (sourceLevel !== ReleaseLevel.Internal && targetLevel === ReleaseLevel.Internal) {
				return failure(
					DiagnosticCode.DocumentationLinkPolicy,
					`Item ${signature.id}: non-internal APIs cannot link to internal target ${lookup.reference}. Remove the link or correct the original release tags.`,
				);
			}
			bindings.push({
				source: signature.id,
				linkIndex,
				reference: lookup.reference,
				target: target.id,
				targetSignature: targetSignature.id,
				origin: { ...context.origin },
			});
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
 * Validated original API links and release metadata for content resolution.
 */
export interface DocumentationLinkValidation {
	/**
	 * One binding per API link in the supplied original comments, including repeated links.
	 *
	 * @remarks
	 * Use the compiler-backed binder or perform equivalent original-scope and target-form checks.
	 * The resolver trusts the binder's validated identities, occurrence indices, reference text, and scope.
	 * Bindings must belong to the same context and must not be modified after binding.
	 */
	readonly bindings: readonly DocumentationLinkBinding[];
	/**
	 * Original classification for all linked targets and receiving APIs, independent of report selection.
	 */
	readonly metadata: ReadonlyMap<ApiItemId, ApiItemMetadata>;
}

/**
 * Validated automatic inheritance and API link inputs for documentation resolution.
 */
export interface DocumentationResolutionOptions {
	/**
	 * Confident non-overloaded member bindings established from compiler relationships.
	 *
	 * @remarks
	 * Any local comment, including empty or tag-only TSDoc, suppresses automatic inheritance.
	 * Multiple distinct targets for one receiver are skipped rather than guessed.
	 * Supply original comments for every source and target, independently of report selection.
	 *
	 * @defaultValue Omitted. No automatic inheritance is requested.
	 */
	readonly automaticInheritance?: readonly AutomaticDocumentationBinding[];
	/**
	 * Original link bindings and classification required when comments contain API links.
	 *
	 * @defaultValue Omitted. Only comments without API links can be resolved.
	 */
	readonly linkValidation?: DocumentationLinkValidation;
}

/**
 * Documentation after the resolver applies explicit or validated automatic inheritance.
 */
export interface ResolvedDocumentation extends DocumentationInput {
	/**
	 * Validated links in effective comment traversal order, excluding links with URL destinations.
	 *
	 * @remarks
	 * Each binding retains its original source signature, link index, and location through inheritance.
	 * The containing result's identifier identifies the receiving API. Repeated references remain separate.
	 */
	readonly links: readonly DocumentationLinkBinding[];
	/**
	 * The comment printed by TSDoc after inheritance, or `undefined` when no local comment or target exists.
	 *
	 * @remarks
	 * The resolver copies the target's summary, remarks, parameter documentation,
	 * type-parameter documentation, and return documentation.
	 * Other blocks and modifier tags come from the local comment.
	 * Do not use this output to classify release levels.
	 * This text format can change. It is not a complete portable documentation model.
	 */
	readonly documentation: string | undefined;
	/**
	 * Target identifiers in traversal order, from the immediate target to the last target.
	 *
	 * @remarks
	 * Empty when no explicit or automatic inheritance is applied.
	 */
	readonly inheritedFrom: readonly ApiItemId[];
}

/**
 * Copies documentation for explicit or validated automatic inheritance within the same package.
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
 * This function does not support custom block or inline tags or cross-package links.
 * Inheritance requests for other packages produce diagnostics.
 * Links to URLs remain unchanged. The function does not access or validate their destinations.
 *
 * @param context - Invocation-owned parsed comments before inheritance, with validated original identities.
 * @param bindings - Validated associations produced from these original comments.
 * @param options - Optional automatic inheritance bindings, API link bindings, and original metadata.
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
	);
	if (!parsed.ok) {
		return parsed;
	}
	const { comments, nodesToBindings } = parsed.value;
	// Validate automatic bindings even when suppressed. Any local comment prevents automatic inheritance.
	const automatic = new Map<ApiItemId, Set<ApiItemId>>();
	for (const binding of options.automaticInheritance ?? []) {
		const source = assertDefined(inputs.get(binding.source), "Automatic sources must exist.");
		const target = assertDefined(inputs.get(binding.target), "Automatic targets must exist.");
		assert.equal(
			source.packageName,
			target.packageName,
			"Automatic bindings must retain same-package source and target inputs.",
		);
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
			assert.ok(target !== undefined);
			automaticTargets.set(source, target);
		}
	}
	// Share parsed comments, a resolution cache, and an active path across recursive inheritance traversal.
	// The traversal resolves targets first, detects cycles, and validates links for each receiving API.
	const resolved = new Map<ApiItemId, ResolvedDocumentation>();
	const visiting = new Set<ApiItemId>();
	const results: ResolvedDocumentation[] = [];
	const state: DocumentationTraversalState = {
		inputs,
		targets,
		automaticTargets,
		comments,
		nodesToBindings,
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
 * @returns Request-owned mutable comments and original link-node associations, or diagnostics.
 */
function associateDocumentationBindings(
	ordered: readonly ParsedDocumentationItem<DocumentationInput>[],
	inputs: ReadonlyMap<ApiItemId, DocumentationInput>,
	targets: ReadonlyMap<ApiItemId, DocumentationReferenceBinding>,
	linksBySource: ReadonlyMap<ApiItemId, ReadonlyMap<number, DocumentationLinkBinding>>,
	hasLinkValidation: boolean,
): Result<{
	readonly comments: ReadonlyMap<ApiItemId, DocComment>;
	readonly nodesToBindings: ReadonlyMap<DocLinkTag, DocumentationLinkBinding>;
}> {
	const comments = new Map<ApiItemId, DocComment>();
	const nodesToBindings = new Map<DocLinkTag, DocumentationLinkBinding>();
	for (const item of ordered) {
		const comment = item.parsed.docComment;
		const linkNodes = item.originalLinks;
		assert.ok(
			linkNodes.length === 0 || hasLinkValidation,
			"Comments with API links must have original link validation inputs.",
		);
		const sourceLinks = linksBySource.get(item.id);
		for (const [linkIndex, node] of linkNodes.entries()) {
			const link = assertDefined(
				sourceLinks?.get(linkIndex),
				"Every API link occurrence must have a binding.",
			);
			nodesToBindings.set(node, link);
		}
		const request = comment.inheritDocTag;
		const binding = targets.get(item.id);
		if (request !== undefined) {
			const reference = request.declarationReference;
			// TODO (Stage 2 suite resolution): Look up targets in the original comment's package suite.
			// Replace the same-package checks and apply reference policies. When loading models, check
			// availability and compatibility for every selected dependency, including unused dependencies.
			if (
				reference === undefined ||
				(reference.packageName !== undefined && reference.packageName !== item.packageName)
			) {
				return failure(
					DiagnosticCode.DocumentationUnsupported,
					`Item ${item.id}: supply an explicit same-package inheritance target. Automatic and cross-package inheritance are not supported yet.`,
				);
			}
			assert.ok(binding, "Explicit inheritance requests must have validated bindings.");
			const target = inputs.get(binding.target);
			assert.ok(target, "Validated documentation bindings must have target inputs.");
			if (target.packageName !== item.packageName) {
				return failure(
					DiagnosticCode.DocumentationUnsupported,
					`Item ${item.id}: target ${target.id} belongs to ${target.packageName}. Cross-package inheritance requires suite resolution, which is not supported yet.`,
				);
			}
		}
		comments.set(item.id, comment);
	}
	return { ok: true, value: { comments, nodesToBindings } };
}

/**
 * Dependencies and mutable traversal state owned by one documentation resolution request.
 */
interface DocumentationTraversalState {
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
		return failure(
			DiagnosticCode.DocumentationCycle,
			`Remove the documentation inheritance cycle: ${[...visiting, id].join(" -> ")}.`,
		);
	}
	visiting.add(id);
	const item = inputs.get(id);
	const comment = comments.get(id);
	assert.ok(item && comment, "Documentation traversal must use validated item identities.");
	const targetId = targets.get(id)?.target ?? state.automaticTargets.get(id);
	let inheritedFrom: readonly ApiItemId[] = [];
	if (targetId !== undefined) {
		const target = resolveDocumentationItem(targetId, state);
		if (!target.ok) {
			return target;
		}
		const inherited = comments.get(targetId);
		assert.ok(inherited, "Resolved documentation targets must have parsed comments.");
		copyInheritedSections(comment, inherited);
		inheritedFrom = [targetId, ...target.value.inheritedFrom];
	}
	const links = resolveEffectiveLinks(id, comment, nodesToBindings, metadata);
	if (!links.ok) {
		return links;
	}
	// TODO (Stage 2 provenance, Stage 3 portable models): Retain the source identifier and original
	// declaration context for each section, including local sections. Serialize structured content
	// and resolved link targets with versioned identifiers. Comment text and an inheritance path
	// do not supply all information required by the portable model contract.
	const value: ResolvedDocumentation = {
		id: item.id,
		packageName: item.packageName,
		documentation:
			item.documentation === undefined && targetId === undefined
				? undefined
				: comment.emitAsTsdoc(),
		inheritedFrom,
		links: links.value,
	};
	visiting.delete(id);
	resolved.set(id, value);
	return { ok: true, value };
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
	for (const node of apiLinkNodes(comment)) {
		const link = nodesToBindings.get(node);
		assert.ok(link, "Effective API link nodes must retain their original bindings.");
		const sourceLevel = assertDefined(
			metadata.get(id),
			"Effective API link receivers must have original classification metadata.",
		).releaseLevel;
		const targetLevel = assertDefined(
			metadata.get(link.targetSignature),
			"Effective API link targets must have original classification metadata.",
		).releaseLevel;
		if (sourceLevel === undefined || targetLevel === undefined) {
			return failure(
				DiagnosticCode.DocumentationConfiguration,
				`Item ${id}: inherited API links require release tags on both the receiving API and target ${link.reference}. Add a release tag to each untagged declaration.`,
			);
		}
		if (sourceLevel !== ReleaseLevel.Internal && targetLevel === ReleaseLevel.Internal) {
			return failure(
				DiagnosticCode.DocumentationLinkPolicy,
				`Item ${id}: non-internal APIs cannot receive a link to internal target ${link.reference} from ${link.source}. Remove the link or correct the original release tags.`,
			);
		}
		links.push({ ...link, origin: { ...link.origin } });
	}
	return { ok: true, value: links };
}

import assert from "node:assert/strict";
import { DocLinkTag, TSDocParser, type DocComment, type DocNode } from "@microsoft/tsdoc";
import {
	ReleaseLevel,
	type ApiClassification,
	type ApiItemMetadata,
} from "./classification.js";
import type { AnalysisFacts, ApiItemId, Origin } from "./facts.js";
import { DiagnosticCode, failure, freezeData, type Result } from "./result.js";
import { createTsdocConfiguration, type TsdocOptions } from "./tsdocConfiguration.js";

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
 * Associates explicit function documentation inheritance requests with target signature identifiers.
 *
 * @remarks
 * Internal operation. Not exported from the package entrypoint.
 * Uses compiler lookup facts that contain no compiler objects.
 * Supports unqualified names, such as `base`, and export aliases from the same module.
 * The compiler resolves names in the original declaration scope, including imported aliases.
 *
 * The target must be a standalone function in the same package with exactly one callable signature.
 * Parameter names, order, and count must match.
 * Optional parameter flags, rest parameter flags, and type-parameter names must also match.
 * The function rejects destructured parameters because they require documentation changes.
 * These checks do not establish TypeScript assignability.
 * The function does not compare parameter types, return types, generic constraints, or generic defaults.
 *
 * Supply the same custom modifier vocabulary used for classification and content resolution.
 * Unsupported references, ambiguous overloads, and incompatible parameters produce diagnostics.
 * The function does not query the compiler, change the facts, or copy inherited content.
 *
 * @param facts - Analysis facts extracted with documentation lookup support.
 * @param options - Explicit custom modifier configuration. Pass an empty object for standard TSDoc tags only.
 * @returns Deeply frozen bindings sorted by source signature identifier, or diagnostics without partial bindings.
 * @throws If declaration or signature identifiers are not unique, a target fact is missing,
 * or an unexpected processing error occurs.
 */
export function bindDocumentationReferences(
	facts: AnalysisFacts,
	options: TsdocOptions,
): Result<readonly DocumentationReferenceBinding[]> {
	const declarations = new Map(
		facts.declarations.map((declaration) => [declaration.id, declaration]),
	);
	assert.equal(
		declarations.size,
		facts.declarations.length,
		"Declaration facts must have distinct identities.",
	);
	const signatureIds = facts.declarations.flatMap((declaration) =>
		declaration.signatures.map((signature) => signature.id),
	);
	assert.equal(
		new Set(signatureIds).size,
		signatureIds.length,
		"Signature facts must have distinct identities.",
	);
	const bindings: DocumentationReferenceBinding[] = [];
	const configured = createTsdocConfiguration(
		options,
		DiagnosticCode.DocumentationConfiguration,
	);
	if (!configured.ok) {
		return configured;
	}
	const parser = new TSDocParser(configured.value);
	for (const declaration of facts.declarations) {
		for (const signature of declaration.signatures) {
			const parsed = parser.parseString(signature.documentation ?? "/** */");
			if (parsed.log.messages.length > 0) {
				return failure(
					DiagnosticCode.DocumentationTsdoc,
					`Item ${signature.id}: correct the TSDoc comment: ${parsed.log.messages.map((message) => message.text).join("; ")}`,
				);
			}
			const request = parsed.docComment.inheritDocTag;
			if (request === undefined) {
				continue;
			}
			const context = signature.documentationContext;
			const lookup = context?.inheritance;
			if (!context || !lookup || lookup.status === "unsupported") {
				return failure(
					DiagnosticCode.DocumentationUnsupported,
					`Item ${signature.id}: use an unqualified standalone function reference and fresh compiler documentation facts. Qualified references and selectors are not supported yet.`,
				);
			}
			if (lookup.reference !== request.declarationReference?.emitAsTsdoc()) {
				return failure(
					DiagnosticCode.DocumentationReference,
					`Item ${signature.id}: documentation lookup facts are stale. Analyze the changed comment again.`,
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
			if (
				target.declarations.length === 0 ||
				target.declarations.some((source) => source.kind !== "FunctionDeclaration")
			) {
				return failure(
					DiagnosticCode.DocumentationUnsupported,
					`Item ${signature.id}: target ${lookup.reference} must be a standalone function.`,
				);
			}
			if (target.signatures.length !== 1) {
				// TODO (Stage 2 overload binding): Support explicit TSDoc selectors and match signatures.
				// Do not select the first overload or compare printed signature text to choose a target.
				return failure(
					DiagnosticCode.DocumentationReference,
					`Item ${signature.id}: target ${lookup.reference} has ${target.signatures.length} callable signatures. Supply local documentation until overload selection is supported.`,
				);
			}
			const targetSignature = target.signatures[0];
			assert.ok(targetSignature, "Single-signature targets must have a signature.");
			const targetContext = targetSignature.documentationContext;
			if (targetContext?.origin.packageName !== context.origin.packageName) {
				return failure(
					DiagnosticCode.DocumentationUnsupported,
					`Item ${signature.id}: target ${lookup.reference} requires same-package standalone function facts. Cross-package targets require future suite resolution.`,
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
	}
	return freezeData({
		ok: true,
		value: bindings.sort((left, right) =>
			left.source < right.source ? -1 : left.source > right.source ? 1 : 0,
		),
	});
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
 * Binds and validates API links in local standalone function comments.
 *
 * @remarks
 * Internal operation. Should not be exported from the package entrypoint.
 * Supply original signature classification from the same analysis, not a selected report view
 * or metadata from inherited comments. This operation does not recompute classification.
 * Targets must be same-package standalone functions with exactly one callable signature.
 * Parameter compatibility is not required for links.
 * Public, beta, and alpha sources can link to each other, but cannot link to internal targets.
 * Internal sources can link to any release level. Missing release levels produce diagnostics.
 * Repeated links retain separate indices. URL links require no lookup or network access.
 * This operation does not resolve inherited content or change report behavior.
 *
 * @param facts - Detached analysis facts with original-scope API link lookups.
 * @param classification - Original classification, including unselected link targets.
 * @param options - Explicit custom modifier configuration shared with classification.
 * @returns Deeply frozen bindings sorted by source identifier and link index, or diagnostics without partial bindings.
 * @throws If declaration, signature, or metadata identifiers are not unique, a resolved target fact is missing,
 * or an unexpected processing error occurs.
 */
export function bindDocumentationLinks(
	facts: AnalysisFacts,
	classification: ApiClassification,
	options: TsdocOptions,
): Result<readonly DocumentationLinkBinding[]> {
	const declarations = new Map(
		facts.declarations.map((declaration) => [declaration.id, declaration]),
	);
	assert.equal(
		declarations.size,
		facts.declarations.length,
		"Declaration facts must have distinct identities.",
	);
	const signatures = facts.declarations.flatMap((declaration) => declaration.signatures);
	assert.equal(
		new Set(signatures.map((signature) => signature.id)).size,
		signatures.length,
		"Signature facts must have distinct identities.",
	);
	const metadata = new Map(classification.items.map((entry) => [entry.id, entry]));
	assert.equal(
		metadata.size,
		classification.items.length,
		"Classification metadata must have distinct identities.",
	);
	const configured = createTsdocConfiguration(
		options,
		DiagnosticCode.DocumentationConfiguration,
	);
	if (!configured.ok) {
		return configured;
	}
	const parser = new TSDocParser(configured.value);
	const bindings: DocumentationLinkBinding[] = [];
	for (const declaration of facts.declarations) {
		for (const signature of declaration.signatures) {
			const parsed = parser.parseString(signature.documentation ?? "/** */");
			if (parsed.log.messages.length > 0) {
				return failure(
					DiagnosticCode.DocumentationTsdoc,
					`Item ${signature.id}: correct the TSDoc comment: ${parsed.log.messages.map((message) => message.text).join("; ")}`,
				);
			}
			const references = apiLinkNodes(parsed.docComment).map((node) =>
				node.codeDestination?.emitAsTsdoc(),
			);
			const context = signature.documentationContext;
			if (context === undefined) {
				if (references.length === 0) {
					continue;
				}
				return failure(
					DiagnosticCode.DocumentationUnsupported,
					`Item ${signature.id}: API links require original standalone function documentation context. Analyze supported declarations again.`,
				);
			}
			if (
				references.length !== context.links.length ||
				references.some((reference, index) => reference !== context.links[index]?.reference)
			) {
				return failure(
					DiagnosticCode.DocumentationReference,
					`Item ${signature.id}: API link lookup facts are stale. Analyze the changed comment again.`,
				);
			}
			for (const [linkIndex, lookup] of context.links.entries()) {
				if (
					declaration.declarations.length === 0 ||
					declaration.declarations.some((source) => source.kind !== "FunctionDeclaration")
				) {
					return failure(
						DiagnosticCode.DocumentationUnsupported,
						`Item ${signature.id}: API link sources must be standalone functions in this increment.`,
					);
				}
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
				assert.ok(
					target,
					"Documentation lookup targets must be retained in declaration facts.",
				);
				const targetSignature = target.signatures[0];
				const targetContext = targetSignature?.documentationContext;
				// TODO (Stage 2 link targets): Add declaration-level classification and overload
				// target semantics before accepting other target forms or selecting a signature.
				if (
					target.declarations.length === 0 ||
					target.declarations.some((source) => source.kind !== "FunctionDeclaration") ||
					target.signatures.length !== 1 ||
					targetContext === undefined
				) {
					return failure(
						DiagnosticCode.DocumentationUnsupported,
						`Item ${signature.id}: target ${lookup.reference} requires a standalone function with one callable signature and documentation context. Other declaration forms and overload targets are not supported yet.`,
					);
				}
				assert.ok(targetSignature, "Single-signature targets must have a signature.");
				if (
					targetContext.origin.packageName !== context.origin.packageName ||
					target.declarations.some(
						(source) => source.packageName !== context.origin.packageName,
					)
				) {
					return failure(
						DiagnosticCode.DocumentationUnsupported,
						`Item ${signature.id}: target ${lookup.reference} is outside the original package ${context.origin.packageName}. Cross-package links require future suite resolution.`,
					);
				}
				const sourceLevel = metadata.get(signature.id)?.releaseLevel;
				const targetLevel = metadata.get(targetSignature.id)?.releaseLevel;
				if (sourceLevel === undefined || targetLevel === undefined) {
					return failure(
						DiagnosticCode.DocumentationConfiguration,
						`Item ${signature.id}: supply original classification with explicit release levels for source ${signature.id} and target ${targetSignature.id}. Do not pass a selected report view.`,
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
 * Collects API link nodes in TSDoc tree traversal order, omitting links with URL destinations.
 *
 * @param node - The parsed comment or one of its descendants.
 * @returns Original parsed API link nodes, including repeated references.
 */
function apiLinkNodes(node: DocNode): readonly DocLinkTag[] {
	const own = node instanceof DocLinkTag && node.codeDestination !== undefined ? [node] : [];
	return [...own, ...node.getChildNodes().flatMap(apiLinkNodes)];
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
	 * The resolver checks occurrence correspondence and same-package scope, but does not repeat compiler lookup.
	 */
	readonly bindings: readonly DocumentationLinkBinding[];
	/**
	 * Original classification for all linked targets and receiving APIs, independent of report selection.
	 */
	readonly classification: ApiClassification;
}

/**
 * Parser configuration and optional API link validation inputs for documentation resolution.
 */
export interface DocumentationResolutionOptions extends TsdocOptions {
	/**
	 * Original link bindings and classification required when comments contain API links.
	 *
	 * @defaultValue Omitted. Only comments without API links can be resolved.
	 */
	readonly linkValidation?: DocumentationLinkValidation;
}

/**
 * Documentation after the resolver applies explicit inheritance.
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
	 * The comment printed by TSDoc after inheritance, or `undefined` when the local comment is absent.
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
	 * Empty when the item has no explicit inheritance request.
	 */
	readonly inheritedFrom: readonly ApiItemId[];
}

/**
 * Copies documentation for explicit inheritance requests whose targets are in the same package.
 *
 * @remarks
 * Uses the official TSDoc parser and printer.
 * Processes all supplied items, regardless of report selection, without changing the inputs.
 * An absent or empty target comment supplies no inherited descriptive content.
 * A target comment that contains only metadata tags also supplies no descriptive content.
 * Local modifier tags and blocks that are not inherited remain unchanged.
 * Target release tags are not copied.
 *
 * Each explicit request requires exactly one matching {@link DocumentationReferenceBinding}.
 * A binding uses the declaration reference printed by TSDoc and a target from the original comment's package.
 * The internal reference binder looks up targets in supported compiler facts.
 *
 * Custom modifier tags require the same vocabulary used for classification and reference binding.
 * Supply original API link bindings and classification through the link validation options.
 * Links retain their original context when sections are inherited. Each receiving API is checked
 * against the target's original release level; non-internal APIs cannot link to internal targets.
 * Missing, duplicate, stale, or unused bindings produce diagnostics without partial results.
 * This function does not support automatic member inheritance, custom block or inline tags, or cross-package links.
 * Inheritance requests for other packages produce diagnostics.
 * Links to URLs remain unchanged. The function does not access or validate their destinations.
 *
 * @param items - Local comments with distinct identifiers and original package names.
 * @param bindings - Associations between inheritance requests and their resolved targets.
 * @param options - Custom modifiers and link validation inputs. Defaults to standard tags and no API link bindings.
 * @returns Deeply frozen comments and inheritance paths sorted by item identifier,
 * or diagnostics without a partial value.
 * @throws If an internal invariant fails or an unexpected processing error occurs.
 */
export function resolveDocumentation(
	items: readonly DocumentationInput[],
	bindings: readonly DocumentationReferenceBinding[],
	options: DocumentationResolutionOptions = {},
): Result<readonly ResolvedDocumentation[]> {
	const ordered = [...items].sort((left, right) =>
		left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
	);
	const inputs = new Map(items.map((item) => [item.id, item]));
	if (
		inputs.size !== items.length ||
		items.some((item) => item.packageName.trim().length === 0)
	) {
		return failure(
			DiagnosticCode.DocumentationConfiguration,
			"Supply distinct documentation item identities and non-blank originating package names.",
		);
	}
	const indexedTargets = indexInheritanceBindings(inputs, bindings);
	if (!indexedTargets.ok) {
		return indexedTargets;
	}
	const targets = indexedTargets.value;
	const configured = createTsdocConfiguration(
		options,
		DiagnosticCode.DocumentationConfiguration,
	);
	if (!configured.ok) {
		return configured;
	}
	const parser = new TSDocParser(configured.value);
	const indexedLinks = indexDocumentationLinks(inputs, options.linkValidation);
	if (!indexedLinks.ok) {
		return indexedLinks;
	}
	const { metadata, linksBySource } = indexedLinks.value;
	const parsed = parseDocumentationInputs(
		ordered,
		inputs,
		targets,
		parser,
		linksBySource,
		options.linkValidation !== undefined,
	);
	if (!parsed.ok) {
		return parsed;
	}
	const { comments, nodesToBindings } = parsed.value;
	const resolved = new Map<ApiItemId, ResolvedDocumentation>();
	const visiting = new Set<ApiItemId>();
	const results: ResolvedDocumentation[] = [];
	const state: DocumentationTraversalState = {
		inputs,
		targets,
		comments,
		nodesToBindings,
		metadata,
		resolved,
		visiting,
	};
	for (const item of ordered) {
		const result = resolveDocumentationItem(item.id, state);
		if (!result.ok) {
			return result;
		}
		results.push(result.value);
	}
	return freezeData({ ok: true, value: results });
}

/**
 * Validates inheritance binding identities and indexes them by source.
 *
 * @param inputs - Documentation inputs indexed by unique identifier.
 * @param bindings - Explicit inheritance bindings for this request.
 * @returns A new binding index, or diagnostics for duplicate or missing identities.
 */
function indexInheritanceBindings(
	inputs: ReadonlyMap<ApiItemId, DocumentationInput>,
	bindings: readonly DocumentationReferenceBinding[],
): Result<ReadonlyMap<ApiItemId, DocumentationReferenceBinding>> {
	const targets = new Map<ApiItemId, DocumentationReferenceBinding>();
	for (const binding of bindings) {
		if (
			targets.has(binding.source) ||
			!inputs.has(binding.source) ||
			!inputs.has(binding.target)
		) {
			return failure(
				DiagnosticCode.DocumentationReference,
				`Item ${binding.source}: supply one inheritance binding with source and target identities from this request.`,
			);
		}
		targets.set(binding.source, binding);
	}
	return { ok: true, value: targets };
}

/**
 * Validates original link identities and scope before indexing bindings and metadata.
 *
 * @param inputs - Documentation inputs indexed by unique identifier.
 * @param validation - Explicit link validation inputs, or `undefined` for comments without API links.
 * @returns New request-local indexes, or diagnostics without partial indexes.
 */
function indexDocumentationLinks(
	inputs: ReadonlyMap<ApiItemId, DocumentationInput>,
	validation: DocumentationLinkValidation | undefined,
): Result<{
	readonly metadata: ReadonlyMap<ApiItemId, ApiItemMetadata>;
	readonly linksBySource: ReadonlyMap<
		ApiItemId,
		ReadonlyMap<number, DocumentationLinkBinding>
	>;
}> {
	const linksBySource = new Map<ApiItemId, Map<number, DocumentationLinkBinding>>();
	const metadata = new Map(validation?.classification.items.map((entry) => [entry.id, entry]));
	if (metadata.size !== (validation?.classification.items.length ?? 0)) {
		return failure(
			DiagnosticCode.DocumentationConfiguration,
			"Supply distinct original classification identities for documentation link validation.",
		);
	}
	for (const link of validation?.bindings ?? []) {
		const source = inputs.get(link.source);
		const target = inputs.get(link.targetSignature);
		const sourceLinks =
			linksBySource.get(link.source) ?? new Map<number, DocumentationLinkBinding>();
		if (
			source === undefined ||
			target === undefined ||
			!Number.isInteger(link.linkIndex) ||
			link.linkIndex < 0 ||
			sourceLinks.has(link.linkIndex)
		) {
			return failure(
				DiagnosticCode.DocumentationReference,
				`Item ${link.source}: supply one API link binding per original occurrence with source and target signature inputs from this request.`,
			);
		}
		if (
			link.origin.packageName !== source.packageName ||
			target.packageName !== source.packageName
		) {
			return failure(
				DiagnosticCode.DocumentationUnsupported,
				`Item ${link.source}: API link ${link.reference} must retain its original same-package source and target context.`,
			);
		}
		sourceLinks.set(link.linkIndex, link);
		linksBySource.set(link.source, sourceLinks);
	}
	return { ok: true, value: { metadata, linksBySource } };
}

/**
 * Parses original comments and validates their link and inheritance bindings.
 *
 * @param ordered - Inputs in diagnostic evaluation order.
 * @param inputs - All request inputs indexed by identifier.
 * @param targets - Validated inheritance binding identities.
 * @param parser - The parser configured for this request's tag vocabulary.
 * @param linksBySource - Validated original link identities and occurrence indices.
 * @param hasLinkValidation - Whether link validation inputs were supplied.
 * @returns Request-owned mutable comments and original link-node associations, or diagnostics.
 */
function parseDocumentationInputs(
	ordered: readonly DocumentationInput[],
	inputs: ReadonlyMap<ApiItemId, DocumentationInput>,
	targets: ReadonlyMap<ApiItemId, DocumentationReferenceBinding>,
	parser: TSDocParser,
	linksBySource: ReadonlyMap<ApiItemId, ReadonlyMap<number, DocumentationLinkBinding>>,
	hasLinkValidation: boolean,
): Result<{
	readonly comments: ReadonlyMap<ApiItemId, DocComment>;
	readonly nodesToBindings: ReadonlyMap<DocLinkTag, DocumentationLinkBinding>;
}> {
	const comments = new Map<ApiItemId, DocComment>();
	const nodesToBindings = new Map<DocLinkTag, DocumentationLinkBinding>();
	for (const item of ordered) {
		const parsed = parser.parseString(item.documentation ?? "/** */");
		if (parsed.log.messages.length > 0) {
			return failure(
				DiagnosticCode.DocumentationTsdoc,
				`Item ${item.id}: correct the TSDoc comment: ${parsed.log.messages.map((message) => message.text).join("; ")}`,
			);
		}
		const comment = parsed.docComment;
		const linkNodes = apiLinkNodes(comment);
		if (linkNodes.length > 0 && !hasLinkValidation) {
			return failure(
				DiagnosticCode.DocumentationUnsupported,
				`Item ${item.id}: supply original API link bindings and classification through linkValidation before resolving this comment.`,
			);
		}
		const sourceLinks = linksBySource.get(item.id);
		if (linkNodes.length !== (sourceLinks?.size ?? 0)) {
			return failure(
				DiagnosticCode.DocumentationReference,
				`Item ${item.id}: API link bindings are missing or unused. Bind the current original comment again.`,
			);
		}
		for (const [linkIndex, node] of linkNodes.entries()) {
			const link = sourceLinks?.get(linkIndex);
			if (link === undefined || link.reference !== node.codeDestination?.emitAsTsdoc()) {
				return failure(
					DiagnosticCode.DocumentationReference,
					`Item ${item.id}: API link binding ${linkIndex} is missing or stale. Bind the current original comment again.`,
				);
			}
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
			if (binding?.reference !== reference.emitAsTsdoc()) {
				return failure(
					DiagnosticCode.DocumentationReference,
					`Item ${item.id}: supply one binding for ${reference.emitAsTsdoc()} in package ${item.packageName}.`,
				);
			}
			const target = inputs.get(binding.target);
			assert.ok(target, "Validated documentation bindings must have target inputs.");
			if (target.packageName !== item.packageName) {
				return failure(
					DiagnosticCode.DocumentationUnsupported,
					`Item ${item.id}: target ${target.id} belongs to ${target.packageName}. Cross-package inheritance requires suite resolution, which is not supported yet.`,
				);
			}
		} else if (binding !== undefined) {
			return failure(
				DiagnosticCode.DocumentationReference,
				`Item ${item.id}: remove the binding because the local comment has no inheritance request.`,
			);
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
	// TODO (Stage 2 automatic inheritance): Use ancestor facts when the local comment is absent.
	// Any local comment stops automatic inheritance. Report conflicts between ancestors and
	// ambiguous overload or parameter matches. Do not choose an ancestor by declaration order.
	const binding = targets.get(id);
	let inheritedFrom: readonly ApiItemId[] = [];
	if (binding !== undefined) {
		const target = resolveDocumentationItem(binding.target, state);
		if (!target.ok) {
			return target;
		}
		const inherited = comments.get(binding.target);
		assert.ok(inherited, "Resolved documentation targets must have parsed comments.");
		copyInheritedSections(comment, inherited);
		inheritedFrom = [binding.target, ...target.value.inheritedFrom];
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
		documentation: item.documentation === undefined ? undefined : comment.emitAsTsdoc(),
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
		const sourceLevel = metadata.get(id)?.releaseLevel;
		const targetLevel = metadata.get(link.targetSignature)?.releaseLevel;
		if (sourceLevel === undefined || targetLevel === undefined) {
			return failure(
				DiagnosticCode.DocumentationConfiguration,
				`Item ${id}: supply original release levels for receiving API ${id} and link target ${link.targetSignature}.`,
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

import assert from "node:assert/strict";
import { DocLinkTag, TSDocParser, type DocComment, type DocNode } from "@microsoft/tsdoc";
import type { AnalysisFacts, ApiItemId } from "./facts.js";
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
			if (!targetContext || targetContext.origin.packageName !== context.origin.packageName) {
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
 * Documentation after the resolver applies explicit inheritance.
 */
export interface ResolvedDocumentation extends DocumentationInput {
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
 * This function does not support automatic member inheritance, custom block or inline tags, or API link resolution.
 * API links and inheritance requests for other packages produce diagnostics.
 * Links to URLs remain unchanged. The function does not access or validate their destinations.
 *
 * @param items - Local comments with distinct identifiers and original package names.
 * @param bindings - Associations between inheritance requests and their resolved targets.
 * @param options - Custom modifier tags. Defaults to standard TSDoc tags only.
 * @returns Deeply frozen comments and inheritance paths sorted by item identifier,
 * or diagnostics without a partial value.
 * @throws If an internal invariant fails or an unexpected processing error occurs.
 */
export function resolveDocumentation(
	items: readonly DocumentationInput[],
	bindings: readonly DocumentationReferenceBinding[],
	options: TsdocOptions = {},
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
	// TODO (Stage 2 report integration): Run binding and content resolution before report construction.
	// Keep the original classification inputs and propagate resolution diagnostics.
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
	const configured = createTsdocConfiguration(
		options,
		DiagnosticCode.DocumentationConfiguration,
	);
	if (!configured.ok) {
		return configured;
	}
	const parser = new TSDocParser(configured.value);
	const comments = new Map<ApiItemId, DocComment>();
	for (const item of ordered) {
		const parsed = parser.parseString(item.documentation ?? "/** */");
		if (parsed.log.messages.length > 0) {
			return failure(
				DiagnosticCode.DocumentationTsdoc,
				`Item ${item.id}: correct the TSDoc comment: ${parsed.log.messages.map((message) => message.text).join("; ")}`,
			);
		}
		const comment = parsed.docComment;
		// TODO (Stage 2 documentation resolution): Resolve API links into structured targets and
		// validate reference policies before accepting them, including links in inherited content.
		// Consume FunctionDocumentationContext.links with original classification metadata.
		// Permit links between different release levels independently of report selection, but reject non-internal-to-internal links.
		if (hasApiLink(comment)) {
			return failure(
				DiagnosticCode.DocumentationUnsupported,
				`Item ${item.id}: API link resolution is not supported by this resolver increment. Supply comments without API links until target resolution is available.`,
			);
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
			if (binding === undefined || binding.reference !== reference.emitAsTsdoc()) {
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
	const resolved = new Map<ApiItemId, ResolvedDocumentation>();
	const visiting = new Set<ApiItemId>();
	/**
	 * Resolves one item after resolving its inheritance target.
	 *
	 * @param id - The identifier of an item that passed input validation.
	 * @returns The resolved item, or a diagnostic if its inheritance path contains a cycle.
	 */
	function visit(id: ApiItemId): Result<ResolvedDocumentation> {
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
			const target = visit(binding.target);
			if (!target.ok) {
				return target;
			}
			const inherited = comments.get(binding.target);
			assert.ok(inherited, "Resolved documentation targets must have parsed comments.");
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
			inheritedFrom = [binding.target, ...target.value.inheritedFrom];
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
		};
		visiting.delete(id);
		resolved.set(id, value);
		return { ok: true, value };
	}
	const results: ResolvedDocumentation[] = [];
	for (const item of ordered) {
		const result = visit(item.id);
		if (!result.ok) {
			return result;
		}
		results.push(result.value);
	}
	return freezeData({ ok: true, value: results });
}

/**
 * Checks for API links that require target validation.
 *
 * @param node - A node from the official TSDoc parser.
 * @returns Whether the node or its descendants contain an API link.
 */
function hasApiLink(node: DocNode): boolean {
	if (node instanceof DocLinkTag && node.codeDestination !== undefined) {
		return true;
	}
	return node.getChildNodes().some(hasApiLink);
}

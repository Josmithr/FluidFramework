import assert from "node:assert/strict";
import { ReleaseLevel, selectApiItems } from "../analysis-types/classification.js";
import type { ApiItemId, DeclarationFact } from "../analysis-types/facts.js";
import type { DocumentationReferenceBinding } from "../analysis-types/documentation.js";
import { DiagnosticCode, failure, type Result } from "../analysis-types/result.js";
import type { AnalysisContext, AnalysisDocumentationInput } from "./documentationContext.js";

/**
 * A directional rule compiled into original source and target API identities.
 */
interface ResolvedDirectionalRule {
	/**
	 * Diagnostic name of the configured rule.
	 */
	readonly name: string;
	/**
	 * APIs whose outgoing references are restricted.
	 */
	readonly source: ReadonlySet<ApiItemId>;
	/**
	 * Targets forbidden for the matching sources.
	 */
	readonly target: ReadonlySet<ApiItemId>;
}

/**
 * Original declarations exposed by one entrypoint, including nested namespace exports.
 */
interface EntrypointExposure {
	/**
	 * Configured entrypoint name used in diagnostics.
	 */
	readonly name: string;
	/**
	 * Declaration identities exposed by this entrypoint's export graph.
	 */
	readonly declarations: ReadonlySet<ApiItemId>;
}

/**
 * Validates configured declaration policies from detached facts and original metadata.
 *
 * @param context - Completed extraction and original classification for the invocation.
 * @param inheritance - Validated explicit documentation inheritance bindings.
 * @returns Success or an actionable policy diagnostic without partial results.
 */
export function validateReferencePolicies(
	context: AnalysisContext,
	inheritance: readonly DocumentationReferenceBinding[],
): Result<void> {
	const policies = context.referencePolicies;
	const directional = resolveDirectionalRules(context);
	if (!directional.ok) return directional;
	const inspectTypes =
		policies.releaseCompatibility === true ||
		policies.entrypointExposure === true ||
		directional.value.length > 0;
	if (inspectTypes) {
		// Export reachability is invariant across references, so compute it only once per entrypoint.
		const exposure = policies.entrypointExposure === true ? entrypointExposure(context) : [];
		const references = validateTypeReferences(context, directional.value, exposure);
		if (!references.ok) return references;
	}
	return policies.inheritanceVisibility === true
		? validateInheritanceVisibility(context, inheritance)
		: { ok: true, value: undefined };
}

/**
 * Resolves enabled directional selectors against both local and dependency metadata.
 * @param context - Original classification and configured policies for this invocation.
 * @returns Ordered rules, or the first invalid selector diagnostic. Disabled rules are omitted.
 */
function resolveDirectionalRules(
	context: AnalysisContext,
): Result<readonly ResolvedDirectionalRule[]> {
	// Dependency metadata participates even when its APIs are absent from the selected review surface.
	const classification = {
		items: [...context.metadata.values()],
		modifierTags: [
			...new Set([
				...context.classification.modifierTags,
				...context.dependencies.flatMap((model) => model.modifierTags),
			]),
		],
	};
	const directional: ResolvedDirectionalRule[] = [];
	for (const rule of context.referencePolicies.directional ?? []) {
		if (rule.enabled === false) continue;
		const source = selectApiItems(classification, { ...rule.source, name: rule.name });
		if (!source.ok) return source;
		const target = selectApiItems(classification, { ...rule.target, name: rule.name });
		if (!target.ok) return target;
		directional.push({
			name: rule.name,
			source: new Set(source.value.items.map((item) => item.id)),
			target: new Set(target.value.items.map((item) => item.id)),
		});
	}
	return { ok: true, value: directional };
}

/**
 * Checks each retained type-reference occurrence in original diagnostic order.
 * @param context - Detached facts and original metadata.
 * @param directional - Enabled rules resolved to identity sets.
 * @param exposure - Precomputed entrypoint exposure; empty when that policy is disabled.
 * @returns Success or the first metadata or exposure policy failure.
 */
function validateTypeReferences(
	context: AnalysisContext,
	directional: readonly ResolvedDirectionalRule[],
	exposure: readonly EntrypointExposure[],
): Result<void> {
	for (const item of context.items.values()) {
		const original = item.signature ?? item.declaredMember ?? item.member ?? item.declaration;
		for (const reference of original.documentationContext?.typeReferences ?? []) {
			const target = context.declarations.get(reference.target);
			assert.ok(target, "Declaration reference targets must be retained in the analysis.");
			const description = `Package ${context.facts.packageName}, ${reference.origin.file}:${reference.origin.start}, API ${item.id}, target ${reference.text} (${target.id})`;
			const metadata = validateReferenceMetadata(
				context,
				item.id,
				target,
				directional,
				description,
			);
			if (!metadata.ok) return metadata;
			const visible = validateEntrypointExposure(context, item, target, exposure, description);
			if (!visible.ok) return visible;
		}
	}
	return { ok: true, value: undefined };
}

/**
 * Checks release compatibility and directional restrictions for a single reference.
 * @param context - Original metadata and policy settings.
 * @param source - Referring API identity.
 * @param target - Compiler-resolved target declaration.
 * @param directional - Enabled directional rules in configured order.
 * @param description - Reference location and identity used in diagnostics.
 * @returns Success or the first enabled metadata policy failure.
 */
function validateReferenceMetadata(
	context: AnalysisContext,
	source: ApiItemId,
	target: DeclarationFact,
	directional: readonly ResolvedDirectionalRule[],
	description: string,
): Result<void> {
	if (context.referencePolicies.releaseCompatibility !== true && directional.length === 0)
		return { ok: true, value: undefined };
	// Declaration-level metadata takes precedence; otherwise inspect each callable overload independently.
	const targets = context.metadata.has(target.id)
		? [target.id]
		: target.signatures.map((signature) => signature.id);
	if (targets.length === 0)
		return failure(
			DiagnosticCode.ReferencePolicy,
			`${description}: reference target classification is unavailable for this declaration form.`,
		);
	const sourceLevel = context.metadata.get(source)?.releaseLevel;
	for (const targetId of targets) {
		const targetLevel = context.metadata.get(targetId)?.releaseLevel;
		if (context.referencePolicies.releaseCompatibility === true) {
			if (sourceLevel === undefined || targetLevel === undefined)
				return failure(
					DiagnosticCode.ReferencePolicy,
					`${description}: release compatibility requires original release tags on both APIs.`,
				);
			if (sourceLevel < targetLevel)
				return failure(
					DiagnosticCode.ReferencePolicy,
					`${description}: releaseCompatibility forbids a reference to a less stable API. Correct the API relationship or disable this rule.`,
				);
		}
		const violated = directional.find(
			(rule) => rule.source.has(source) && rule.target.has(targetId),
		);
		if (violated)
			return failure(
				DiagnosticCode.ReferencePolicy,
				`${description}: directional rule ${violated.name} forbids this reference. Correct the relationship or disable this rule.`,
			);
	}
	return { ok: true, value: undefined };
}

/**
 * Computes namespace export reachability once per entrypoint.
 * @param context - Detached entrypoint bindings and declaration index.
 * @returns Exposure sets in the original surface order.
 */
function entrypointExposure(context: AnalysisContext): EntrypointExposure[] {
	return context.facts.surfaces.map((surface) => {
		const declarations = new Set(surface.exports.map((binding) => binding.target));
		// Set iteration also visits newly added exports; repeated identities terminate namespace cycles.
		for (const id of declarations) {
			for (const binding of context.declarations.get(id)?.exports ?? [])
				declarations.add(binding.target);
		}
		return { name: surface.name, declarations };
	});
}

/**
 * Requires same-package targets to be exposed wherever the referring declaration is exposed.
 * @param context - Package identity for distinguishing local and dependency targets.
 * @param item - Original referring documentation input.
 * @param target - Referenced declaration.
 * @param exposure - Enabled entrypoint exposure sets; empty when the policy is disabled.
 * @param description - Reference location and identity used in diagnostics.
 * @returns Success or the first entrypoint exposure failure.
 */
function validateEntrypointExposure(
	context: AnalysisContext,
	item: AnalysisDocumentationInput,
	target: DeclarationFact,
	exposure: readonly EntrypointExposure[],
	description: string,
): Result<void> {
	// Dependency types can be used without re-exporting them from the consumer.
	if (target.declarations.some((source) => source.packageName === context.facts.packageName)) {
		for (const surface of exposure) {
			if (
				surface.declarations.has(item.declaration.id) &&
				!surface.declarations.has(target.id)
			)
				return failure(
					DiagnosticCode.ReferencePolicy,
					`${description}: entrypointExposure requires the same-package target in entrypoint ${surface.name}. Export the target or change the reference. Dependency types do not require consumer re-exports.`,
				);
		}
	}
	return { ok: true, value: undefined };
}

/**
 * Applies the explicit-inheritance visibility rule without changing inherited content or metadata.
 * @param context - Original source and target release metadata.
 * @param inheritance - Validated explicit inheritance bindings in diagnostic order.
 * @returns Success or the first missing-metadata or internal-target failure.
 */
function validateInheritanceVisibility(
	context: AnalysisContext,
	inheritance: readonly DocumentationReferenceBinding[],
): Result<void> {
	for (const binding of inheritance) {
		const source = context.metadata.get(binding.source)?.releaseLevel;
		const target = context.metadata.get(binding.target)?.releaseLevel;
		if (source === undefined || target === undefined)
			return failure(
				DiagnosticCode.ReferencePolicy,
				`Package ${context.facts.packageName}, API ${binding.source}, target ${binding.reference}: inheritanceVisibility requires original release tags.`,
			);
		if (source !== ReleaseLevel.Internal && target === ReleaseLevel.Internal)
			return failure(
				DiagnosticCode.ReferencePolicy,
				`Package ${context.facts.packageName}, API ${binding.source}, target ${binding.reference}: inheritanceVisibility forbids explicit inheritance from internal APIs.`,
			);
	}
	return { ok: true, value: undefined };
}

import type { DependencyModel } from "../analysis-types/dependencyModel.js";
import { ReleaseLevel } from "../analysis-types/classification.js";
import { DiagnosticCode, reportFailure, type Result } from "../analysis-types/result.js";
import { freezeData } from "../utilities/freezeData.js";
import { decodeDependencyModel, fingerprintDependencyModel } from "./dependencyModel.js";

/**
 * Decodes a complete artifact set without filesystem access or semantic reference resolution.
 *
 * @remarks
 * Rejects duplicate packages and identities, missing recorded dependencies, stale dependency content,
 * and invalid cross-package targets. Input order does not affect the returned package order.
 * Development artifacts require regeneration after schema or identity changes, even though version markers stay at 1.
 * This function does not restore analysis.
 *
 * @param inputs - Expected package names and their serialized artifact content.
 * @returns Frozen models sorted by package name, or artifact and dependency-integrity diagnostics.
 * @public
 */
export function decodeDependencyModels(
	inputs: readonly { readonly packageName: string; readonly text: string }[],
): Result<readonly DependencyModel[]> {
	const models: DependencyModel[] = [];
	for (const input of inputs) {
		const decoded = decodeDependencyModel(input.text, input.packageName);
		if (!decoded.ok) {
			return decoded;
		}
		models.push(decoded.value);
	}

	// Cross-package targets can appear in any input position; validate only after every model is decoded.
	const validated = validateDependencyModels(models);
	return validated.ok
		? freezeData({
				ok: true,
				value: models.sort((left, right) =>
					left.packageName < right.packageName
						? -1
						: left.packageName > right.packageName
							? 1
							: 0,
				),
			})
		: validated;
}

/**
 * Checks dependency content and cross-package identities on individually validated models.
 * @param models - Decoded models supplied by artifact readers or installed-suite loading.
 * @returns Success or the first duplicate, missing, stale, or invalid reference diagnostic.
 */
export function validateDependencyModels(models: readonly DependencyModel[]): Result {
	// Index the complete set before checking references so validation does not depend on package order.
	const fingerprints = new Map(
		models.map((model) => [model.packageName, fingerprintDependencyModel(model)]),
	);
	const allApis = models.flatMap((model) => model.apis);
	const apis = new Map(allApis.map((api) => [api.id, api]));
	const targets = new Map(
		models.flatMap((model) => model.apis.map((api) => [api.id, model.packageName] as const)),
	);

	// Maps overwrite duplicate keys. Reject those collisions before using an ambiguous package or API target.
	if (fingerprints.size !== models.length || apis.size !== allApis.length) {
		return reportFailure(
			DiagnosticCode.DependencyModel,
			"Documentation artifacts contain duplicate packages or API identities. Supply one unambiguous model per package.",
		);
	}
	for (const model of models) {
		// Resolved content can be stale even when this package's own declarations are unchanged.
		// Check every recorded dependency, including packages unused by the current documentation page.
		for (const dependency of model.dependencyModels) {
			if (fingerprints.get(dependency.packageName) !== dependency.sha256) {
				return reportFailure(
					DiagnosticCode.DependencyModel,
					`Dependency ${model.packageName}: its model was generated from missing or different ${dependency.packageName} model content. Select the required dependency model and regenerate ${model.packageName} after its dependencies.`,
				);
			}
		}

		// Finding an external identity is insufficient: the selected model must also match its recorded owner.
		for (const external of model.external) {
			if (targets.get(external.id) !== external.packageName) {
				return reportFailure(
					DiagnosticCode.DependencyModel,
					`Dependency ${model.packageName}: external target ${external.id} requires a compatible selected model for ${external.packageName}. Include and rebuild the transitive suite dependency.`,
				);
			}
		}

		// Package comments have no API release level of their own. Their links require a classified,
		// non-internal target whose declaration and documentation identities agree.
		for (const link of model.packageDocumentation?.links ?? []) {
			const target = apis.get(link.targetSignature);
			if (
				target?.declarationId !== link.target ||
				target.metadata.releaseLevel === undefined ||
				target.metadata.releaseLevel === ReleaseLevel.Internal
			) {
				return reportFailure(
					DiagnosticCode.DependencyModel,
					`Dependency ${model.packageName}: package link ${link.reference} has an invalid or internal target in the selected suite. Regenerate the model.`,
				);
			}
		}

		// Analysis already resolved these links. Verify the stored target pair against the selected artifacts
		// without repeating name lookup or documentation inheritance across packages.
		for (const api of model.apis) {
			if (
				api.documentation.packageName !== api.origin.packageName ||
				api.documentation.sections.some(
					(section) => apis.get(section.source)?.origin.packageName !== section.packageName,
				) === true
			) {
				return reportFailure(
					DiagnosticCode.DependencyModel,
					`Dependency ${model.packageName}: documentation provenance for ${api.id} disagrees with its original source package. Regenerate its model.`,
				);
			}
			for (const link of api.documentation.links) {
				if (apis.get(link.targetSignature)?.declarationId !== link.target) {
					return reportFailure(
						DiagnosticCode.DependencyModel,
						`Dependency ${model.packageName}: link ${link.reference} has inconsistent target identities. Regenerate its model.`,
					);
				}
			}
		}
	}
	return { ok: true };
}

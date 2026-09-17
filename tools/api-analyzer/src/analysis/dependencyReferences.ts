import { SelectorKind, type DocDeclarationReference } from "@microsoft/tsdoc";
import type { DependencyApi } from "../analysis-types/dependencyModel.js";
import type { DocumentationReferenceLookup } from "../analysis-types/facts.js";
import { DiagnosticCode, failure, type Result } from "../analysis-types/result.js";
import type { AnalysisContext } from "./documentationContext.js";

/**
 * Resolves selected dependency documentation by exported path or compiler target identity.
 * @param analysis - Original facts and validated dependency models.
 * @param reference - Parsed reference from the original comment.
 * @param lookup - Original compiler lookup result.
 * @param originalPackage - Package where the referring documentation was written, before re-exports.
 * @returns A dependency target, undefined for a local reference, or a suite diagnostic.
 */
export function dependencyReference(
	analysis: AnalysisContext,
	reference: DocDeclarationReference | undefined,
	lookup: DocumentationReferenceLookup,
	originalPackage: string,
): Result<DependencyApi | undefined> {
	const declaration =
		lookup.status === "resolved" ? analysis.declarations.get(lookup.target) : undefined;
	const packageName = reference?.packageName ?? declaration?.declarations[0]?.packageName;
	if (packageName === undefined || packageName === analysis.facts.packageName)
		return { ok: true, value: undefined };
	const model = analysis.dependencies.find((entry) => entry.packageName === packageName);
	if (!model && packageName === originalPackage) return { ok: true, value: undefined };
	if (!model)
		return failure(
			DiagnosticCode.DocumentationUnsupported,
			`Reference ${lookup.reference}: package ${packageName} is outside the configured suite. Select and build its dependency model.`,
		);
	let candidates: readonly DependencyApi[];
	if (reference?.packageName === undefined) {
		candidates = model.apis.filter(
			(api) =>
				api.id === declaration?.id ||
				(api.declarationId === declaration?.id && api.parameters !== undefined),
		);
	} else {
		if (
			reference.memberReferences.some(
				(part, index) =>
					!part.memberIdentifier ||
					part.memberSymbol !== undefined ||
					(part.selector !== undefined &&
						(index !== reference.memberReferences.length - 1 ||
							part.selector.selectorKind !== SelectorKind.Index)),
			)
		)
			return failure(
				DiagnosticCode.DocumentationUnsupported,
				`Reference ${lookup.reference}: use named exported paths with a terminal numeric callable selector.`,
			);
		const names = reference.memberReferences.map((part) => part.memberIdentifier?.identifier);
		const entrypoint =
			reference.importPath === undefined || reference.importPath === ""
				? "."
				: `./${reference.importPath.replace(/^\.\//, "")}`;
		const exported = model.exports.find(
			(entry) =>
				entry.entrypoint === entrypoint &&
				JSON.stringify(entry.path) === JSON.stringify(names),
		);
		if (!exported)
			return failure(
				DiagnosticCode.DocumentationReference,
				`Dependency ${packageName}: exported target ${lookup.reference} does not exist in the model.`,
			);
		const all = new Map(
			analysis.dependencies.flatMap((dependency) =>
				dependency.apis.map((api) => [api.id, api] as const),
			),
		);
		candidates = exported.items.flatMap((id) => {
			const api = all.get(id);
			return api ? [api] : [];
		});
	}
	const selector = reference?.memberReferences.at(-1)?.selector;
	const ordinal = selector === undefined ? 1 : Number(selector.selector);
	if (
		(selector === undefined && candidates.length !== 1) ||
		!Number.isSafeInteger(ordinal) ||
		ordinal < 1 ||
		ordinal > candidates.length
	)
		return failure(
			DiagnosticCode.DocumentationReference,
			`Dependency ${packageName}: ${lookup.reference} has ${candidates.length} candidates. Supply a valid one-based numeric callable selector.`,
		);
	const selected = candidates[ordinal - 1];
	if (selected === undefined)
		return failure(
			DiagnosticCode.DocumentationReference,
			`Dependency ${packageName}: target ${lookup.reference} is missing from selected models.`,
		);
	if (selector !== undefined && selected.parameters === undefined)
		return failure(
			DiagnosticCode.DocumentationReference,
			`Dependency ${packageName}: non-callable targets do not accept overload selectors.`,
		);
	return { ok: true, value: selected };
}

import { SelectorKind, type DocDeclarationReference } from "@microsoft/tsdoc";
import type {
	DependencyApi,
	DependencyExport,
	DependencyModel,
} from "../analysis-types/dependencyModel.js";
import type { DocumentationReferenceLookup } from "../analysis-types/facts.js";
import { DiagnosticCode, reportFailure, type Result } from "../analysis-types/result.js";
import type { AnalysisContext } from "./documentationContext.js";

/**
 * Resolves selected dependency documentation by exported path or compiler target identity.
 *
 * @remarks
 * Self-package qualified re-exports use the collected target's owning package and identity.
 * Foreign qualified paths use export records from the selected model, including configured subpaths.
 *
 * @param analysis - Original facts and validated dependency models.
 * @param reference - Parsed reference from the original comment.
 * @param lookup - Original compiler lookup result.
 * @param originalPackage - Package where the referring documentation was written, before re-exports.
 * @returns A dependency target, undefined for a local reference, or a suite diagnostic.
 */
export function resolveDependencyReference(
	analysis: AnalysisContext,
	reference: DocDeclarationReference | undefined,
	lookup: DocumentationReferenceLookup,
	originalPackage: string,
): Result<DependencyApi | undefined> {
	const declaration =
		lookup.status === "resolved" ? analysis.declarations.get(lookup.target) : undefined;
	const useCompilerTarget =
		reference?.packageName === undefined ||
		reference.packageName === analysis.facts.packageName;

	// A self-qualified export can re-export another package's API. Its model still owns the documentation.
	const packageName = useCompilerTarget
		? declaration?.declarations[0]?.packageName
		: reference.packageName;
	if (packageName === undefined || packageName === analysis.facts.packageName) {
		return { ok: true, value: undefined };
	}
	const model = analysis.dependencies.find((entry) => entry.packageName === packageName);
	if (!model && packageName === originalPackage) {
		return { ok: true, value: undefined };
	}
	if (!model) {
		return reportFailure(
			DiagnosticCode.DocumentationUnsupported,
			`Reference ${lookup.reference}: package ${packageName} is outside the configured suite. Select and build its dependency model.`,
		);
	}
	let candidates: readonly DependencyApi[];
	if (useCompilerTarget) {
		const records = new Map(model.apis.map((api) => [api.id, api]));
		const own = declaration === undefined ? undefined : records.get(declaration.id);

		// Model APIs are sorted by identity, not declaration order. Numeric selectors use compiler signature order.
		candidates =
			own === undefined
				? (declaration?.signatures ?? []).flatMap((signature) => {
						const api = records.get(signature.id);
						return api === undefined ? [] : [api];
					})
				: [own];
		if (own === undefined && candidates.length !== declaration?.signatures.length) {
			return reportFailure(
				DiagnosticCode.DependencyModel,
				`Dependency ${packageName}: model callable records do not match target ${lookup.reference}. Regenerate the dependency model.`,
			);
		}
	} else {
		const exported = resolveQualifiedExport(model, reference, lookup.reference);
		if (!exported.ok) {
			return exported;
		}
		const all = new Map(
			analysis.dependencies.flatMap((dependency) =>
				dependency.apis.map((api) => [api.id, api] as const),
			),
		);
		candidates = exported.value.items.flatMap((id) => {
			const api = all.get(id);
			return api ? [api] : [];
		});
		if (candidates.length !== exported.value.items.length) {
			return reportFailure(
				DiagnosticCode.DependencyModel,
				`Dependency ${packageName}: exported target ${lookup.reference} requires missing API records from the selected suite.`,
			);
		}
	}
	const terminal = reference?.memberReferences.at(-1)?.selector;
	const selector = terminal?.selectorKind === SelectorKind.Index ? terminal : undefined;
	const ordinal = selector === undefined ? 1 : Number(selector.selector);
	if (
		(selector === undefined && candidates.length !== 1) ||
		!Number.isSafeInteger(ordinal) ||
		ordinal < 1 ||
		ordinal > candidates.length
	) {
		return reportFailure(
			DiagnosticCode.DocumentationReference,
			`Dependency ${packageName}: ${lookup.reference} has ${candidates.length} candidates. Supply a valid one-based numeric callable selector.`,
		);
	}
	const selected = candidates[ordinal - 1];
	if (selected === undefined) {
		return reportFailure(
			DiagnosticCode.DocumentationReference,
			`Dependency ${packageName}: target ${lookup.reference} is missing from selected models.`,
		);
	}
	if (selector !== undefined && selected.parameters === undefined) {
		return reportFailure(
			DiagnosticCode.DocumentationReference,
			`Dependency ${packageName}: non-callable targets do not accept overload selectors.`,
		);
	}
	return { ok: true, value: selected };
}

/**
 * Validates selector syntax and resolves one package-qualified exported target.
 * @param model - Decoded package model whose export paths are validated.
 * @param reference - Parsed qualified reference, including its optional entrypoint path.
 * @param text - Original reference text for diagnostics.
 * @returns The unique export or an unsupported, missing, or ambiguous reference diagnostic.
 */
function resolveQualifiedExport(
	model: DependencyModel,
	reference: DocDeclarationReference,
	text: string,
): Result<DependencyExport> {
	if (
		reference.memberReferences.some(
			(part, index) =>
				part.memberIdentifier === undefined ||
				part.memberSymbol !== undefined ||
				(part.selector !== undefined &&
					(index !== reference.memberReferences.length - 1 ||
						(part.selector.selectorKind !== SelectorKind.Index &&
							!(
								part.selector.selectorKind === SelectorKind.System &&
								["static", "instance"].includes(part.selector.selector)
							)))),
		)
	) {
		return reportFailure(
			DiagnosticCode.DocumentationUnsupported,
			`Reference ${text}: use named exported paths with a terminal numeric, static, or instance selector.`,
		);
	}
	const names = reference.memberReferences.map(
		(part) => part.memberIdentifier?.identifier ?? "",
	);
	const entrypoint =
		reference.importPath === undefined || reference.importPath === ""
			? "."
			: `./${reference.importPath.replace(/^\//, "").replace(/^\.\//, "")}`;
	const selector = reference.memberReferences.at(-1)?.selector;
	const side = selector?.selectorKind === SelectorKind.System ? selector.selector : undefined;
	const matches = findExportedTargets(model, entrypoint, names).filter(
		(entry) => side === undefined || entry.memberKind === side,
	);
	const exported = matches.length === 1 ? matches[0] : undefined;
	return exported === undefined
		? reportFailure(
				DiagnosticCode.DocumentationReference,
				`Dependency ${model.packageName}: exported target ${text} is missing or ambiguous in the model. Specify a member side when static and instance names collide.`,
			)
		: { ok: true, value: exported };
}

/**
 * Resolves an exported path through finite namespace back-references.
 * @param model - Validated model whose namespace aliases point to shorter enclosing paths.
 * @param entrypoint - Configured export surface.
 * @param names - Requested exported path components.
 * @returns Matching terminal paths, including both member sides when ambiguous.
 */
function findExportedTargets(
	model: DependencyModel,
	entrypoint: string,
	names: readonly string[],
): readonly DependencyExport[] {
	let path = names;
	while (true) {
		const exact = model.exports.filter(
			(entry) =>
				entry.entrypoint === entrypoint && JSON.stringify(entry.path) === JSON.stringify(path),
		);
		if (exact.length > 0) {
			return exact;
		}
		const alias = model.exports.find(
			(entry) =>
				entry.entrypoint === entrypoint &&
				entry.referencePath !== undefined &&
				entry.path.length < path.length &&
				entry.path.every((name, index) => name === path[index]),
		);
		if (alias?.referencePath === undefined) {
			return [];
		}

		// Model validation guarantees each substitution shortens the path, so recursive aliases terminate.
		path = [...alias.referencePath, ...path.slice(alias.path.length)];
	}
}

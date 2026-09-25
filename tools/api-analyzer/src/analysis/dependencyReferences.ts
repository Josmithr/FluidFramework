import {
	SelectorKind,
	type DocDeclarationReference,
	type DocMemberReference,
	type DocMemberSelector,
} from "@microsoft/tsdoc";
import type {
	DependencyApi,
	DependencyExport,
	DependencyModel,
} from "../analysis-types/dependencyModel.js";
import type { DocumentationReferenceLookup } from "../analysis-types/facts.js";
import {
	DiagnosticCode,
	reportFailure,
	type Result,
	type SuccessfulResult,
	type FailedResult,
} from "../analysis-types/result.js";
import type { AnalysisContext } from "./documentationContext.js";

/**
 * One documentation candidate with an explicit structural role.
 * @typeParam TValue - Original record returned after selection.
 */
export interface ReferenceCandidate<TValue> {
	/**
	 * Original record without copied documentation.
	 */
	readonly value: TValue;

	/**
	 * Whether this is a declaration facet, callable signature, or declared member.
	 */
	readonly role: "declaration" | "signature" | "member";

	/**
	 * Original syntax kind, used for constructor and compound-function selection.
	 */
	readonly kind: string;

	/**
	 * Original documentation labels.
	 */
	readonly labels: readonly string[];
}

/**
 * Applies terminal selectors identically after local or dependency name lookup.
 * @typeParam TValue - Original candidate record.
 * @param candidates - Complete candidates in compiler overload order.
 * @param terminal - Terminal selector; undefined requires a unique ordinary target.
 * @param reference - Reference text and source description for diagnostics.
 * @param preferCallable - Select a compound function's callable facet for inheritance.
 * @returns One original record, or an ambiguity or selector diagnostic.
 */
export function selectReferenceCandidate<TValue>(
	candidates: readonly ReferenceCandidate<TValue>[],
	terminal: DocMemberSelector | undefined,
	reference: string,
	preferCallable: boolean,
): SuccessfulResult<TValue> | FailedResult {
	const numeric = terminal?.selectorKind === SelectorKind.Index;
	let selected = candidates;
	if (terminal?.selectorKind === SelectorKind.Label || terminal?.selector === "constructor") {
		selected = candidates.filter((candidate) =>
			terminal.selectorKind === SelectorKind.Label
				? candidate.labels.includes(terminal.selector)
				: candidate.kind === "Constructor",
		);
	} else {
		const declaration = candidates.find((candidate) => candidate.role === "declaration");
		if (declaration !== undefined) {
			selected =
				(numeric || preferCallable) && declaration.kind === "FunctionDeclaration"
					? candidates.filter((candidate) => candidate.role === "signature")
					: [declaration];
		}
	}
	const ordinal = numeric ? Number(terminal.selector) : 1;
	if (
		(!numeric && selected.length !== 1) ||
		!Number.isSafeInteger(ordinal) ||
		ordinal < 1 ||
		ordinal > selected.length
	) {
		return reportFailure(
			DiagnosticCode.DocumentationReference,
			`Reference ${reference}: selector ${terminal?.selector ?? "(none)"} identifies ${selected.length} candidates; supply a unique label or a one-based numeric callable selector within range 1..${selected.length}.`,
		);
	}
	const target = selected[ordinal - 1];
	if (target === undefined || (numeric && target.role !== "signature")) {
		return reportFailure(
			DiagnosticCode.DocumentationReference,
			`Reference ${reference}: non-callable targets do not accept overload selectors.`,
		);
	}
	return { ok: true, value: target.value };
}

/**
 * Resolves selected dependency documentation by exported path or compiler target identity.
 *
 * @remarks
 * Self-package qualified re-exports use the collected target's owning package and identity.
 * Foreign qualified paths use export records from the selected model, including configured subpaths.
 * Module targets and import paths without a package name are forbidden, including nested symbol references.
 *
 * @param analysis - Original facts and validated dependency models.
 * @param reference - Parsed reference from the original comment.
 * @param lookup - Original compiler lookup result.
 * @param originalPackage - Package where the referring documentation was written, before re-exports.
 * @param preferCallable - Select the callable facet of a compound function for inheritance. Defaults to false for links.
 * @returns A dependency target, undefined for a local reference, or a suite diagnostic.
 */
export function resolveDependencyReference(
	analysis: AnalysisContext,
	reference: DocDeclarationReference | undefined,
	lookup: DocumentationReferenceLookup,
	originalPackage: string,
	preferCallable = false,
): Result<DependencyApi | undefined> {
	if (reference !== undefined && containsModuleReference(reference)) {
		return reportFailure(
			DiagnosticCode.DocumentationUnsupported,
			`Reference ${lookup.reference}: Module-based documentation references are forbidden. Reference a named API in the original scope or use a package-qualified API such as package-name#Api or package-name/subpath#Api. Whole-module targets and source-relative import paths are not supported.`,
		);
	}
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
		const record = declaration === undefined ? undefined : records.get(declaration.id);
		const selectCallable =
			preferCallable ||
			reference?.memberReferences.at(-1)?.selector?.selectorKind === SelectorKind.Index;
		const own =
			(selectCallable ||
				reference?.memberReferences.at(-1)?.selector?.selectorKind === SelectorKind.Label ||
				reference?.memberReferences.at(-1)?.selector?.selector === "constructor") &&
			declaration?.declarations.some((part) => part.kind === "FunctionDeclaration") === true
				? undefined
				: record;

		// Model APIs are sorted by identity, not declaration order. Numeric selectors use compiler signature order.
		candidates =
			own === undefined
				? (declaration?.signatures ?? []).flatMap((signature) => {
						const api = records.get(signature.id);
						return api === undefined ? [] : [api];
					})
				: [own];
		if (
			reference?.memberReferences.at(-1)?.selector?.selectorKind === SelectorKind.Label ||
			reference?.memberReferences.at(-1)?.selector?.selector === "constructor"
		) {
			candidates = [
				...candidates,
				...(declaration?.container?.declaredMembers ?? []).flatMap((member) => {
					const api = records.get(member.id);
					return api === undefined ? [] : [api];
				}),
			];
		}
		if (own === undefined && candidates.length !== declaration?.signatures.length) {
			return reportFailure(
				DiagnosticCode.DependencyModel,
				`Dependency ${packageName}: model callable records do not match target ${lookup.reference}. Regenerate the dependency model.`,
			);
		}
	} else {
		const all = new Map(
			analysis.dependencies.flatMap((dependency) =>
				dependency.apis.map((api) => [api.id, api] as const),
			),
		);
		const exported = resolveQualifiedExport(
			model,
			analysis.dependencies,
			all,
			reference,
			lookup.reference,
		);
		if (!exported.ok) {
			return exported;
		}
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
	const signatures = new Set(
		analysis.dependencies.flatMap((dependency) =>
			dependency.graph.declarations
				.flatMap((item) => [
					...item.signatures,
					...item.members.flatMap((member) => member.signatures),
				])
				.map((signature) => signature.id),
		),
	);
	return selectReferenceCandidate(
		candidates.map((api) => ({
			value: api,
			role: signatures.has(api.id)
				? "signature"
				: api.id === api.declarationId
					? "declaration"
					: "member",
			kind: api.declarationKinds.includes("FunctionDeclaration")
				? "FunctionDeclaration"
				: api.kind,
			labels: api.labels,
		})),
		reference?.memberReferences.at(-1)?.selector,
		`${packageName}#${lookup.reference}`,
		preferCallable,
	);
}

/**
 * Checks a parsed reference and its nested symbol keys for excluded module-based forms.
 * @param reference - TSDoc declaration reference before target lookup.
 * @returns Whether it targets a whole module or uses an import path without a package name.
 */
function containsModuleReference(reference: DocDeclarationReference): boolean {
	return (
		reference.memberReferences.length === 0 ||
		(reference.packageName === undefined && reference.importPath !== undefined) ||
		reference.memberReferences.some((member) =>
			member.memberSymbol === undefined
				? false
				: containsModuleReference(member.memberSymbol.symbolReference),
		)
	);
}

/**
 * Validates selector syntax and resolves one package-qualified exported target.
 * @param model - Decoded package model whose export paths are validated.
 * @param models - Selected package models available to nested symbol references.
 * @param apis - API records from every selected model, including re-export owners.
 * @param reference - Parsed qualified reference, including its optional entrypoint path.
 * @param text - Original reference text for diagnostics.
 * @returns The unique export or an unsupported, missing, or ambiguous reference diagnostic.
 */
function resolveQualifiedExport(
	model: DependencyModel,
	models: readonly DependencyModel[],
	apis: ReadonlyMap<string, DependencyApi>,
	reference: DocDeclarationReference,
	text: string,
): Result<DependencyExport> {
	if (
		reference.memberReferences.some(
			(part, index) =>
				!isSupportedReferenceMember(part, index, reference.memberReferences.length),
		)
	) {
		return reportFailure(
			DiagnosticCode.DocumentationUnsupported,
			`Reference ${text}: use named exported paths with declaration-kind or member-side selectors, or a terminal numeric callable selector.`,
		);
	}
	const names = reference.memberReferences.map(
		(part) => part.memberIdentifier?.identifier ?? "",
	);
	const entrypoint =
		reference.importPath === undefined || reference.importPath === ""
			? "."
			: `./${reference.importPath.replace(/^\//, "").replace(/^\.\//, "")}`;
	let exported: DependencyExport | undefined;
	for (const [index, part] of reference.memberReferences.entries()) {
		if (part.memberSymbol !== undefined) {
			// Resolve computed keys by declaration identity, then use the model's stored path name.
			const member = resolveSymbolMemberName(
				model,
				models,
				apis,
				entrypoint,
				names.slice(0, index),
				part.memberSymbol.symbolReference,
			);
			if (!member.ok) {
				return member;
			}
			names[index] = member.value;
		}

		// Models store complete export paths; only selected prefixes need a separate lookup.
		if (index !== names.length - 1 && part.selector === undefined) {
			continue;
		}
		const matches = findExportedTargets(model, entrypoint, names.slice(0, index + 1)).filter(
			(entry) => matchesExportSelector(entry, part.selector, apis),
		);
		exported = matches.length === 1 ? matches[0] : undefined;
		if (exported === undefined) {
			// A later path match must not bypass a missing or ambiguous intermediate selector.
			break;
		}
	}
	return exported === undefined
		? reportFailure(
				DiagnosticCode.DocumentationReference,
				`Dependency ${model.packageName}: exported target ${text} is missing or ambiguous in the model. Specify a member side when static and instance names collide.`,
			)
		: { ok: true, value: exported };
}

/**
 * Checks whether a reference component's name and selector are supported at its path position.
 * @param member - Parsed identifier or symbol-key reference with an optional selector.
 * @param index - Zero-based position in the reference path.
 * @param memberCount - Total number of components; numeric selectors are permitted only at the end.
 * @returns Whether lookup supports the component; class member-side selectors require a parent.
 */
function isSupportedReferenceMember(
	member: DocMemberReference,
	index: number,
	memberCount: number,
): boolean {
	if (member.memberIdentifier === undefined && member.memberSymbol === undefined) {
		return false;
	}
	const selector = member.selector;
	if (selector === undefined) {
		return true;
	}
	switch (selector.selectorKind) {
		case SelectorKind.Index: {
			return index === memberCount - 1;
		}
		case SelectorKind.Label: {
			return true;
		}
		case SelectorKind.System: {
			return (
				selector.selector === "constructor" ||
				getDeclarationSelectorKind(selector.selector) !== undefined ||
				(index > 0 && ["static", "instance"].includes(selector.selector))
			);
		}
		default: {
			return false;
		}
	}
}

/**
 * Tests an exported path against its selector using original API records from the selected suite.
 * @param entry - Candidate exported path, which may refer to several declaration or callable records.
 * @param selector - Validated selector; undefined leaves all path candidates eligible.
 * @param apis - API records indexed by identity, including owners of re-exported declarations.
 * @returns Whether the path matches. Numeric overload selection is deferred until its API records are resolved.
 */
function matchesExportSelector(
	entry: DependencyExport,
	selector: DocMemberSelector | undefined,
	apis: ReadonlyMap<string, DependencyApi>,
): boolean {
	// Numeric selectors choose an overload within the resolved export, not an export path.
	if (selector === undefined || selector.selectorKind === SelectorKind.Index) {
		return true;
	}
	if (selector.selectorKind === SelectorKind.Label) {
		return entry.items.some((id) => apis.get(id)?.labels.includes(selector.selector) === true);
	}
	if (selector.selector === "static" || selector.selector === "instance") {
		return entry.memberKind === selector.selector;
	}
	if (selector.selector === "constructor") {
		return entry.items.some((id) => apis.get(id)?.kind === "Constructor");
	}

	// Both namespace forms accept the same selector while retaining their original syntax kinds.
	const kind = getDeclarationSelectorKind(selector.selector);
	return (
		kind === undefined ||
		entry.items.some(
			(id) =>
				apis
					.get(id)
					?.declarationKinds.some(
						(declarationKind) =>
							declarationKind === kind ||
							(kind === "ModuleDeclaration" && declarationKind === "NamespaceExport"),
					) === true,
		)
	);
}

/**
 * Finds a computed member by its key identity without parsing printed TypeScript names.
 * @param model - Model containing the member's exported parent path.
 * @param models - Selected models available for symbol-key lookup.
 * @param apis - Original API identities from all selected models.
 * @param entrypoint - Surface containing the parent.
 * @param path - Parent path, including any recursive namespace aliases.
 * @param reference - Nested TSDoc reference to the key declaration.
 * @returns The member's stored path component or a reference diagnostic.
 */
function resolveSymbolMemberName(
	model: DependencyModel,
	models: readonly DependencyModel[],
	apis: ReadonlyMap<string, DependencyApi>,
	entrypoint: string,
	path: readonly string[],
	reference: DocDeclarationReference,
): Result<string> {
	// An exported API named Symbol takes precedence over the built-in well-known symbols.
	const wellKnown =
		reference.packageName === undefined &&
		reference.importPath === undefined &&
		reference.memberReferences.length === 2 &&
		reference.memberReferences[0]?.memberIdentifier?.identifier === "Symbol" &&
		!reference.memberReferences.some((member) => member.selector !== undefined) &&
		findExportedTargets(model, ".", ["Symbol"]).length === 0
			? reference.memberReferences[1]?.memberIdentifier?.identifier
			: undefined;
	const symbolModel =
		reference.packageName === undefined
			? model
			: models.find((candidate) => candidate.packageName === reference.packageName);
	if (symbolModel === undefined) {
		return reportFailure(
			DiagnosticCode.DocumentationReference,
			`Reference ${reference.emitAsTsdoc()}: symbol package is outside the selected suite.`,
		);
	}
	const symbol =
		wellKnown === undefined
			? resolveQualifiedExport(symbolModel, models, apis, reference, reference.emitAsTsdoc())
			: { ok: true as const, value: { items: [] } };
	if (!symbol.ok) {
		return symbol;
	}
	const identities =
		wellKnown === undefined
			? symbol.value.items.map((id) => apis.get(id)?.declarationId)
			: [`well-known-symbol:${wellKnown}`];
	const parentPaths = findExportedTargets(model, entrypoint, path).map(
		(entry) => entry.referencePath ?? entry.path,
	);
	const matching = model.exports.find(
		(entry) =>
			entry.entrypoint === entrypoint &&
			parentPaths.some(
				(parent) =>
					entry.path.length === parent.length + 1 &&
					parent.every((component, index) => entry.path[index] === component),
			) &&
			entry.symbolId !== undefined &&
			identities.includes(entry.symbolId),
	);
	const name = matching?.path.at(-1);
	return name === undefined
		? reportFailure(
				DiagnosticCode.DocumentationReference,
				`Reference ${reference.emitAsTsdoc()}: no member has the referenced symbol key.`,
			)
		: { ok: true, value: name };
}

/**
 * Maps a named declaration selector to the compiler syntax kind it requires.
 * @param selector - System-selector spelling recognized by the TSDoc parser.
 * @returns The required kind, or undefined for member-side, constructor, or unsupported selectors.
 */
export function getDeclarationSelectorKind(selector: string): string | undefined {
	switch (selector) {
		case "class": {
			return "ClassDeclaration";
		}
		case "interface": {
			return "InterfaceDeclaration";
		}
		case "namespace": {
			return "ModuleDeclaration";
		}
		case "enum": {
			return "EnumDeclaration";
		}
		case "type": {
			return "TypeAliasDeclaration";
		}
		case "function": {
			return "FunctionDeclaration";
		}
		case "variable": {
			return "VariableDeclaration";
		}
		default: {
			return undefined;
		}
	}
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

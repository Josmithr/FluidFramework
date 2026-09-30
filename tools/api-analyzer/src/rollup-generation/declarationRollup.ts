import assert from "node:assert/strict";
import path from "node:path";
import { selectApiItems, type ApiItemSelection } from "../analysis-types/classification.js";
import type { CompletedAnalysis } from "../analysis-types/completedGraph.js";
import { DiagnosticCode, reportFailure, type Result } from "../analysis-types/result.js";
import type { RollupData, RollupFragment } from "./rollupTypes.js";
import { prepareDeclarationSyntax, prepareDeclarationFragment } from "./declarationSyntax.js";
import type { ModelDeclaration } from "../analysis-types/modelGraph.js";
import type { DependencyModel } from "../analysis-types/dependencyModel.js";
import type { ExportFact } from "../analysis-types/facts.js";

/**
 * Selected fragments and external bindings required by an artifact set.
 */
interface DeclarationClosure {
	/**
	 * Local syntax grouped by declaration identity.
	 */
	readonly fragments: ReadonlyMap<string, readonly RollupFragment[]>;

	/**
	 * External imports, including synthesized namespace bindings.
	 */
	readonly imports: ReadonlyMap<string, RollupData["imports"][number]>;
}

/**
 * Generates declaration artifacts with shared nominal identity without compiler or filesystem access.
 * @param graph - Completed analysis containing declaration-generation data.
 * @param selection - Shared release and modifier selection.
 * @returns Package-relative declaration paths and content, or an unsupported-input diagnostic.
 */
export function generateDeclarationRollups(
	graph: CompletedAnalysis,
	selection: ApiItemSelection,
): Result<Readonly<Record<string, string>>> {
	const selected = selectApiItems(graph.classification, selection);
	if (!selected.ok) {
		return selected;
	}
	const captured = prepareDeclarationSyntax(graph.facts.declarationSyntax);
	const ids = new Set(selected.value.items.map((item) => item.id));
	const facts = new Map(graph.facts.declarations.map((item) => [item.id, item]));
	const surfaces = captured.surfaces.map((surface) => ({
		...surface,
		exports: surface.exports.filter(
			(binding) =>
				binding.untrimmed ||
				ids.has(binding.target) ||
				facts.get(binding.target)?.signatures.some((signature) => ids.has(signature.id)) ===
					true,
		),
	}));
	const partialFunctions = new Set(
		graph.facts.declarations
			.filter(
				(declaration) =>
					declaration.documentationContext === undefined &&
					declaration.declarations.every((source) => source.kind === "FunctionDeclaration") &&
					declaration.signatures.some((signature) => ids.has(signature.id)) &&
					declaration.signatures.some((signature) => !ids.has(signature.id)),
			)
			.map((declaration) => declaration.id),
	);
	const prepared = prepareSuiteOverloads(
		graph.dependencies ?? [],
		{ ...captured, surfaces },
		ids,
		partialFunctions,
	);
	if (!prepared.ok) {
		return prepared;
	}
	const data = prepared.value;
	const closure = collectDeclarations(data, data.surfaces, ids);
	if (!closure.ok) {
		return closure;
	}
	const names = allocateNames(data, closure.value);
	const files: Record<string, string> = {
		"__api.d.ts": renderSharedModule(data, closure.value, names),
	};
	for (const surface of data.surfaces) {
		const file =
			surface.name === "." ? "index.d.ts" : `${surface.name.replace(/^\.\//, "")}.d.ts`;
		if (
			path.posix.isAbsolute(file) ||
			file.includes("\\") ||
			file.split("/").includes("..") ||
			path.posix.normalize(file) !== file ||
			Object.hasOwn(files, file)
		) {
			return reportFailure(
				DiagnosticCode.RollupConfiguration,
				`Entrypoint ${surface.name} does not map to a unique package-relative declaration path.`,
			);
		}
		files[file] =
			`${data.packageDocumentation === undefined ? "" : `${data.packageDocumentation}\n`}${renderEntrypoint(surface, file, names)}`;
	}
	return { ok: true, value: files };
}

/**
 * Replaces only partially selected standalone suite function bindings with producer-captured syntax.
 * @param dependencies - Validated producer models, with no source or compiler access.
 * @param data - Local capture and selected entrypoints.
 * @param selected - Selected metadata identities.
 * @param partialFunctions - Standalone functions whose overload set is only partly selected.
 * @returns Generation inputs with safe overload declarations, or a relocation diagnostic.
 */
function prepareSuiteOverloads(
	dependencies: readonly DependencyModel[],
	data: RollupData,
	selected: ReadonlySet<string>,
	partialFunctions: ReadonlySet<string>,
): Result<RollupData> {
	const declarations = new Map(data.declarations.map((item) => [item.id, item]));
	const imports = new Map(data.imports.map((item) => [item.id, item]));
	const reservedNames = new Set(data.reservedNames);
	const redeclared = new Set<string>();
	for (const binding of data.surfaces.flatMap((surface) => surface.exports)) {
		if (
			binding.external === undefined ||
			binding.untrimmed ||
			redeclared.has(binding.target) ||
			!partialFunctions.has(binding.target)
		) {
			continue;
		}
		const owner = dependencies.find((model) =>
			model.graph.declarations.some(
				(item) =>
					item.id === binding.target &&
					item.sources.every((source) => source.packageName === model.packageName),
			),
		);
		const declaration = owner?.graph.declarations.find((item) => item.id === binding.target);
		if (
			declaration === undefined ||
			owner === undefined ||
			declaration.declaringContainer !== undefined ||
			declaration.exports.length > 0 ||
			declaration.sources.some((source) => source.kind !== "FunctionDeclaration")
		) {
			return reportFailure(
				DiagnosticCode.RollupUnsupported,
				`Re-export ${binding.name} needs a defining-package API model with standalone overload declarations. Include and regenerate that model before trimming this binding.`,
			);
		}
		const fragments: RollupFragment[] = [];
		for (const signature of declaration.signatures.filter((item) => selected.has(item.id))) {
			const syntax = signature.declarationSyntax;
			if (syntax?.isDeclarationFile !== true) {
				return reportFailure(
					DiagnosticCode.RollupUnsupported,
					`Re-export ${binding.name} needs overload syntax in the API model for ${owner.packageName}. Regenerate that model with declaration inputs.`,
				);
			}
			for (const name of syntax.lexicalNames) {
				reservedNames.add(name);
			}
			const tokens: RollupFragment["excerpt"]["tokens"][number][] = [];
			for (const token of prepareDeclarationFragment(syntax, declaration.id, declaration.name)
				.tokens) {
				if (token.kind === "Content" || token.target === declaration.id) {
					tokens.push(token);
					continue;
				}
				const originalImport = syntax.imports.find((item) => item.id === token.target);
				const imported =
					originalImport === undefined
						? findPublishedBinding(dependencies, token.target)
						: {
								...originalImport,
								id: JSON.stringify([owner.packageName, originalImport.id]),
							};
				if (imported === undefined) {
					return reportFailure(
						DiagnosticCode.RollupUnsupported,
						`Re-export ${binding.name} references ${token.text}, which has no published binding in the selected API models. Export that type from its defining package; it cannot be copied without proving identity preservation.`,
					);
				}
				imports.set(imported.id, imported);
				tokens.push({ ...token, target: imported.id });
			}
			fragments.push({
				signatures: [signature.id],
				excerpt: {
					tokens: [
						{
							kind: "Content",
							text: "// Redeclared to omit excluded overloads; a direct re-export would expose them.\n",
						},
						...tokens,
					],
					tokenRange: { startIndex: 0, endIndex: tokens.length + 1 },
				},
			});
		}
		declarations.set(declaration.id, {
			id: declaration.id,
			name: declaration.name,
			fragments,
		});
		redeclared.add(declaration.id);
	}
	return {
		ok: true,
		value: {
			...data,
			declarations: [...declarations.values()],
			imports: [...imports.values()],
			reservedNames: [...reservedNames],
			surfaces: data.surfaces.map((surface) => ({
				...surface,
				exports: surface.exports.map((binding) => {
					if (!redeclared.has(binding.target)) {
						return binding;
					}
					const { external: _external, ...local } = binding;
					return local;
				}),
			})),
		},
	};
}

/**
 * Finds a producer-owned public binding without reconstructing a type declaration.
 * @param dependencies - Validated models with configured export surfaces.
 * @param target - Required declaration identity.
 * @returns An import preserving the declaration's identity, or undefined when no path is known.
 */
function findPublishedBinding(
	dependencies: readonly DependencyModel[],
	target: string,
): RollupData["imports"][number] | undefined {
	for (const model of dependencies) {
		const declaration: ModelDeclaration | undefined = model.graph.declarations.find(
			(item) => item.id === target,
		);
		if (
			declaration?.sources.every((source) => source.packageName === model.packageName) !== true
		) {
			continue;
		}
		for (const surface of model.graph.surfaces) {
			const binding = surface.exports.find(
				(item) => item.target === target && item.external === undefined,
			);
			if (binding !== undefined) {
				return {
					id: `dependency-import:${target}`,
					name: declaration.name,
					kind: "named",
					importedName: binding.name,
					moduleSpecifier:
						surface.name === "."
							? model.packageName
							: `${model.packageName}${surface.name.slice(1)}`,
					typeOnly: binding.typeOnly,
				};
			}
		}
	}
	return undefined;
}

/**
 * Computes the syntax closure without changing the completed graph.
 * @param data - Detached declaration inputs.
 * @param surfaces - Selected entrypoint bindings.
 * @param ids - Independently selected metadata identities.
 * @returns Required syntax and imports, or an unsupported-input diagnostic.
 */
function collectDeclarations(
	data: RollupData,
	surfaces: RollupData["surfaces"],
	ids: ReadonlySet<string>,
): Result<DeclarationClosure> {
	const declarations = new Map(data.declarations.map((item) => [item.id, item]));
	const imports = new Map(data.imports.map((item) => [item.id, item]));
	const fragments = new Map<string, readonly RollupFragment[]>();
	const requiredImports = new Set<string>();
	const retainedWhole = new Set<string>();
	const pending = surfaces.flatMap((surface) =>
		surface.exports
			.filter((binding) => binding.external === undefined)
			.map((binding) => ({ id: binding.target, whole: false })),
	);

	// Importing an entrypoint applies its augmentations even when the selection excludes all named exports.
	pending.push(
		...data.declarations
			.filter((declaration) => declaration.moduleScope === true)
			.map((declaration) => ({ id: declaration.id, whole: true })),
	);
	const selectedRoots = new Set(pending.map((item) => item.id));
	while (pending.length > 0) {
		const next = pending.pop();
		if (next === undefined) {
			continue;
		}
		const { id, whole } = next;
		if (fragments.has(id) && (!whole || retainedWhole.has(id))) {
			continue;
		}
		if (whole) {
			retainedWhole.add(id);
		}
		if (imports.has(id)) {
			requiredImports.add(id);
			continue;
		}
		const declaration = declarations.get(id);
		if (declaration === undefined || declaration.unsupported !== undefined) {
			return reportFailure(
				DiagnosticCode.RollupUnsupported,
				declaration?.unsupported ?? `Declaration ${id} has no captured rollup syntax.`,
			);
		}
		const selectedFragments = declaration.fragments.filter(
			(fragment) =>
				whole ||
				fragment.signatures.length === 0 ||
				fragment.signatures.some((signature) => ids.has(signature)),
		);
		fragments.set(id, selectedFragments);
		for (const binding of declaration.exports ?? []) {
			if (binding.external !== undefined) {
				const imported = getNamespaceImport(binding.external);
				imports.set(imported.id, imported);
				requiredImports.add(imported.id);
			}
		}
		pending.push(
			...(declaration.exports ?? [])
				.filter((binding) => binding.external === undefined)
				.map((binding) => ({ id: binding.target, whole: true })),
		);
		for (const fragment of selectedFragments) {
			for (const token of fragment.excerpt.tokens) {
				if (token.kind === "Reference" && token.target !== id) {
					pending.push({ id: token.target, whole: !selectedRoots.has(token.target) });
				}
			}
		}
	}
	return {
		ok: true,
		value: {
			fragments,
			imports: new Map([...imports].filter(([id]) => requiredImports.has(id))),
		},
	};
}

/**
 * Assigns deterministic names without capturing existing lexical names.
 * @param data - Original declaration names and lexical reservations.
 * @param closure - Required declarations and imports.
 * @returns Allocated names indexed by identity.
 */
function allocateNames(
	data: RollupData,
	closure: DeclarationClosure,
): ReadonlyMap<string, string> {
	const declarations = new Map(data.declarations.map((item) => [item.id, item]));
	const names = new Map<string, string>();
	const used = new Set<string>(["__api", ...data.reservedNames]);
	for (const id of [...closure.fragments.keys(), ...closure.imports.keys()].sort()) {
		const preferred = declarations.get(id)?.name ?? closure.imports.get(id)?.name;
		assert(preferred !== undefined, "Every required binding must have a captured name.");
		let name = preferred;
		let suffix = 1;
		while (used.has(name)) {
			name = `${preferred}_${suffix++}`;
		}
		used.add(name);
		names.set(id, name);
	}
	return names;
}

/**
 * Renders shared declarations once to preserve identity across entrypoints.
 * @param data - Original declaration and namespace records.
 * @param closure - Required syntax and imports.
 * @param names - Allocated binding names.
 * @returns Shared declaration-module content.
 */
function renderSharedModule(
	data: RollupData,
	closure: DeclarationClosure,
	names: ReadonlyMap<string, string>,
): string {
	const declarations = new Map(data.declarations.map((item) => [item.id, item]));
	const output: string[] = [...(data.sideEffectImports ?? [])];
	for (const [id, binding] of [...closure.imports].sort(([left], [right]) =>
		left.localeCompare(right),
	)) {
		const name = getName(names, id);
		const clause =
			binding.kind === "namespace"
				? `* as ${name}`
				: binding.kind === "default"
					? name
					: `{ ${exportName(binding.importedName ?? binding.name)} as ${name} }`;
		output.push(
			`import ${binding.typeOnly ? "type " : ""}${clause} from ${JSON.stringify(binding.moduleSpecifier)};`,
		);
	}
	const body: string[] = [];
	const augmentations: string[] = [];
	for (const id of [...closure.fragments.keys()].sort()) {
		const declaration = declarations.get(id);
		const moduleScope = declaration?.moduleScope === true;

		// Augmentations are outside __api, so references to local declarations need the __api prefix.
		// References to module-level imports do not need this prefix.
		for (const fragment of closure.fragments.get(id) ?? []) {
			(moduleScope ? augmentations : body).push(
				fragment.excerpt.tokens
					.map((token) =>
						token.kind === "Content"
							? token.text
							: `${moduleScope && !closure.imports.has(token.target) ? "__api." : ""}${getName(names, token.target)}`,
					)
					.join("")
					.trim(),
			);
		}
		if (declaration?.exports !== undefined) {
			if (declaration.documentation !== undefined) {
				body.push(declaration.documentation);
			}
			body.push(
				`export namespace ${getName(names, id)} {\n${declaration.exports
					.map((binding, index) => {
						const imported =
							binding.external === undefined
								? undefined
								: getNamespaceImport(binding.external);
						if (imported?.kind === "named") {
							// A named import can refer to a constant.
							// A constant cannot be the namespace target in import alias = value, so export the binding directly.
							return `export ${binding.typeOnly ? "type " : ""}{ ${getName(names, imported.id)} as ${exportName(binding.name)} };`;
						}
						const target =
							imported === undefined
								? `__api.${getName(names, binding.target)}`
								: `${getName(names, imported.id)}${binding.external?.importedName === undefined ? "" : `.${binding.external.importedName}`}`;
						return `import alias_${index} = ${target};\nexport ${binding.typeOnly ? "type " : ""}{ alias_${index} as ${exportName(binding.name)} };`;
					})
					.join("\n")}\n}`,
			);
		}
	}
	output.push(`export declare namespace __api {\n${body.join("\n\n")}\n}`);
	output.push(...augmentations);
	return `${output.join("\n\n")}\n`;
}

/**
 * Renders one thin entrypoint over shared local definitions and external re-exports.
 * @param surface - Selected exports.
 * @param file - Package-relative output path.
 * @param names - Allocated local declaration names.
 * @returns Entrypoint declaration content.
 */
function renderEntrypoint(
	surface: RollupData["surfaces"][number],
	file: string,
	names: ReadonlyMap<string, string>,
): string {
	let specifier = path.posix.relative(path.posix.dirname(file), "__api.js");
	if (!specifier.startsWith(".")) {
		specifier = `./${specifier}`;
	}
	const entry: string[] = [`import { __api } from ${JSON.stringify(specifier)};`];
	let ordinal = 0;
	for (const binding of surface.exports) {
		const exported = exportName(binding.name);
		if (binding.external === undefined) {
			const local = `api_${ordinal++}`;
			entry.push(
				`import ${local} = __api.${getName(names, binding.target)};`,
				`export ${binding.typeOnly ? "type " : ""}{ ${local} as ${exported} };`,
			);
		} else {
			const imported = binding.external.importedName;
			const clause =
				imported === undefined
					? `* as ${exported}`
					: `{ ${exportName(imported)}${imported === binding.name ? "" : ` as ${exported}`} }`;
			entry.push(
				`export ${binding.typeOnly ? "type " : ""}${clause} from ${JSON.stringify(binding.external.moduleSpecifier)};`,
			);
		}
	}
	if (surface.exports.length === 0) {
		entry.push("export {};");
	}
	return `${entry.join("\n")}\n`;
}

/**
 * Gets a required allocated name without hiding missing closure data.
 * @param names - Allocated names.
 * @param id - Required declaration identity.
 * @returns Allocated name.
 */
function getName(names: ReadonlyMap<string, string>, id: string): string {
	const name = names.get(id);
	assert(
		name !== undefined,
		"Every emitted reference must belong to the declaration closure.",
	);
	return name;
}

/**
 * Quotes export names that cannot use identifier syntax.
 * @param name - Compiler-resolved export name.
 * @returns Safe named import or export syntax.
 */
function exportName(name: string): string {
	return /^[$A-Z_a-z][\w$]*$/.test(name) ? name : JSON.stringify(name);
}

/**
 * Selects import syntax for an external namespace member.
 * @param binding - Original external export binding.
 * @returns A namespace import, or a named import for a quoted export name.
 */
function getNamespaceImport(
	binding: NonNullable<ExportFact["external"]>,
): RollupData["imports"][number] {
	const importedName = binding.importedName;

	// Named imports support quoted export names.
	// Import alias targets do not support quoted names after a dot.
	return importedName !== undefined && exportName(importedName) !== importedName
		? {
				id: `namespace-member:${JSON.stringify([binding.moduleSpecifier, importedName])}`,
				kind: "named",
				name: "foreignExport",
				importedName,
				moduleSpecifier: binding.moduleSpecifier,
				typeOnly: false,
			}
		: {
				id: `namespace-import:${binding.moduleSpecifier}`,
				kind: "namespace",
				name: "foreignNamespace",
				moduleSpecifier: binding.moduleSpecifier,
				typeOnly: false,
			};
}

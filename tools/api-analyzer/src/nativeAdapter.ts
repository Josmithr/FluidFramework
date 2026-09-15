import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { SyntaxKind, type Node } from "typescript/unstable/ast";
import {
	isExportDeclaration,
	isNamedExports,
	isNamespaceExport,
	isSourceFile,
	isModuleDeclaration,
	isModuleBlock,
	isImportClause,
	isImportSpecifier,
	isExportSpecifier,
	isPropertySignatureDeclaration,
	isTypeLiteralNode,
} from "typescript/unstable/ast/is";
import {
	API,
	NodeBuilderFlags,
	SignatureKind,
	SymbolFlags,
	type Project,
	type Symbol as CompilerSymbol,
	type Type,
} from "typescript/unstable/sync";
import type { EffectiveConfiguration } from "./configuration.js";
import type {
	AnalysisFacts,
	DeclarationFact,
	ExportFact,
	MemberFact,
	Origin,
	SignatureFact,
} from "./facts.js";
import { failure, freezeData, type Result } from "./result.js";

/**
 * Creates a synchronous adapter that owns a native TypeScript compiler connection.
 *
 * @remarks
 * Keeps unstable compiler objects inside the adapter.
 * Returns detached facts, which contain no compiler objects.
 * The caller owns the connection and must close it when it is no longer needed.
 * Analysis-result caching and invalidation belong to the session, not this adapter.
 *
 * @returns An adapter with analysis and connection-cleanup operations.
 * @throws If the native compiler connection cannot be created.
 */
export function createNativeAdapter() {
	const api = new API();
	return {
		/**
		 * Extracts facts for one effective configuration using a compiler snapshot.
		 *
		 * @remarks
		 * Checks compiler diagnostics before extracting facts.
		 * Disposes the snapshot before returning, including when extraction fails.
		 * Does not close the adapter's native connection or cache the returned facts.
		 *
		 * @param configuration - Resolved settings with absolute project and entrypoint paths.
		 * @returns Frozen, detached facts on success, or diagnostics for project,
		 * compiler, or entrypoint validation failures.
		 * @throws If compiler communication, file access, or fact extraction fails unexpectedly.
		 * The owning session converts these exceptions to analysis-failure diagnostics.
		 */
		analyze(configuration: EffectiveConfiguration): Result<AnalysisFacts> {
			if (!existsSync(configuration.project)) {
				return failure(
					"project-missing",
					`Project configuration not found: ${configuration.project}`,
				);
			}
			const snapshot = api.updateSnapshot({ openProjects: [configuration.project] });
			try {
				const project = snapshot.getProject(configuration.project);
				if (!project) {
					return failure("project-missing", `Cannot open project: ${configuration.project}`);
				}
				// Reject invalid compiler input before collecting any facts.
				const diagnostics = [
					...project.program.getConfigFileParsingDiagnostics(),
					...project.program.getProgramDiagnostics(),
					...project.program.getSyntacticDiagnostics(),
					...project.program.getSemanticDiagnostics(),
				];
				if (diagnostics.length > 0) {
					return failure(
						"compiler-diagnostics",
						`Project ${configuration.project} has compiler diagnostics: ${JSON.stringify(diagnostics)}`,
					);
				}
				return extractFacts(project, configuration);
			} finally {
				// Returned facts must not depend on handles owned by this snapshot.
				snapshot.dispose();
			}
		},
		/**
		 * Closes the owned native compiler connection.
		 *
		 * @remarks
		 * The caller must not analyze through this adapter after closing it.
		 * Previously returned facts remain usable because they contain no compiler objects.
		 *
		 * @throws If the compiler client fails to close the connection.
		 */
		close(): void {
			api.close();
		},
	};
}

/**
 * The package that owns a source file.
 */
export interface PackageOwner {
	/**
	 * The package name used in declaration locations.
	 */
	readonly packageName: string;
	/**
	 * The absolute directory used for package-relative paths.
	 */
	readonly root: string;
}

/**
 * Package settings and location cache for one extraction.
 */
export interface LocationContext {
	/**
	 * The package settings used when a manifest does not supply an owner.
	 */
	readonly configuration: Pick<EffectiveConfiguration, "packageName" | "packageRoot">;
	/**
	 * Package owners keyed by source file path. Updated in place during lookup.
	 *
	 * @remarks
	 * Create an empty map for each extraction. Discard it after input changes.
	 */
	readonly packageCache: Map<string, PackageOwner>;
}

/**
 * Mutable declaration tracking for one export traversal.
 */
export interface CollectionState {
	/**
	 * Completed declaration facts keyed by provisional identifier.
	 */
	readonly declarations: Map<string, DeclarationFact>;
	/**
	 * Identifiers on the active traversal path, used to stop export cycles.
	 */
	readonly visiting: Set<string>;
}

/**
 * Extracts the supported semantic facts for all configured entrypoints.
 *
 * @remarks
 * Follows export targets and namespace exports before any output-specific selection.
 * Does not build a complete graph of referenced types or resolve TSDoc.
 * Declaration tracking and package-owner caching are local to this call.
 * The caller must keep the project snapshot alive until extraction finishes.
 *
 * @param project - A compiler project whose diagnostics have already been checked.
 * @param configuration - Effective package, project, and entrypoint settings.
 * @returns Deeply frozen facts, or diagnostics if an entrypoint is missing or is not a module.
 * @throws If compiler queries or package metadata reads fail, an export target is unresolved,
 * or a required signature or member type cannot be extracted.
 */
function extractFacts(
	project: Project,
	configuration: EffectiveConfiguration,
): Result<AnalysisFacts> {
	const locations: LocationContext = { configuration, packageCache: new Map() };
	const state: CollectionState = { declarations: new Map(), visiting: new Set() };
	// Start at each entrypoint. Export traversal fills the shared declaration map.
	const surfaces = [];
	for (const entrypoint of [...configuration.entrypoints].sort((left, right) =>
		left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
	)) {
		const source = project.program.getSourceFile(entrypoint.path);
		if (!source) {
			return failure(
				"entrypoint-missing",
				`Entrypoint ${entrypoint.name} is not in project ${configuration.project}: ${entrypoint.path}`,
			);
		}
		const moduleSymbol = project.checker.getSymbolAtLocation(source);
		if (!moduleSymbol) {
			return failure("entrypoint-module", `Entrypoint is not a module: ${entrypoint.path}`);
		}
		surfaces.push({
			name: entrypoint.name,
			exports: exportsOf(project, locations, state, moduleSymbol),
		});
	}
	// Sort the result independently of traversal order before making it immutable.
	return freezeData({
		ok: true,
		value: {
			packageName: configuration.packageName,
			compilerVersion: "7.0.2",
			surfaces,
			declarations: [...state.declarations.values()].sort((left, right) =>
				left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
			),
		},
	});
}

/**
 * Creates a package-relative source location.
 *
 * @remarks
 * Finds the nearest ancestor package manifest and caches the owner for this file.
 * Uses the configured package name at the configured root, or when a manifest has no name.
 * If no manifest is found, uses the configured package name and root.
 *
 * @param locations - Package settings and cache owned by this extraction.
 * @param fileName - The source file path supplied by the compiler.
 * @param start - The compiler source offset to retain unchanged.
 * @returns A location with `/` path separators relative to the owning package root.
 * @throws If an encountered package manifest cannot be read or parsed.
 */
export function origin(locations: LocationContext, fileName: string, start: number): Origin {
	const { configuration, packageCache } = locations;
	let owner = packageCache.get(fileName);
	if (!owner) {
		let directory = path.dirname(fileName);
		while (true) {
			const manifest = path.join(directory, "package.json");
			if (existsSync(manifest)) {
				const metadata = JSON.parse(readFileSync(manifest, "utf8")) as { name?: string };
				owner = {
					packageName:
						directory === configuration.packageRoot
							? configuration.packageName
							: (metadata.name ?? configuration.packageName),
					root: directory,
				};
				break;
			}
			const parent = path.dirname(directory);
			if (parent === directory) {
				// The search reached the file-system root without finding a manifest.
				owner = { packageName: configuration.packageName, root: configuration.packageRoot };
				break;
			}
			directory = parent;
		}
		packageCache.set(fileName, owner);
	}
	return {
		packageName: owner.packageName,
		file: path.relative(owner.root, fileName).split(path.sep).join("/"),
		start,
	};
}

/**
 * Resolves an alias through the compiler's symbol resolver.
 *
 * @param checker - The checker for the active compiler snapshot.
 * @param symbol - The exported symbol to resolve.
 * @returns The alias target, or the original symbol if it is not an alias.
 */
export function target(checker: Project["checker"], symbol: CompilerSymbol): CompilerSymbol {
	return symbol.flags & SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
}

/**
 * Constructs a provisional identifier for a declaration symbol.
 *
 * @remarks
 * Uses sorted, distinct package-relative locations and containing symbol names.
 * Source-file modules use a fixed marker instead of the compiler's absolute-path name.
 * Does not encode source offsets or package versions.
 * The format is not a stable public contract.
 * Uniqueness across installed versions or all compiler-generated symbols is not guaranteed.
 *
 * @param locations - Package settings and cache used to resolve declaration locations.
 * @param symbol - The symbol whose identity is needed.
 * @returns An opaque identifier for declaration tracking and export references.
 */
export function identity(locations: LocationContext, symbol: CompilerSymbol): string {
	const declarationLocations = symbol.declarations.map((handle) => {
		const location = origin(locations, handle.path, 0);
		return [location.packageName, location.file];
	});
	const parents: string[] = [];
	let parent = symbol.getParent();
	// Exclude the source-file parent: its compiler name can contain an absolute path.
	while (
		parent &&
		!parent.declarations.some((handle) => handle.kind === SyntaxKind.SourceFile)
	) {
		parents.unshift(parent.name);
		parent = parent.getParent();
	}
	return JSON.stringify([
		// Declaration order and repeated declarations in one file must not change the ID.
		Array.from(
			new Set(declarationLocations.map((location) => JSON.stringify(location))),
		).sort(),
		...parents,
		symbol.declarations.some((handle) => handle.kind === SyntaxKind.SourceFile)
			? "<module>"
			: symbol.name,
	]);
}

/**
 * Checks a symbol's alias chain for type-only import or export syntax.
 *
 * @remarks
 * Inspects declaration ancestors and follows immediate aliases through the compiler.
 * Does not infer type-only export status from the target's declaration kind.
 *
 * @param checker - The checker for the active compiler snapshot.
 * @param symbol - The symbol at the current position in the alias chain.
 * @param seen - Symbols already visited in this traversal. Updated in place.
 * Defaults to a new empty set for each top-level call.
 * @returns `true` if type-only syntax is found; otherwise `false`, including on a repeated symbol.
 */
export function aliasTypeOnly(
	checker: Project["checker"],
	symbol: CompilerSymbol,
	seen = new Set<CompilerSymbol>(),
): boolean {
	if (seen.has(symbol)) {
		return false;
	}
	seen.add(symbol);
	for (const handle of symbol.declarations) {
		let node = handle.resolve();
		// The type-only marker can belong to a containing import or export statement.
		while (node && !isSourceFile(node)) {
			if (isImportClause(node) && node.phaseModifier === SyntaxKind.TypeKeyword) {
				return true;
			}
			if (
				(isImportSpecifier(node) || isExportDeclaration(node) || isExportSpecifier(node)) &&
				node.isTypeOnly
			) {
				return true;
			}
			node = node.parent;
		}
	}
	const next =
		symbol.flags & SymbolFlags.Alias ? checker.getImmediateAliasedSymbol(symbol) : undefined;
	return next ? aliasTypeOnly(checker, next, seen) : false;
}

/**
 * Determines whether a named export is exposed only through type-only paths.
 *
 * @remarks
 * Checks explicit exports before star exports and follows compiler-resolved modules.
 * When several applicable paths are found, all must be type-only for the result to be `true`.
 * Falls back to alias-chain inspection for locally declared or otherwise unmatched bindings.
 *
 * @param checker - The checker for the active compiler snapshot.
 * @param locations - Package settings and cache used to identify modules.
 * @param moduleSymbol - The module or namespace that exposes the binding.
 * @param name - The exported name to inspect.
 * @param seen - Module-and-name keys on the active traversal path. Not modified.
 * Defaults to a new empty set for each top-level call.
 * @returns Whether the inspected paths establish a type-only export.
 * Returns `false` for a repeated traversal key or when no type-only path is established.
 */
export function exportTypeOnly(
	checker: Project["checker"],
	locations: LocationContext,
	moduleSymbol: CompilerSymbol,
	name: string,
	seen = new Set<string>(),
): boolean {
	const key = JSON.stringify([identity(locations, moduleSymbol), name]);
	if (seen.has(key)) {
		return false;
	}
	// Copy the active path so one branch does not suppress checks in another branch.
	const active = new Set(seen).add(key);
	const explicit: boolean[] = [];
	const stars: boolean[] = [];
	for (const handle of moduleSymbol.declarations) {
		const declaration = handle.resolve();
		const container =
			declaration && isModuleDeclaration(declaration) ? declaration.body : declaration;
		if (!container || !(isSourceFile(container) || isModuleBlock(container))) {
			continue;
		}
		for (const statement of container.statements) {
			if (!isExportDeclaration(statement)) {
				continue;
			}
			const from = statement.moduleSpecifier
				? checker.getSymbolAtLocation(statement.moduleSpecifier)
				: undefined;
			if (
				!statement.exportClause &&
				from &&
				checker.getExportsOfModule(from).some((item) => item.name === name)
			) {
				stars.push(
					statement.isTypeOnly || exportTypeOnly(checker, locations, from, name, active),
				);
			} else if (statement.exportClause && isNamedExports(statement.exportClause)) {
				for (const specifier of statement.exportClause.elements) {
					if (specifier.name.text !== name) {
						continue;
					}
					const local = checker.getSymbolAtLocation(specifier.name);
					// Follow the original name when this export renames an imported binding.
					explicit.push(
						statement.isTypeOnly ||
							specifier.isTypeOnly ||
							(from
								? exportTypeOnly(
										checker,
										locations,
										from,
										(specifier.propertyName ?? specifier.name).text,
										active,
									)
								: local
									? aliasTypeOnly(checker, local)
									: false),
					);
				}
			} else if (
				statement.exportClause &&
				isNamespaceExport(statement.exportClause) &&
				statement.exportClause.name.text === name
			) {
				explicit.push(statement.isTypeOnly);
			}
		}
	}
	// Explicit exports take precedence over star exports with the same name.
	if (explicit.length) {
		return explicit.every(Boolean);
	}
	const symbol = checker.getExportsOfModule(moduleSymbol).find((item) => item.name === name);
	if (
		symbol?.declarations.some((handle) =>
			moduleSymbol.declarations.some((moduleHandle) => moduleHandle.path === handle.path),
		)
	) {
		return aliasTypeOnly(checker, symbol);
	}
	return stars.length > 0
		? stars.every(Boolean)
		: symbol
			? aliasTypeOnly(checker, symbol)
			: false;
}

/**
 * Converts a type's call signatures into detached facts.
 *
 * @remarks
 * Prints each signature as a function type and combines its text hash with the owner identifier.
 * Retains raw declaration text, not parsed TSDoc, in the documentation field.
 * Does not extract construct signatures.
 *
 * @param compiler - The checker and emitter for the active compiler snapshot.
 * @param type - The compiler type whose callable signatures are requested.
 * @param owner - The containing declaration's provisional identifier.
 * @returns Signature facts in compiler order, or an empty array if there are no call signatures.
 * @throws If the compiler cannot produce a printable node for a call signature.
 */
export function signatures(
	compiler: Pick<Project, "checker" | "emitter">,
	type: Type,
	owner: string,
): SignatureFact[] {
	const { checker, emitter } = compiler;
	return checker.getSignaturesOfType(type, SignatureKind.Call).map((signature) => {
		const node = checker.signatureToSignatureDeclaration(signature, SyntaxKind.FunctionType);
		if (!node) {
			throw new Error(`Cannot materialize signature for ${owner}`);
		}
		const text = emitter.printNode(node).trim();
		return {
			id: `${owner}:${createHash("sha256").update(text).digest("hex")}`,
			text,
			documentation: signature.declaration?.resolve()?.getFullText() ?? "",
		};
	});
}

/**
 * Extracts effective properties and methods from an object or intersection type.
 *
 * @remarks
 * Uses compiler-resolved property types, including supported inherited and generic members.
 * Reads readonly modifiers from a generated type literal where possible, then from declarations.
 * Uses `null` for readonly state when neither source is available.
 *
 * @param compiler - The checker and emitter for the active compiler snapshot.
 * @param locations - Package settings and cache used for member origins.
 * @param type - The compiler type whose effective members are requested.
 * @returns Detached members sorted by name. Other type categories produce an empty array.
 * @throws If the compiler cannot resolve an effective property type.
 */
export function members(
	compiler: Pick<Project, "checker" | "emitter">,
	locations: LocationContext,
	type: Type,
): MemberFact[] {
	const { checker, emitter } = compiler;
	if (!type.isObjectType() && !type.isIntersectionType()) {
		return [];
	}
	// A mapped type can change readonly modifiers without changing the source declaration.
	const node = checker.typeToTypeNode(type, undefined, NodeBuilderFlags.InTypeAlias);
	const modifiers = new Map<string, boolean>();
	if (node && isTypeLiteralNode(node)) {
		for (const member of node.members) {
			if (isPropertySignatureDeclaration(member)) {
				modifiers.set(
					emitter.printNode(member.name).trim(),
					member.modifiers?.some((modifier) => modifier.kind === SyntaxKind.ReadonlyKeyword) ??
						false,
				);
			}
		}
	}
	return checker
		.getPropertiesOfType(type)
		.map((property) => {
			const propertyType = checker.getTypeOfSymbol(property);
			const nodes = property.declarations
				.map((handle) => handle.resolve())
				.filter((item): item is Node => item !== undefined);
			const declaration = nodes[0];
			const nameNode = declaration && "name" in declaration ? declaration.name : undefined;
			// Print computed names to avoid compiler symbol names that contain temporary IDs.
			const name =
				nameNode && typeof nameNode === "object" && "kind" in nameNode
					? emitter.printNode(nameNode as Node).trim()
					: property.name;
			const readonly =
				modifiers.get(property.name) ??
				(nodes.length
					? nodes.some(
							(item) =>
								"modifiers" in item &&
								Array.isArray(item.modifiers) &&
								item.modifiers.some(
									(modifier: Node) => modifier.kind === SyntaxKind.ReadonlyKeyword,
								),
						)
					: null);
			if (!propertyType) {
				throw new Error(`Cannot resolve the effective type of member ${name}.`);
			}
			return {
				name,
				type: checker.typeToString(propertyType, declaration),
				optional: Boolean(property.flags & SymbolFlags.Optional),
				readonly,
				origins: property.declarations.map((handle) =>
					origin(locations, handle.path, handle.resolve()?.pos ?? 0),
				),
			};
		})
		.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
}

/**
 * Extracts exported bindings and collects their resolved declaration targets.
 *
 * @remarks
 * Adds target facts to the supplied declaration map through {@link collect}.
 * Preserves the exported name separately from the target's identity.
 *
 * @param compiler - The checker and emitter for the active compiler snapshot.
 * @param locations - Package settings and cache used for declaration locations.
 * @param state - Declaration tracking updated in place. Discard it if extraction throws.
 * @param moduleSymbol - The module or namespace whose exports are requested.
 * @returns Detached export facts sorted by exported name.
 */
export function exportsOf(
	compiler: Pick<Project, "checker" | "emitter">,
	locations: LocationContext,
	state: CollectionState,
	moduleSymbol: CompilerSymbol,
): ExportFact[] {
	const { checker } = compiler;
	return checker
		.getExportsOfModule(moduleSymbol)
		.map((exported) => {
			const resolved = target(checker, exported);
			const id = collect(compiler, locations, state, resolved);
			return {
				name: exported.name,
				target: id,
				typeOnly: exportTypeOnly(checker, locations, moduleSymbol, exported.name),
			};
		})
		.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
}

/**
 * Collects facts for a resolved symbol and its namespace exports.
 *
 * @remarks
 * Reuses completed declarations by provisional identifier.
 * Tracks active identifiers to stop recursive export cycles.
 * Adds completed facts to the supplied declaration map.
 * Marks conditional, indexed-access, and union types as partial, along with member lists
 * that contain an unresolved readonly state.
 * Does not recursively collect every type referenced by a declaration.
 *
 * @param compiler - The checker and emitter for the active compiler snapshot.
 * @param locations - Package settings and cache used for declaration locations.
 * @param state - Declaration tracking updated in place. Discard it if extraction throws.
 * @param symbol - A declaration target after alias resolution.
 * @returns The provisional identifier used to reference the declaration in this result.
 * @throws If the symbol is unresolved or extraction of its required facts fails.
 */
export function collect(
	compiler: Pick<Project, "checker" | "emitter">,
	locations: LocationContext,
	state: CollectionState,
	symbol: CompilerSymbol,
): string {
	const { checker } = compiler;
	const { declarations, visiting } = state;
	if (checker.isUnknownSymbol(symbol)) {
		throw new Error(`Unresolved symbol: ${symbol.name}`);
	}
	const id = identity(locations, symbol);
	if (declarations.has(id) || visiting.has(id)) {
		return id;
	}
	// Reserve the ID before following exports that can refer back to this symbol.
	visiting.add(id);
	const moduleSource = symbol.declarations.find(
		(handle) => handle.kind === SyntaxKind.SourceFile,
	);
	// Keep module exports, but omit module type text that can contain absolute paths.
	const type = moduleSource
		? undefined
		: symbol.flags & SymbolFlags.Type
			? checker.getDeclaredTypeOfSymbol(symbol)
			: checker.getTypeOfSymbol(symbol);
	const effectiveMembers = type ? members(compiler, locations, type) : [];
	const namespaceExports =
		symbol.flags & SymbolFlags.Module ? exportsOf(compiler, locations, state, symbol) : [];
	const partial = Boolean(
		type &&
			(type.isConditionalType() ||
				type.isIndexedAccessType() ||
				type.isUnionType() ||
				effectiveMembers.some((member) => member.readonly === null)),
	);
	declarations.set(id, {
		id,
		name: moduleSource ? origin(locations, moduleSource.path, 0).file : symbol.name,
		declarations: symbol.declarations.map((handle) => {
			const node = handle.resolve();
			return {
				...origin(locations, handle.path, node?.pos ?? 0),
				kind: SyntaxKind[handle.kind],
				text: node?.getFullText() ?? "",
			};
		}),
		type: type ? checker.typeToString(type, symbol.declarations[0]?.resolve()) : "",
		memberView: partial ? "partial" : "complete",
		limitations: partial
			? [
					{
						code: "member-expansion-incomplete",
						message: `Member expansion for ${symbol.name} is incomplete. Retain the original declaration and do not present this member list as complete.`,
					},
				]
			: [],
		members: effectiveMembers,
		signatures: type ? signatures(compiler, type, id) : [],
		exports: namespaceExports,
	});
	visiting.delete(id);
	return id;
}

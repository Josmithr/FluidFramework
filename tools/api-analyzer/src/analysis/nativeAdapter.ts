/* eslint-disable no-bitwise -- TypeScript exposes symbol flags as bit masks. */
/* eslint-disable unicorn/no-null -- Null is an input normalization case and the explicit unresolved readonly state. */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
	DocLinkTag,
	SelectorKind,
	TSDocParser,
	type DocDeclarationReference,
	type DocNode,
} from "@microsoft/tsdoc";
import {
	SyntaxKind,
	NodeFlags,
	getSynthesizedDeepClone,
	getLeadingCommentRanges,
	type CallSignatureDeclaration,
	type FunctionLikeDeclaration,
	type FunctionTypeNode,
	type MethodSignatureDeclaration,
	type Node,
	type SourceFile,
} from "typescript/unstable/ast";
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
	isFunctionLikeDeclaration,
	isMethodSignatureDeclaration,
	isCallSignatureDeclaration,
	isFunctionTypeNode,
	isIdentifier,
	isClassDeclaration,
	isInterfaceDeclaration,
	isEnumDeclaration,
	isTypeAliasDeclaration,
	isVariableDeclaration,
	isTypeReferenceNode,
	isTypeQueryNode,
	isExpressionWithTypeArguments,
} from "typescript/unstable/ast/is";
import {
	API,
	NodeBuilderFlags,
	SignatureKind,
	SymbolFlags,
	TypeFlags,
	type Project,
	type Symbol as CompilerSymbol,
	type Type,
} from "typescript/unstable/sync";
import type { EffectiveConfiguration } from "../analysis-types/configuration.js";
import type {
	AnalysisFacts,
	ApiItemId,
	DeclarationFact,
	DeclarationContainerFact,
	DeclarationStatementFact,
	DeclaredMemberFact,
	DeclarationReferenceFact,
	DocumentationReferenceContext,
	DocumentationReferenceLookup,
	ExportFact,
	MemberFact,
	HeritageFact,
	Origin,
	SignatureFact,
	SourceDeclarationFact,
} from "../analysis-types/facts.js";
import { DiagnosticCode, failure, type Result } from "../analysis-types/result.js";
import { freezeData } from "../utilities/freezeData.js";
import { assertDefined } from "../utilities/assertDefined.js";
import type { ExtractedComments } from "./documentationContext.js";
import { createTsdocConfiguration } from "./tsdocConfiguration.js";

/**
 * An internal owner of a synchronous native compiler connection.
 */
export interface NativeAdapter {
	/**
	 * Extracts detached facts from a configuration using the owned connection.
	 *
	 * @param configuration - Resolved package inputs and modifier vocabulary.
	 * @param comments - Empty map populated with original parsed comments. Omit when the caller does not need the captured parser results.
	 * @returns Frozen facts or expected input diagnostics.
	 * @throws If compiler queries, file access, or extraction fail unexpectedly.
	 */
	analyze(
		configuration: EffectiveConfiguration,
		comments?: ExtractedComments,
	): Result<AnalysisFacts>;
	/**
	 * Closes the owned compiler connection.
	 */
	close(): void;
}

/**
 * Extracts declaration facts and closes the owned adapter on success or failure.
 *
 * @remarks
 * The optional comment map is invocation-owned working data, not part of the frozen facts.
 * It can be used after compiler disposal, but only with these facts and the same modifier vocabulary.
 * Discard it if extraction fails.
 *
 * @param configuration - Resolved package inputs.
 * @param adapter - An adapter whose ownership transfers to this call. Defaults to a new native adapter.
 * @param comments - Empty map to receive parsed comments for context creation. Omit when the caller does not need to reuse parser results after extraction.
 * @returns Detached facts or compiler input diagnostics.
 * @throws Propagates operational failures, preserving both extraction and cleanup errors when both fail.
 */
export function analyzeDeclarations(
	configuration: EffectiveConfiguration,
	adapter: NativeAdapter = createNativeAdapter(),
	comments?: ExtractedComments,
): Result<AnalysisFacts> {
	let result: Result<AnalysisFacts>;
	try {
		result = adapter.analyze(configuration, comments);
	} catch (error) {
		try {
			adapter.close();
		} catch (cleanupError) {
			throw new AggregateError(
				[error, cleanupError],
				"Analysis and compiler cleanup failed.",
				{ cause: error },
			);
		}
		throw error;
	}
	adapter.close();
	return result;
}

/**
 * Creates a synchronous adapter that owns a native TypeScript compiler connection.
 *
 * @remarks
 * Keeps unstable compiler objects inside the adapter.
 * Returns detached facts, which contain no compiler objects.
 * The caller owns the connection and must close it when it is no longer needed.
 * Public invocations use analyzeDeclarations to close this adapter after extraction.
 * This internal connection has no analysis-result cache.
 *
 * @returns An adapter with analysis and connection-cleanup operations.
 * @throws If the native compiler connection cannot be created.
 */
export function createNativeAdapter(): NativeAdapter {
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
		 * @param comments - Empty map populated with original parsed comments; discard it on failure. Omit to keep the extraction's parser-result map private.
		 * @returns Frozen, detached facts on success, or diagnostics for project,
		 * compiler, or entrypoint validation failures.
		 * @throws If compiler communication, file access, or fact extraction fails unexpectedly.
		 * The owning invocation closes the adapter and propagates these exceptions.
		 */
		analyze(
			configuration: EffectiveConfiguration,
			comments?: ExtractedComments,
		): Result<AnalysisFacts> {
			if (!existsSync(configuration.project)) {
				return failure(
					DiagnosticCode.ProjectMissing,
					`Project configuration not found: ${configuration.project}`,
				);
			}
			const snapshot = api.updateSnapshot({ openProjects: [configuration.project] });
			try {
				const project = snapshot.getProject(configuration.project);
				if (!project) {
					return failure(
						DiagnosticCode.ProjectMissing,
						`Cannot open project: ${configuration.project}`,
					);
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
						DiagnosticCode.CompilerDiagnostics,
						`Project ${configuration.project} has compiler diagnostics: ${JSON.stringify(diagnostics)}`,
					);
				}
				// TODO (Stage 2 documentation resolution): Retain general declaration and effective-member
				// lookup contexts, including recursive instantiated ancestry, before disposing this snapshot.
				return extractFacts(project, configuration, comments);
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
 * Invocation-owned TSDoc parser and captured comments, without compiler handles.
 */
export interface CollectionDocumentation {
	/**
	 * Parser configured with the invocation's custom modifier vocabulary.
	 */
	readonly parser: TSDocParser;
	/**
	 * Parsed comments indexed by documentation input identity for reuse after compiler disposal.
	 */
	readonly comments: ExtractedComments;
}

/**
 * Mutable state for declaration collection during one analysis.
 */
export interface CollectionState {
	/**
	 * Invocation-owned parser and comments retained for later semantic stages.
	 *
	 * @remarks
	 * Extraction supplies this state so each callable comment is parsed once with the shared vocabulary.
	 * @defaultValue Omitted by low-level callers that do not retain parser results.
	 * Lookup then creates standard-vocabulary parsers as needed and does not capture their results.
	 */
	readonly documentation?: CollectionDocumentation;
	/**
	 * Completed declaration facts keyed by provisional identifier.
	 */
	readonly declarations: Map<ApiItemId, DeclarationFact>;
	/**
	 * Identifiers on the current traversal path.
	 *
	 * @remarks
	 * Prevents repeated collection when exports or documentation references form a cycle.
	 */
	readonly visiting: Set<ApiItemId>;
}

/**
 * Extracts the supported semantic facts for all configured entrypoints.
 *
 * @remarks
 * Follows export targets and namespace exports before any output-specific selection.
 * Collects targets of supported function documentation inheritance requests and API links in the original declaration scope.
 * Does not collect every type reference or copy inherited documentation content.
 * Declaration tracking and package-owner caching are local to this call.
 * The caller must keep the project snapshot alive until extraction finishes.
 *
 * @param project - A compiler project whose diagnostics have already been checked.
 * @param configuration - Effective package, project, and entrypoint settings.
 * @param comments - Invocation-owned output map for parsed comments. Defaults to a new map.
 * @returns Deeply frozen facts, or diagnostics for invalid modifier settings or entrypoints.
 * @throws If compiler queries or package metadata reads fail, an export target is unresolved,
 * or a required signature or member type cannot be extracted.
 */
function extractFacts(
	project: Project,
	configuration: EffectiveConfiguration,
	comments: ExtractedComments = new Map(),
): Result<AnalysisFacts> {
	const locations: LocationContext = { configuration, packageCache: new Map() };
	const configured = createTsdocConfiguration(
		configuration,
		DiagnosticCode.ClassificationConfiguration,
	);
	if (!configured.ok) {
		return configured;
	}
	const state: CollectionState = {
		declarations: new Map(),
		visiting: new Set(),
		documentation: { parser: new TSDocParser(configured.value), comments },
	};
	// Start at each entrypoint. Export traversal fills the shared declaration map.
	const surfaces = [];
	for (const entrypoint of [...configuration.entrypoints].sort((left, right) =>
		left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
	)) {
		const source = project.program.getSourceFile(entrypoint.path);
		if (!source) {
			return failure(
				DiagnosticCode.EntrypointMissing,
				`Entrypoint ${entrypoint.name} is not in project ${configuration.project}: ${entrypoint.path}`,
			);
		}
		const moduleSymbol = project.checker.getSymbolAtLocation(source);
		if (!moduleSymbol) {
			return failure(
				DiagnosticCode.EntrypointModule,
				`Entrypoint is not a module: ${entrypoint.path}`,
			);
		}
		surfaces.push({
			name: entrypoint.name,
			exports: exportsOf(project, locations, state, moduleSymbol),
		});
	}
	// Preserve the exact analyzed inputs so consumers can reject stale dependency models without reanalysis.
	const inputPaths = new Set(
		[
			...configuration.entrypoints.map((entrypoint) => origin(locations, entrypoint.path, 0)),
			...[...state.declarations.values()].flatMap((declaration) => declaration.declarations),
		]
			.filter((source) => source.packageName === configuration.packageName)
			.map((source) => source.file),
	);
	const inputFiles = [...inputPaths].sort().map((file) => {
		const source = project.program.getSourceFile(
			path.resolve(configuration.packageRoot, file),
		);
		assert.ok(source, "Model input files must exist in the analyzed compiler project.");
		return { file, sha256: createHash("sha256").update(source.text).digest("hex") };
	});
	// Sort the result independently of traversal order before making it immutable.
	return freezeData({
		ok: true,
		value: {
			packageName: configuration.packageName,
			compilerVersion: "7.0.2",
			inputFiles,
			surfaces,
			declarations: [...state.declarations.values()].sort((left, right) =>
				left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
			),
		},
	});
}

/**
 * Package-name metadata read while locating a declaration's owning package.
 */
interface PackageNameMetadata {
	/**
	 * Package name declared in the nearest manifest.
	 * @defaultValue Omitted; ownership lookup uses the configured package name instead.
	 */
	readonly name?: string;
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
				const metadata = JSON.parse(readFileSync(manifest, "utf8")) as PackageNameMetadata;
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
export function identity(locations: LocationContext, symbol: CompilerSymbol): ApiItemId {
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
		[...new Set(declarationLocations.map((location) => JSON.stringify(location)))].sort(),
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
	if (explicit.length > 0) {
		return explicit.every(Boolean);
	}
	const symbol = checker.getExportsOfModule(moduleSymbol).find((item) => item.name === name);
	if (
		symbol?.declarations.some((handle) =>
			moduleSymbol.declarations.some((moduleHandle) => moduleHandle.path === handle.path),
		) === true
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
 * Also prints a call-signature declaration for declaration-oriented report rendering.
 * Retains the closest attached TSDoc comment without declaration text, or `undefined` if absent.
 * Preserves explicit empty comments so later inheritance can distinguish them from absent comments.
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
	owner: ApiItemId,
): SignatureFact[] {
	const { checker, emitter } = compiler;
	return checker.getSignaturesOfType(type, SignatureKind.Call).map((signature) => {
		const node = checker.signatureToSignatureDeclaration(signature, SyntaxKind.FunctionType);
		assert.ok(node, "The compiler must materialize a printable node for a call signature.");
		const functionTypeText = emitter.printNode(node).trim();
		const declaration = checker.signatureToSignatureDeclaration(
			signature,
			SyntaxKind.CallSignature,
		);
		assert.ok(declaration, "The compiler must materialize a call-signature declaration.");
		return {
			callSignatureText: emitter.printNode(declaration).trim(),
			id: `${owner}:${createHash("sha256").update(functionTypeText).digest("hex")}`,
			functionTypeText,
			documentation: originalComment(signature.declaration?.resolve()),
		};
	});
}

/**
 * Detaches one source declaration without combining or inheriting its documentation.
 *
 * @param locations - Package settings and cache used for the original location.
 * @param handle - A compiler declaration handle from a symbol.
 * @returns Original location, syntax kind, source text, and the closest attached TSDoc comment.
 */
function sourceDeclaration(
	locations: LocationContext,
	handle: CompilerSymbol["declarations"][number],
): SourceDeclarationFact {
	const node = handle.resolve();
	return {
		...origin(locations, handle.path, node?.pos ?? 0),
		kind: SyntaxKind[handle.kind],
		text: node?.getFullText() ?? "",
		documentation: originalComment(
			node &&
				isVariableDeclaration(node) &&
				node.parent.kind === SyntaxKind.VariableDeclarationList
				? node.parent.parent
				: node,
		),
	};
}

/**
 * Collects instantiated heritage views for local class and interface clauses.
 *
 * @remarks
 * Looks up the named expression rather than the resulting type to retain type alias declarations.
 * Instantiates member types without changing the target's original declaration facts or copying documentation.
 *
 * @param compiler - The checker and emitter for the active compiler snapshot.
 * @param locations - Package settings and cache used for target identities.
 * @param state - Declaration tracking shared with recursive target collection.
 * @param symbol - The symbol whose original class or interface declarations are inspected.
 * @param owner - The receiving declaration's identifier.
 * @param receiver - The receiving declaration's type, or undefined for modules.
 * @param receivingMembers - Detached effective members of the receiving declaration.
 * @returns Direct heritage views in source declaration and clause order, without adding exports.
 * @throws If a declaration or heritage target cannot be resolved.
 */
function heritageFacts(
	compiler: Pick<Project, "checker" | "emitter">,
	locations: LocationContext,
	state: CollectionState,
	symbol: CompilerSymbol,
	owner: ApiItemId,
	receiver: Type | undefined,
	receivingMembers: readonly MemberFact[],
): HeritageFact[] {
	const views: HeritageFact[] = [];
	for (const handle of symbol.declarations) {
		if (
			handle.kind !== SyntaxKind.ClassDeclaration &&
			handle.kind !== SyntaxKind.InterfaceDeclaration
		) {
			continue;
		}
		const node = handle.resolve();
		assert.ok(
			node && (isClassDeclaration(node) || isInterfaceDeclaration(node)),
			"The compiler must resolve a class or interface declaration.",
		);
		for (const clause of node.heritageClauses ?? []) {
			for (const heritageType of clause.types) {
				const heritageSymbol = compiler.checker.getSymbolAtLocation(heritageType.expression);
				assert.ok(heritageSymbol, "The compiler must resolve a heritage target.");
				const instantiated = compiler.checker.getTypeAtLocation(heritageType);
				assert.ok(instantiated, "The compiler must resolve an instantiated heritage type.");
				const targetId = collect(
					compiler,
					locations,
					state,
					target(compiler.checker, heritageSymbol),
				);
				const kind = clause.token === SyntaxKind.ExtendsKeyword ? "extends" : "implements";
				const viewOwner = `heritage:${JSON.stringify([owner, kind, targetId, compiler.checker.typeToString(instantiated)])}`;
				const viewMembers = members(compiler, locations, instantiated, viewOwner);
				views.push({
					kind,
					target: targetId,
					members: viewMembers,
					documentationMatches: receiver
						? documentationMatches(
								compiler.checker,
								receiver,
								instantiated,
								receivingMembers,
								viewMembers,
							)
						: [],
				});
			}
		}
	}
	return views;
}

/**
 * Matches non-overloaded named members using compiler compatibility and parameter documentation shape.
 *
 * @param checker - The checker for the active compiler snapshot.
 * @param receiver - The receiving type.
 * @param ancestor - The instantiated ancestor or implemented contract type.
 * @param receivingMembers - Detached receiving members.
 * @param ancestorMembers - Detached members of this instantiated heritage view.
 * @returns Compatible member pairs, without selecting among competing heritage sources.
 */
function documentationMatches(
	checker: Project["checker"],
	receiver: Type,
	ancestor: Type,
	receivingMembers: readonly MemberFact[],
	ancestorMembers: readonly MemberFact[],
): { source: ApiItemId; target: ApiItemId }[] {
	const matches: { source: ApiItemId; target: ApiItemId }[] = [];
	const receiverProperties = new Map(
		checker.getPropertiesOfType(receiver).map((property) => [property.name, property]),
	);
	const ancestorProperties = new Map(
		checker.getPropertiesOfType(ancestor).map((property) => [property.name, property]),
	);
	for (const member of receivingMembers) {
		const candidate = ancestorMembers.find((entry) => entry.name === member.name);
		const property = receiverProperties.get(member.name);
		const ancestorProperty = ancestorProperties.get(member.name);
		if (
			!candidate ||
			!property ||
			!ancestorProperty ||
			!haveCompatibleMemberShape(member, candidate)
		) {
			continue;
		}
		const receiverType = checker.getTypeOfSymbol(property);
		const ancestorType = checker.getTypeOfSymbol(ancestorProperty);
		// Missing types or failed compatibility checks leave this candidate unproven.
		// Skip it rather than infer compatibility from the detached display text.
		if (
			!receiverType ||
			!ancestorType ||
			!documentationTypesMatch(checker, receiverType, ancestorType)
		) {
			continue;
		}
		const receiverSignature = checker.getSignaturesOfType(
			checker.getNonNullableType(receiverType) ?? receiverType,
			SignatureKind.Call,
		)[0];
		const ancestorSignature = checker.getSignaturesOfType(
			checker.getNonNullableType(ancestorType) ?? ancestorType,
			SignatureKind.Call,
		)[0];
		if (receiverSignature && ancestorSignature) {
			const receivingNode = receiverSignature.declaration?.resolve();
			const ancestorNode = ancestorSignature.declaration?.resolve();
			// Parameter documentation requires inspectable source declarations.
			if (
				!isDocumentationSignatureDeclaration(receivingNode) ||
				!isDocumentationSignatureDeclaration(ancestorNode)
			) {
				continue;
			}
			// Destructuring or different parameter names/flags would require adapting the copied docs.
			if (!haveMatchingDocumentationParameters(receivingNode, ancestorNode)) {
				continue;
			}
			// Method parameters can be bivariant, so whole-method assignability is insufficient.
			// Require mutual compatibility for individual parameter and return types as well.
			if (
				!documentationTypesMatch(
					checker,
					checker.getReturnTypeOfSignature(receiverSignature),
					checker.getReturnTypeOfSignature(ancestorSignature),
				) ||
				receiverSignature
					.getParameters()
					.some(
						(_parameter, index) =>
							!documentationTypesMatch(
								checker,
								checker.getParameterType(receiverSignature, index),
								checker.getParameterType(ancestorSignature, index),
							),
					)
			) {
				continue;
			}
		}
		matches.push({ source: member.id, target: candidate.id });
	}
	return matches;
}

/**
 * Checks member flags and callable counts required for automatic documentation matching.
 *
 * @remarks
 * Excludes overloads and mismatched or unresolved optional/readonly state.
 * Does not check names, type compatibility, local comments, or competing sources.
 *
 * @param receiver - The receiving member.
 * @param candidate - The candidate documentation source member.
 * @returns Whether the member shapes permit further compatibility checks.
 */
function haveCompatibleMemberShape(receiver: MemberFact, candidate: MemberFact): boolean {
	return (
		// An overloaded receiver would require selecting which signatures receive documentation.
		receiver.signatures.length <= 1 &&
		// An overloaded source would require selecting which signature supplies documentation.
		candidate.signatures.length <= 1 &&
		// Do not copy between callable and non-callable members.
		receiver.signatures.length === candidate.signatures.length &&
		// Documentation for a required member may not describe an optional member, or vice versa.
		receiver.optional === candidate.optional &&
		// Copied documentation must not imply different write access.
		receiver.readonly === candidate.readonly &&
		// Equal unknown states do not establish compatible write access.
		receiver.readonly !== null
	);
}

/**
 * Callable source forms whose parameter documentation can be inspected.
 */
type DocumentationSignatureDeclaration =
	| FunctionLikeDeclaration
	| MethodSignatureDeclaration
	| CallSignatureDeclaration
	| FunctionTypeNode;

/**
 * Narrows a resolved source node to a supported callable declaration.
 *
 * @param node - The original source node, or undefined if it cannot be resolved.
 * @returns Whether the node has a supported callable form with inspectable parameters.
 */
function isDocumentationSignatureDeclaration(
	node: Node | undefined,
): node is DocumentationSignatureDeclaration {
	// The compiler's function-like guard excludes method signatures, call signatures, and function types.
	return (
		// Unresolved source nodes cannot establish parameter names or declaration flags.
		node !== undefined &&
		// Accept concrete callable declarations, including class methods.
		(isFunctionLikeDeclaration(node) ||
			// Interface and type-literal methods have signatures without implementations.
			isMethodSignatureDeclaration(node) ||
			// Callable object types declare their parameters on call signatures.
			isCallSignatureDeclaration(node) ||
			// Function-typed properties declare their parameters on function type nodes.
			isFunctionTypeNode(node))
	);
}

/**
 * Checks whether parameter documentation can be copied without adapting names or declaration flags.
 *
 * @remarks
 * Rejects destructuring and requires matching parameter and type-parameter names in declaration order.
 * Optional parameters include parameters with initializers. Rest flags must also match.
 * Does not compare parameter types, generic constraints, or generic defaults.
 *
 * @param receiver - The receiving callable declaration.
 * @param candidate - The candidate documentation source declaration.
 * @returns Whether parameter documentation has the same names and shape on both declarations.
 */
function haveMatchingDocumentationParameters(
	receiver: DocumentationSignatureDeclaration,
	candidate: DocumentationSignatureDeclaration,
): boolean {
	const receivingTypeParameters = receiver.typeParameters ?? [];
	const candidateTypeParameters = candidate.typeParameters ?? [];
	return (
		// Added or removed parameters would leave copied documentation incomplete or stale.
		receiver.parameters.length === candidate.parameters.length &&
		// Compare in declaration order; do not remap documentation across reordered parameters.
		receiver.parameters.every((parameter, index) => {
			const other = assertDefined(
				candidate.parameters[index],
				"Equal parameter counts must provide a corresponding source parameter.",
			);
			return (
				// A destructured receiver has no single identifier to match a copied @param tag.
				isIdentifier(parameter.name) &&
				// A destructured source likewise cannot supply a directly reusable parameter name.
				isIdentifier(other.name) &&
				// Copied @param tags must name the receiving parameters without rewriting.
				parameter.name.text === other.name.text &&
				// Treat both '?' and an initializer as optional for this documentation-shape check.
				(parameter.questionToken !== undefined || parameter.initializer !== undefined) ===
					(other.questionToken !== undefined || other.initializer !== undefined) &&
				// A rest parameter describes multiple arguments, unlike an ordinary parameter.
				(parameter.dotDotDotToken !== undefined) === (other.dotDotDotToken !== undefined)
			);
		}) &&
		// Added or removed type parameters would leave copied @typeParam tags incomplete or stale.
		receivingTypeParameters.length === candidateTypeParameters.length &&
		// Preserve type-parameter names and order so their documentation needs no remapping.
		receivingTypeParameters.every((parameter, index) => {
			const other = assertDefined(
				candidateTypeParameters[index],
				"Equal type-parameter counts must provide a corresponding source type parameter.",
			);
			return parameter.name.text === other.name.text;
		})
	);
}

/**
 * Requires mutual compiler assignability without top-level any or unknown types.
 *
 * @param checker - The checker for the active compiler snapshot.
 * @param receiver - The receiving type, or undefined when unresolved.
 * @param candidate - The candidate documentation source type, or undefined when unresolved.
 * @returns Whether the compiler establishes compatibility without an unconstrained top-level type.
 */
function documentationTypesMatch(
	checker: Project["checker"],
	receiver: Type | undefined,
	candidate: Type | undefined,
): boolean {
	return (
		// An unresolved receiving type provides no evidence of compatibility.
		receiver !== undefined &&
		// The source type must also be available for a compiler-backed comparison.
		candidate !== undefined &&
		// Top-level any or unknown can obscure differences that make copied documentation unsafe.
		!((receiver.flags | candidate.flags) & (TypeFlags.Any | TypeFlags.Unknown)) &&
		// Reject receiving types that are broader than the source permits.
		checker.isTypeAssignableTo(receiver, candidate) &&
		// Also reject narrowing; one-way assignability is insufficient for copying documentation.
		checker.isTypeAssignableTo(candidate, receiver)
	);
}

/**
 * Extracts effective properties and methods from an object or intersection type.
 *
 * @remarks
 * Uses compiler-resolved property types, including supported inherited and generic members.
 * Retains each member's original source declarations and comments without merging overload documentation.
 * Scopes member identities to the containing declaration and extracts effective call signatures.
 * Removes null and undefined from member types so optional methods retain their signatures.
 * Reads readonly modifiers from a generated type literal where possible, then from declarations.
 * Uses `null` for readonly state when neither source is available.
 * When extraction state is supplied, callable signatures and single non-callable properties retain original lookup context.
 * Callable-property comments, accessors, merged properties, and heritage comparison views do not receive property contexts.
 *
 * @param compiler - The checker and emitter for the active compiler snapshot.
 * @param locations - Package settings and cache used for member origins.
 * @param type - The compiler type whose effective members are requested.
 * @param owner - The identifier of the containing declaration or instantiated heritage view.
 * @param state - Extraction state for original-scope lookup and target collection. Omit to extract member syntax and source records without documentation lookup contexts.
 * @returns Detached members sorted by name. Other type categories produce an empty array.
 * @throws If the compiler cannot resolve an effective property type.
 */
export function members(
	compiler: Pick<Project, "checker" | "emitter">,
	locations: LocationContext,
	type: Type,
	owner: ApiItemId,
	state?: CollectionState,
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
			const nameNode: unknown =
				declaration && "name" in declaration ? declaration.name : undefined;
			// Print computed names to avoid compiler symbol names that contain temporary IDs.
			const name =
				nameNode !== null && typeof nameNode === "object" && "kind" in nameNode
					? emitter.printNode(nameNode as Node).trim()
					: property.name;
			const readonly =
				modifiers.get(property.name) ??
				(nodes.length > 0
					? nodes.some(
							(item) =>
								"modifiers" in item &&
								Array.isArray(item.modifiers) &&
								item.modifiers.some(
									(modifier: Node) => modifier.kind === SyntaxKind.ReadonlyKeyword,
								),
						)
					: null);
			assert.ok(propertyType, "The compiler must resolve the effective type of a member.");
			const id = `member:${JSON.stringify([owner, name])}`;
			const callableType = checker.getNonNullableType(propertyType);
			const callableSignatures = callableType ? signatures(compiler, callableType, id) : [];
			const sourceDeclarations = property.declarations.map((handle) =>
				sourceDeclaration(locations, handle),
			);
			const propertyContext =
				state &&
				property.declarations.length === 1 &&
				declaration &&
				(declaration.kind === SyntaxKind.PropertyDeclaration ||
					declaration.kind === SyntaxKind.PropertySignature)
					? referenceContext(
							compiler,
							locations,
							state,
							declaration,
							assertDefined(sourceDeclarations[0]),
							id,
							sourceDeclarations[0]?.documentation,
						)
					: undefined;
			return {
				id,
				...(propertyContext === undefined ? {} : { documentationContext: propertyContext }),
				signatures:
					callableType && state
						? withDocumentationContexts(
								compiler,
								locations,
								state,
								callableType,
								callableSignatures,
							)
						: callableSignatures,
				name,
				type: checker.typeToString(propertyType, declaration),
				optional: Boolean(property.flags & SymbolFlags.Optional),
				readonly,
				declarations: sourceDeclarations,
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
 * Looks up one documentation reference in its original declaration scope.
 *
 * @remarks
 * Internal helper. Not exported from the package entrypoint.
 * Supports unqualified names and falls back to module export aliases.
 * Inheritance also accepts namespace and instance method paths, with a terminal numeric selector.
 * Static class members are unsupported; a static/instance name collision is never guessed.
 * Collects resolved targets into the supplied state, including targets that are not exported.
 * Does not validate TSDoc syntax, target compatibility, or release policies.
 * The caller must keep the compiler snapshot alive until lookup finishes.
 *
 * @param compiler - The checker and emitter for the active compiler snapshot.
 * @param locations - Package settings and cache used for declaration locations.
 * @param state - Declaration tracking updated in place. Discard it if extraction throws.
 * @param node - The original declaration node used for name resolution.
 * @param source - The source file that contains the original declaration.
 * @param reference - Parsed declaration reference. Undefined represents a target-less inheritance request and produces an unsupported lookup, not an inferred target.
 * @param allowIndexSelector - Whether this lookup accepts numeric inheritance selectors.
 * @returns Detached lookup facts without compatibility or release-policy validation.
 * @throws If compiler queries or target collection fail unexpectedly.
 */
export function lookupReference(
	compiler: Pick<Project, "checker" | "emitter">,
	locations: LocationContext,
	state: CollectionState,
	node: Node,
	source: SourceFile,
	reference: DocDeclarationReference | undefined,
	allowIndexSelector: boolean,
): DocumentationReferenceLookup {
	const { checker } = compiler;
	const member = reference?.memberReferences[0];
	const name = member?.memberIdentifier?.identifier;
	// Accept only explicit references without package or import-path qualification.
	// This is a lookup capability check, not TSDoc syntax or target compatibility validation.
	const supported =
		reference !== undefined &&
		reference.packageName === undefined &&
		reference.importPath === undefined &&
		// Inheritance permits member paths; API links currently permit only one name.
		(allowIndexSelector || reference.memberReferences.length === 1) &&
		name !== undefined &&
		reference.memberReferences.every(
			(part, index) =>
				// Every path component must be named, rather than expressed as a symbol reference.
				part.memberIdentifier !== undefined &&
				part.memberSymbol === undefined &&
				// Only inheritance accepts a selector, and only a numeric selector on the final component.
				// The binder later validates its range and selects the individual callable signature.
				(part.selector === undefined ||
					(allowIndexSelector &&
						index === reference.memberReferences.length - 1 &&
						part.selector.selectorKind === SelectorKind.Index)),
		);
	let targetId: ApiItemId | undefined;
	if (supported && name !== undefined) {
		const moduleSymbol = checker.getSymbolAtLocation(source);
		// Resolve the first name where the comment was written, including local and imported names.
		// Fall back to exported aliases only when lexical lookup returns no symbol.
		const found =
			checker.resolveName(
				name,
				SymbolFlags.Value | SymbolFlags.Type | SymbolFlags.Namespace,
				node,
			) ??
			(moduleSymbol
				? checker.getExportsOfModule(moduleSymbol).find((entry) => entry.name === name)
				: undefined);
		// The compiler's unknown-symbol sentinel is not a declaration we can traverse or collect.
		if (found !== undefined && !checker.isUnknownSymbol(found)) {
			// Follow aliases before inspecting the kind of container that owns the next path component.
			let resolved: CompilerSymbol | undefined = target(checker, found);
			for (const part of reference.memberReferences.slice(1)) {
				// A failed intermediate lookup invalidates the whole path; do not restart in outer scope.
				if (!resolved || checker.isUnknownSymbol(resolved)) {
					break;
				}
				const partName = part.memberIdentifier?.identifier;
				if (resolved.flags & (SymbolFlags.Class | SymbolFlags.Interface)) {
					// TODO (Stage 2 reference syntax): Resolve explicit static and instance selectors through
					// the corresponding compiler type. Keep unqualified static/instance collisions ambiguous.
					// Classes also have a static side. Reject any matching static name, even when an
					// instance member has the same name, rather than silently choosing the instance member.
					if (resolved.flags & SymbolFlags.Class) {
						const staticType = checker.getTypeOfSymbol(resolved);
						if (
							staticType &&
							checker.getPropertiesOfType(staticType).some((entry) => entry.name === partName)
						) {
							return { reference: reference.emitAsTsdoc(), status: "unsupported" };
						}
					}
					// The declared type exposes instance members, including inherited members, not class statics.
					const ownerType = checker.getDeclaredTypeOfSymbol(resolved);
					resolved = checker
						.getPropertiesOfType(ownerType)
						.find((entry) => entry.name === partName);
				} else if (resolved.flags & SymbolFlags.Module) {
					// Namespace and module paths traverse exports instead of instance properties.
					resolved = checker
						.getExportsOfModule(resolved)
						.find((entry) => entry.name === partName);
				} else {
					// Other symbol kinds cannot supply the remaining path through this lookup implementation.
					resolved = undefined;
				}
				if (resolved) {
					// Each exported path component can itself be an alias, including the final target.
					resolved = target(checker, resolved);
				}
			}
			if (resolved && !checker.isUnknownSymbol(resolved)) {
				// Retain the target's detached facts even when no entrypoint exports it.
				targetId = collect(compiler, locations, state, resolved);
			}
		}
	}
	// Preserve the reference text and distinguish unsupported forms from supported lookups that found no target.
	const referenceText = reference?.emitAsTsdoc() ?? "";
	if (!supported) {
		return { reference: referenceText, status: "unsupported" };
	}
	if (targetId === undefined) {
		return { reference: referenceText, status: "not-found" };
	}
	return { reference: referenceText, status: "resolved", target: targetId };
}

/**
 * Collects API link lookup results from a parsed documentation tree.
 *
 * @remarks
 * Internal helper. Not exported from the package entrypoint.
 * Visits each node before its children and retains repeated references in traversal order.
 * Excludes URL links. Does not change the documentation tree or validate lookup outcomes.
 *
 * @param documentationNode - The root of the TSDoc subtree to inspect.
 * @param lookup - Resolves each API link in the original declaration scope.
 * @returns A new array of lookup results. Empty when the subtree contains no API links.
 * @throws If the supplied lookup function throws.
 */
export function collectLinks(
	documentationNode: DocNode,
	lookup: (reference: DocDeclarationReference) => DocumentationReferenceLookup,
): DocumentationReferenceLookup[] {
	const links: DocumentationReferenceLookup[] = [];
	function visit(node: DocNode): void {
		if (node instanceof DocLinkTag && node.codeDestination !== undefined) {
			links.push(lookup(node.codeDestination));
		}
		for (const child of node.getChildNodes()) {
			visit(child);
		}
	}
	visit(documentationNode);
	return links;
}

/**
 * Collects facts for a resolved symbol, its namespace exports, and supported documentation targets.
 *
 * @remarks
 * Reuses completed declarations by provisional identifier.
 * Tracks identifiers on the current traversal path to stop collection cycles.
 * Adds completed facts to the supplied declaration map.
 * For collected functions and methods, retains parameter facts and original-scope documentation lookups.
 * Effective callable member views retain the same lookup facts independently of their substituted types.
 * Records API links in TSDoc tree traversal order, including links inside blocks and repeated references.
 * Excludes URL links from lookup. Missing and unsupported references remain explicit lookup results.
 * Resolves documentation names in the original declaration scope before checking module export aliases.
 * Retains documentation targets that are not exported, if they exist in the compiler inputs.
 * Retains direct class and interface base declarations through compiler-resolved symbols.
 * Collects unexported bases without adding them to the export surface.
 * Retains local class implements targets separately from base declarations without copying their members.
 * Retains direct instantiated heritage member views separately from the original target declarations.
 * Does not validate TSDoc syntax, check target compatibility, or copy inherited documentation content.
 * Marks conditional, indexed-access, and union types as partial, along with member lists
 * that contain an unresolved readonly state.
 * Does not recursively collect every type referenced by a declaration.
 *
 * @param compiler - The checker and emitter for the active compiler snapshot.
 * @param locations - Package settings and cache used for declaration locations.
 * @param state - Declaration tracking updated in place. Discard it if extraction throws.
 * @param symbol - A declaration target after alias resolution.
 * @returns The provisional identifier used to reference the declaration in this result.
 * @throws If a declaration or heritage target cannot be resolved, or extraction of required facts fails.
 */
export function collect(
	compiler: Pick<Project, "checker" | "emitter">,
	locations: LocationContext,
	state: CollectionState,
	symbol: CompilerSymbol,
): ApiItemId {
	const { checker } = compiler;
	const { declarations, visiting } = state;
	assert.ok(
		!checker.isUnknownSymbol(symbol),
		"Collected declaration symbols must be resolved.",
	);
	const id = identity(locations, symbol);
	if (declarations.has(id) || visiting.has(id)) {
		return id;
	}
	// Reserve the identifier before following exports or documentation references back to this symbol.
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
	const effectiveMembers =
		type && !(symbol.flags & SymbolFlags.Module)
			? members(compiler, locations, type, id, state)
			: [];
	const baseDeclarations = collectBaseDeclarations(compiler, locations, state, symbol, type);
	const namespaceExports =
		symbol.flags & SymbolFlags.Module ? exportsOf(compiler, locations, state, symbol) : [];
	const heritage = heritageFacts(
		compiler,
		locations,
		state,
		symbol,
		id,
		type,
		effectiveMembers,
	);
	const implemented = heritage
		.filter((entry) => entry.kind === "implements")
		.map((entry) => entry.target);
	const partial = Boolean(
		type &&
			(type.isConditionalType() ||
				type.isIndexedAccessType() ||
				type.isUnionType() ||
				effectiveMembers.some((member) => member.readonly === null)),
	);
	const callSignatures = declarationSignatures(compiler, locations, state, symbol, type, id);
	const sources = symbol.declarations.map((handle) => sourceDeclaration(locations, handle));
	const source = sources[0];
	const sourceNode = symbol.declarations[0]?.resolve();
	const documentationContext = declarationDocumentationContext(
		compiler,
		locations,
		state,
		sources,
		sourceNode,
		id,
	);
	const container =
		sourceNode && source && sources.length === 1
			? containerSyntax(compiler, locations, state, sourceNode, source, id)
			: undefined;
	const statement = statementSyntax(compiler, sourceNode, type);
	// Publish only after recursive dependencies have been collected; active identities prevent cycles.
	declarations.set(id, {
		id,
		...(documentationContext === undefined ? {} : { documentationContext }),
		...(container === undefined ? {} : { container }),
		...(statement === undefined ? {} : { statement }),
		baseDeclarations,
		heritage,
		implementedDeclarations: implemented,
		name: moduleSource ? origin(locations, moduleSource.path, 0).file : symbol.name,
		declarations: sources,
		type: type ? checker.typeToString(type, symbol.declarations[0]?.resolve()) : "",
		memberView: partial ? "partial" : "complete",
		limitations: partial
			? [
					{
						code: DiagnosticCode.MemberExpansionIncomplete,
						message: `Member expansion for ${symbol.name} is incomplete. Retain the original declaration and do not present this member list as complete.`,
					},
				]
			: [],
		members: effectiveMembers,
		signatures: callSignatures,
		exports: namespaceExports,
	});
	visiting.delete(id);
	return id;
}

/**
 * Collects original base declarations without treating implements clauses as inherited bases.
 *
 * @param compiler - Active checker and emitter.
 * @param locations - Package ownership lookup state.
 * @param state - Shared declaration collection and active traversal identities.
 * @param symbol - Resolved declaration symbol.
 * @param type - Declared type, or undefined for source-file modules; those have no bases.
 * @returns Base declaration identities in compiler order, or an empty array for other forms.
 */
function collectBaseDeclarations(
	compiler: Pick<Project, "checker" | "emitter">,
	locations: LocationContext,
	state: CollectionState,
	symbol: CompilerSymbol,
	type: Type | undefined,
): ApiItemId[] {
	if (
		!(symbol.flags & (SymbolFlags.Class | SymbolFlags.Interface)) ||
		type?.isClassOrInterface() !== true
	)
		return [];
	return compiler.checker.getBaseTypes(type).map((base) => {
		const baseSymbol = base.getSymbol();
		assert.ok(baseSymbol, "The compiler must resolve a declaration symbol for a base type.");
		return collect(compiler, locations, state, target(compiler.checker, baseSymbol));
	});
}

/**
 * Extracts callable signatures and adds original lookup context for function and method declarations.
 *
 * @param compiler - Active checker and emitter.
 * @param locations - Package ownership lookup state.
 * @param state - Target collection and parsed comments for this invocation.
 * @param symbol - Resolved declaration symbol.
 * @param type - Callable type, or undefined when no type was extracted; produces no signatures.
 * @param id - Owning declaration identity.
 * @returns Detached signatures in compiler order, with lookup contexts where supported.
 */
function declarationSignatures(
	compiler: Pick<Project, "checker" | "emitter">,
	locations: LocationContext,
	state: CollectionState,
	symbol: CompilerSymbol,
	type: Type | undefined,
	id: ApiItemId,
): SignatureFact[] {
	if (type === undefined) return [];
	const facts = signatures(compiler, type, id);
	const hasCallableComment = symbol.declarations.every(
		(handle) =>
			handle.kind === SyntaxKind.FunctionDeclaration ||
			handle.kind === SyntaxKind.MethodDeclaration ||
			handle.kind === SyntaxKind.MethodSignature,
	);
	return hasCallableComment
		? withDocumentationContexts(compiler, locations, state, type, facts)
		: facts;
}

/**
 * Captures a single declaration's documentation without selecting a comment from merged sources.
 *
 * @param compiler - Active checker and emitter.
 * @param locations - Package ownership lookup state.
 * @param state - Target collection and parsed comments for this invocation.
 * @param sources - Original declaration records in compiler order.
 * @param sourceNode - First declaration node, or undefined when unavailable; no context is produced then.
 * @param id - Owning declaration identity.
 * @returns Original reference context, or undefined for merged, unavailable, or unsupported declarations.
 */
function declarationDocumentationContext(
	compiler: Pick<Project, "checker" | "emitter">,
	locations: LocationContext,
	state: CollectionState,
	sources: readonly SourceDeclarationFact[],
	sourceNode: Node | undefined,
	id: ApiItemId,
): DocumentationReferenceContext | undefined {
	const source = sources[0];
	if (!sourceNode || !source || sources.length !== 1) return undefined;
	const supported =
		source.kind === "PropertyDeclaration" ||
		source.kind === "PropertySignature" ||
		isClassDeclaration(sourceNode) ||
		isInterfaceDeclaration(sourceNode) ||
		isEnumDeclaration(sourceNode) ||
		isTypeAliasDeclaration(sourceNode) ||
		isModuleDeclaration(sourceNode) ||
		isVariableDeclaration(sourceNode);
	return supported
		? referenceContext(
				compiler,
				locations,
				state,
				sourceNode,
				source,
				id,
				source.documentation,
			)
		: undefined;
}

/**
 * Extracts a container header and syntax not represented by effective instance properties.
 * @param compiler - Active checker and emitter.
 * @param locations - Package ownership lookup state.
 * @param state - Target collection and parsed comments for this invocation.
 * @param node - The single original declaration node.
 * @param source - Original declaration location and comment.
 * @param id - Owning declaration identity.
 * @returns A detached class, interface, or enum container; undefined for other forms.
 */
function containerSyntax(
	compiler: Pick<Project, "checker" | "emitter">,
	locations: LocationContext,
	state: CollectionState,
	node: Node,
	source: SourceDeclarationFact,
	id: ApiItemId,
): DeclarationContainerFact | undefined {
	if (isClassDeclaration(node) || isInterfaceDeclaration(node)) {
		const kind = isClassDeclaration(node) ? "class" : "interface";
		const parameters =
			node.typeParameters?.map((parameter) => compiler.emitter.printNode(parameter).trim()) ??
			[];
		const heritage =
			node.heritageClauses?.map((clause) => compiler.emitter.printNode(clause).trim()) ?? [];
		return {
			kind,
			prefix: `${node.modifiers?.some((modifier) => modifier.kind === SyntaxKind.AbstractKeyword) === true ? "abstract " : ""}${kind} `,
			suffix: `${parameters.length > 0 ? `<${parameters.join(", ")}>` : ""}${heritage.length > 0 ? ` ${heritage.join(" ")}` : ""}`,
			supported: node.members.every(
				(member) =>
					member.kind !== SyntaxKind.ClassStaticBlockDeclaration &&
					!("body" in member && member.body !== undefined),
			),
			declaredMembers: node.members.filter(needsDeclaredMemberRecord).map((member) => {
				// Remove trivia only on the printing clone; lookup still uses the original member node.
				const printed = compiler.emitter.printNode(getSynthesizedDeepClone(member)).trim();
				const memberId = `${id}:declared:${createHash("sha256").update(printed).digest("hex")}`;
				return declaredMemberRecord(
					compiler,
					locations,
					state,
					member,
					source,
					memberId,
					printed,
				);
			}),
		};
	}
	if (isEnumDeclaration(node)) {
		return {
			kind: "enum",
			prefix: `${node.modifiers?.some((modifier) => modifier.kind === SyntaxKind.ConstKeyword) === true ? "const " : ""}enum `,
			suffix: "",
			supported: true,
			declaredMembers: node.members.map((member) => {
				const printed = `${compiler.emitter.printNode(getSynthesizedDeepClone(member)).trim()},`;
				const memberId = `${id}:enum:${compiler.emitter.printNode(member.name).trim()}`;
				return declaredMemberRecord(
					compiler,
					locations,
					state,
					member,
					source,
					memberId,
					printed,
				);
			}),
		};
	}
	return undefined;
}

/**
 * Identifies members whose syntax or visibility requires a separate declaration record.
 * @param member - Original class or interface member.
 * @returns Whether this member is not an ordinary public instance property or method.
 */
function needsDeclaredMemberRecord(member: Node): boolean {
	return (
		(member.kind !== SyntaxKind.PropertyDeclaration &&
			member.kind !== SyntaxKind.PropertySignature &&
			member.kind !== SyntaxKind.MethodDeclaration &&
			member.kind !== SyntaxKind.MethodSignature) ||
		("modifiers" in member &&
			Array.isArray(member.modifiers) &&
			member.modifiers.some(
				(modifier: Node) =>
					modifier.kind === SyntaxKind.StaticKeyword ||
					modifier.kind === SyntaxKind.PrivateKeyword ||
					modifier.kind === SyntaxKind.ProtectedKeyword,
			))
	);
}

/**
 * Retains original documentation and independently printed syntax for one declaration member.
 * @param compiler - Active checker and emitter.
 * @param locations - Package ownership lookup state.
 * @param state - Target collection and parsed comments for this invocation.
 * @param member - Original member node, not a synthesized printing clone.
 * @param source - Location of the containing declaration.
 * @param id - Member identity derived from its owner and syntax.
 * @param printed - Comment-free compiler-printed syntax.
 * @returns Detached source and reference records for this member.
 */
function declaredMemberRecord(
	compiler: Pick<Project, "checker" | "emitter">,
	locations: LocationContext,
	state: CollectionState,
	member: Node,
	source: Origin,
	id: ApiItemId,
	printed: string,
): DeclaredMemberFact {
	const location = { packageName: source.packageName, file: source.file, start: member.pos };
	const documentation = originalComment(member);
	return {
		...location,
		kind: SyntaxKind[member.kind],
		text: member.getFullText(),
		documentation,
		id,
		printed,
		documentationContext: referenceContext(
			compiler,
			locations,
			state,
			member,
			location,
			id,
			documentation,
		),
	};
}

/**
 * Extracts atomic declaration syntax while keeping the name available for alias rendering.
 * @param compiler - Active checker and emitter.
 * @param sourceNode - Original node, or undefined when unavailable; produces no statement then.
 * @param type - Effective variable type; if undefined and no type or initializer exists, prints unknown.
 * @returns Detached type alias or variable syntax, or undefined for other declarations.
 */
function statementSyntax(
	compiler: Pick<Project, "checker" | "emitter">,
	sourceNode: Node | undefined,
	type: Type | undefined,
): DeclarationStatementFact | undefined {
	if (sourceNode && isTypeAliasDeclaration(sourceNode)) {
		return {
			prefix: "type ",
			suffix: `${sourceNode.typeParameters === undefined ? "" : `<${sourceNode.typeParameters.map((parameter) => compiler.emitter.printNode(getSynthesizedDeepClone(parameter)).trim()).join(", ")}>`} = ${compiler.emitter.printNode(getSynthesizedDeepClone(sourceNode.type)).trim()};`,
		};
	}
	if (sourceNode && isVariableDeclaration(sourceNode)) {
		return {
			prefix:
				sourceNode.parent.flags & NodeFlags.Const
					? "const "
					: sourceNode.parent.flags & NodeFlags.Let
						? "let "
						: "var ",
			suffix: sourceNode.type
				? `: ${compiler.emitter.printNode(getSynthesizedDeepClone(sourceNode.type)).trim()};`
				: sourceNode.initializer
					? ` = ${compiler.emitter.printNode(getSynthesizedDeepClone(sourceNode.initializer)).trim()};`
					: `: ${type ? compiler.checker.typeToString(type, sourceNode) : "unknown"};`,
		};
	}
	return undefined;
}

/**
 * Adds original-scope lookup context without changing instantiated signature text or identity.
 *
 * @param compiler - The checker and emitter for the active snapshot.
 * @param locations - Original package-location lookup state.
 * @param state - Target collection and parsed comments owned by this extraction.
 * @param type - The callable type whose signatures were extracted.
 * @param facts - Signature facts in the same order as the compiler signatures.
 * @returns New signature records with context for inspectable callable declarations.
 * @throws If compiler signature identities or original source locations are inconsistent.
 */
function withDocumentationContexts(
	compiler: Pick<Project, "checker" | "emitter">,
	locations: LocationContext,
	state: CollectionState,
	type: Type,
	facts: readonly SignatureFact[],
): SignatureFact[] {
	return compiler.checker
		.getSignaturesOfType(type, SignatureKind.Call)
		.map((signature, index) => {
			const fact = assertDefined(
				facts[index],
				"Compiler signatures must correspond to extracted signature facts.",
			);
			const handle = signature.declaration;
			const node = handle?.resolve();
			if (!handle || !isDocumentationSignatureDeclaration(node)) {
				return fact;
			}
			return {
				...fact,
				documentationContext: {
					...referenceContext(
						compiler,
						locations,
						state,
						node,
						origin(locations, handle.path, node.pos),
						fact.id,
						fact.documentation,
					),
					parameters: node.parameters.map((parameter) => ({
						...(isIdentifier(parameter.name) ? { name: parameter.name.text } : {}),
						optional:
							parameter.questionToken !== undefined || parameter.initializer !== undefined,
						rest: parameter.dotDotDotToken !== undefined,
					})),
					typeParameters: node.typeParameters?.map((parameter) => parameter.name.text) ?? [],
				},
			};
		});
}

/**
 * Captures original name lookup without retaining compiler nodes in the extracted facts.
 *
 * @param compiler - Active checker and emitter.
 * @param locations - Package-location lookup state.
 * @param state - Target collection and parsed comments for this invocation.
 * @param node - Original declaration, including for instantiated member views.
 * @param location - Original package-relative location.
 * @param id - Identity of the comment input.
 * @param documentation - Original comment text, including explicit empty comments. Undefined uses an empty parser tree without adding a source comment.
 * @returns Detached reference facts; parsed nodes remain private to the invocation.
 */
function referenceContext(
	compiler: Pick<Project, "checker" | "emitter">,
	locations: LocationContext,
	state: CollectionState,
	node: Node,
	location: Origin,
	id: ApiItemId,
	documentation: string | undefined,
): DocumentationReferenceContext {
	let source = node;
	while (!isSourceFile(source)) {
		source = source.parent;
	}
	const parsed = (state.documentation?.parser ?? new TSDocParser()).parseString(
		documentation ?? "/** */",
	);
	state.documentation?.comments.set(id, parsed);
	const links = collectLinks(parsed.docComment, (reference) =>
		lookupReference(compiler, locations, state, node, source, reference, false),
	);
	const request = parsed.docComment.inheritDocTag;
	const inheritance =
		request === undefined
			? undefined
			: lookupReference(
					compiler,
					locations,
					state,
					node,
					source,
					request.declarationReference,
					true,
				);
	return {
		origin: { packageName: location.packageName, file: location.file, start: location.start },
		typeReferences: declarationReferences(compiler, locations, state, node, location),
		links,
		...(inheritance === undefined ? {} : { inheritance }),
	};
}

/**
 * Captures reference identities from original type syntax without parsing printed types.
 *
 * @param compiler - Active checker and emitter.
 * @param locations - Package ownership lookup state.
 * @param state - Shared target collection for this invocation.
 * @param node - Original declaration whose type syntax is inspected.
 * @param location - Package-relative declaration location.
 * @returns Ordered reference occurrences, excluding type parameters and standard-library targets.
 */
function declarationReferences(
	compiler: Pick<Project, "checker" | "emitter">,
	locations: LocationContext,
	state: CollectionState,
	node: Node,
	location: Origin,
): DeclarationReferenceFact[] {
	const references: DeclarationReferenceFact[] = [];
	function visit(current: Node): void {
		if (current.kind === SyntaxKind.Block) return;
		const name = isTypeReferenceNode(current)
			? current.typeName
			: isTypeQueryNode(current)
				? current.exprName
				: isExpressionWithTypeArguments(current)
					? current.expression
					: undefined;
		if (name !== undefined) {
			const symbol = compiler.checker.getSymbolAtLocation(name);
			if (symbol && !compiler.checker.isUnknownSymbol(symbol)) {
				const resolved = target(compiler.checker, symbol);
				if (
					!(resolved.flags & SymbolFlags.TypeParameter) &&
					resolved.declarations.length > 0 &&
					!resolved.declarations.every(
						(handle) =>
							/^lib\.[^.].*\.d\.ts$/.test(path.basename(handle.path)) &&
							origin(locations, handle.path, 0).packageName === "typescript",
					)
				) {
					references.push({
						text: compiler.emitter.printNode(name).trim(),
						target: collect(compiler, locations, state, resolved),
						origin: {
							packageName: location.packageName,
							file: location.file,
							start: name.pos,
						},
					});
				}
			}
		}
		if (isClassDeclaration(current) || isInterfaceDeclaration(current)) {
			for (const parameter of current.typeParameters ?? []) visit(parameter);
			for (const clause of current.heritageClauses ?? []) visit(clause);
		} else {
			current.forEachChild(visit);
		}
	}
	visit(node);
	return references;
}

/**
 * Reads the closest attached TSDoc block without preceding native-node trivia.
 * @param node - Original declaration or variable statement that owns the comment.
 * @returns Exact comment text, or undefined when no TSDoc is attached.
 */
function originalComment(node: Node | undefined): string | undefined {
	const comment = node?.jsDoc?.at(-1);
	if (node === undefined || comment === undefined) return undefined;
	const source = node.getSourceFile().text;
	const range = getLeadingCommentRanges(source, comment.pos)?.find(
		(entry) => entry.end === comment.end && entry.kind === SyntaxKind.MultiLineCommentTrivia,
	);
	assert.ok(range, "Attached TSDoc nodes must identify an original comment range.");
	return source.slice(range.pos, range.end);
}

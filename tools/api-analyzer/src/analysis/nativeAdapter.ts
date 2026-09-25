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
	getTrailingCommentRanges,
	type CallSignatureDeclaration,
	type ComputedPropertyName,
	type ExportDeclaration,
	type FunctionLikeDeclaration,
	type FunctionTypeNode,
	type MethodSignatureDeclaration,
	type Node,
	type SourceFile,
	type TypeNode,
	type TypeParameterDeclaration,
} from "typescript/unstable/ast";
import {
	updateCallSignatureDeclaration,
	updateParameterDeclaration,
	updateInterfaceDeclaration,
	createHeritageClause,
	updateGetAccessorDeclaration,
	updateSetAccessorDeclaration,
} from "typescript/unstable/ast/factory";
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
	isImportTypeNode,
	isExpressionWithTypeArguments,
	isComputedPropertyName,
	isGetAccessorDeclaration,
	isSetAccessorDeclaration,
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
	type Signature,
} from "typescript/unstable/sync";
import type { EffectiveConfiguration } from "../analysis-types/configuration.js";
import { releaseLevels, releaseLevelTags } from "../analysis-types/classification.js";
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
	PackageDocumentationFact,
	ReexportFact,
	SignatureFact,
	SourceDeclarationFact,
} from "../analysis-types/facts.js";
import { DiagnosticCode, reportFailure, type Result } from "../analysis-types/result.js";
import { freezeData } from "../utilities/freezeData.js";
import { assertDefined } from "../utilities/assertDefined.js";
import {
	collectApiLinkNodes,
	collectDocumentationLabels,
	type ExtractedComments,
} from "./documentationContext.js";
import { mergeDocumentationComments } from "./mergedDocumentation.js";
import { createTsdocConfiguration } from "./tsdocConfiguration.js";
import { getDeclarationSelectorKind } from "./dependencyReferences.js";
import {
	createSourceExcerpt,
	captureImports,
	printNativeExcerpt,
	printSignatureText,
} from "./compilerExcerpt.js";

/**
 * Native compiler services used by declaration extraction and signature printing.
 *
 * @remarks
 * A project supplies these services while its snapshot is active.
 * This type does not include project lifecycle operations or transfer ownership to extraction helpers.
 */
type CompilerContext = Pick<Project, "checker" | "emitter" | "program">;

/**
 * An internal owner of a synchronous native compiler connection.
 */
export interface NativeAdapter {
	/**
	 * Extracts detached facts from a configuration using the owned connection.
	 *
	 * @param configuration - Resolved package inputs and modifier vocabulary.
	 * @param comments - Empty map populated with original parsed comments. Omit when the caller does not need the captured parser results.
	 * @param suitePackages - Resolved dependency package names. Omit to analyze only the current package.
	 * @returns Frozen facts or expected input diagnostics.
	 * @throws If compiler queries, file access, or extraction fail unexpectedly.
	 */
	analyze(
		configuration: EffectiveConfiguration,
		comments?: ExtractedComments,
		suitePackages?: readonly string[],
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
 * @param suitePackages - Resolved dependency package names. Defaults to no selected dependencies.
 * @returns Detached facts or compiler input diagnostics.
 * @throws Propagates operational failures, preserving both extraction and cleanup errors when both fail.
 */
export function analyzeDeclarations(
	configuration: EffectiveConfiguration,
	adapter: NativeAdapter = createNativeAdapter(),
	comments?: ExtractedComments,
	suitePackages: readonly string[] = [],
): Result<AnalysisFacts> {
	let result: Result<AnalysisFacts>;
	try {
		result = adapter.analyze(configuration, comments, suitePackages);
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
		 * @param suitePackages - Resolved dependency package names. Defaults to no selected dependencies.
		 * @returns Frozen, detached facts on success, or diagnostics for project,
		 * compiler, or entrypoint validation failures.
		 * @throws If compiler communication, file access, or fact extraction fails unexpectedly.
		 * The owning invocation closes the adapter and propagates these exceptions.
		 */
		analyze(
			configuration: EffectiveConfiguration,
			comments?: ExtractedComments,
			suitePackages: readonly string[] = [],
		): Result<AnalysisFacts> {
			if (!existsSync(configuration.project)) {
				return reportFailure(
					DiagnosticCode.ProjectMissing,
					`Project configuration not found: ${configuration.project}`,
				);
			}
			const snapshot = api.updateSnapshot({ openProjects: [configuration.project] });
			try {
				const project = snapshot.getProject(configuration.project);
				if (!project) {
					return reportFailure(
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
					return reportFailure(
						DiagnosticCode.CompilerDiagnostics,
						`Project ${configuration.project} has compiler diagnostics: ${JSON.stringify(diagnostics)}`,
					);
				}

				return extractFacts(project, configuration, comments, suitePackages);
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
	 * Resolved dependency owners whose members and type references can be expanded.
	 * @defaultValue Omitted; only the analyzed package is in scope.
	 */
	readonly suitePackages?: ReadonlySet<string>;

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
	 * Configured entrypoint module symbols used for self-package qualified references.
	 *
	 * @remarks
	 * Populated before declaration collection so references can name later entrypoints.
	 * These compiler handles remain private to the active extraction and are never returned in facts.
	 * @defaultValue Omitted by low-level callers; self-package qualified lookup is then unsupported.
	 */
	readonly entrypoints?: ReadonlyMap<string, CompilerSymbol>;

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
 * @param suitePackages - Resolved dependency package names. Defaults to no selected dependencies.
 * @returns Deeply frozen facts, or diagnostics for invalid modifier settings or entrypoints.
 * @throws If compiler queries or package metadata reads fail, an export target is unresolved,
 * or a required signature or member type cannot be extracted.
 */
function extractFacts(
	project: Project,
	configuration: EffectiveConfiguration,
	comments: ExtractedComments = new Map(),
	suitePackages: readonly string[] = [],
): Result<AnalysisFacts> {
	const locations: LocationContext = {
		configuration,
		packageCache: new Map(),
		suitePackages: new Set(suitePackages),
	};
	const configured = createTsdocConfiguration(
		configuration,
		DiagnosticCode.ClassificationConfiguration,
	);
	if (!configured.ok) {
		return configured;
	}
	const parser = new TSDocParser(configured.value);
	const packageDocumentation = extractPackageDocumentation(project, locations, parser);
	if (!packageDocumentation.ok) {
		return packageDocumentation;
	}
	if (
		configuration.rules.requirePackageDocumentation === true &&
		packageDocumentation.value.documentation === undefined
	) {
		return reportFailure(
			DiagnosticCode.PackageDocumentationMissing,
			`Package ${configuration.packageName}: add one leading @packageDocumentation comment to a package-owned compiler input or disable rules.requirePackageDocumentation.`,
		);
	}

	// Register all surfaces first; references must not depend on entrypoint traversal order.
	const entrypoints = new Map<string, CompilerSymbol>();
	for (const entrypoint of [...configuration.entrypoints].sort((left, right) =>
		left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
	)) {
		const source = project.program.getSourceFile(entrypoint.path);
		if (!source) {
			return reportFailure(
				DiagnosticCode.EntrypointMissing,
				`Entrypoint ${entrypoint.name} is not in project ${configuration.project}: ${entrypoint.path}`,
			);
		}
		const moduleSymbol = project.checker.getSymbolAtLocation(source);
		if (!moduleSymbol) {
			return reportFailure(
				DiagnosticCode.EntrypointModule,
				`Entrypoint is not a module: ${entrypoint.path}`,
			);
		}
		entrypoints.set(entrypoint.name, moduleSymbol);
	}
	const state: CollectionState = {
		declarations: new Map(),
		visiting: new Set(),
		documentation: { parser, comments },
		entrypoints,
	};
	const surfaces = [...entrypoints].map(([name, moduleSymbol]) => ({
		name,
		exports: collectExports(project, locations, state, moduleSymbol),
	}));
	const reexports = collectReexportTags(project, locations, state, parser);
	let packageComment = packageDocumentation.value.documentation;
	if (packageComment !== undefined) {
		const source = assertDefined(
			project.program.getSourceFile(
				path.resolve(configuration.packageRoot, packageComment.origin.file),
			),
		);
		const parsed = parser.parseString(packageComment.documentation);
		packageComment = {
			...packageComment,
			references: collectLinks(parsed.docComment, (reference) =>
				lookupReference(project, locations, state, source, source, reference, true),
			),
		};
	}

	// Preserve the exact analyzed inputs so consumers can reject stale dependency models without reanalysis.
	const inputPaths = new Set(
		[
			...packageDocumentation.value.inputs,
			...configuration.entrypoints.map((entrypoint) =>
				getOrigin(locations, entrypoint.path, 0),
			),
			...[...state.declarations.values()].flatMap((declaration) => declaration.declarations),
		]
			.filter((source) => source.packageName === configuration.packageName)
			.map((source) => source.file),
	);
	const inputFiles = [...inputPaths].sort().map((file) => {
		const source = project.program.getSourceFile(
			path.resolve(configuration.packageRoot, file),
		);
		assert(
			source !== undefined,
			"Model input files must exist in the analyzed compiler project.",
		);
		return { file, sha256: createHash("sha256").update(source.text).digest("hex") };
	});

	// Sort the result independently of traversal order before making it immutable.
	return freezeData({
		ok: true,
		value: {
			packageName: configuration.packageName,
			...(reexports.length === 0 ? {} : { reexports }),
			...(packageComment === undefined ? {} : { packageDocumentation: packageComment }),
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
 * Captures ordinary re-export release constraints without using their descriptive documentation.
 * @param compiler - Active compiler services.
 * @param locations - Package ownership settings.
 * @param state - Declaration collection for resolved targets.
 * @param parser - Parser with the configured tag vocabulary.
 * @returns Constraints from all package-owned export statements, including intermediate modules.
 */
function collectReexportTags(
	compiler: CompilerContext,
	locations: LocationContext,
	state: CollectionState,
	parser: TSDocParser,
): readonly ReexportFact[] {
	const constraints: ReexportFact[] = [];
	for (const file of compiler.program.getSourceFileNames()) {
		const source = compiler.program.getSourceFile(file);
		if (
			source === undefined ||
			compiler.program.isSourceFileDefaultLibrary(source) ||
			getOrigin(locations, file, 0).packageName !== locations.configuration.packageName
		) {
			continue;
		}

		/**
		 * Retains release constraints while ignoring all other export-statement documentation.
		 * @param node - Original node in the package-owned source file.
		 */
		const visit = (node: Node): void => {
			if (
				isExportDeclaration(node) &&
				(node.exportClause === undefined || isNamedExports(node.exportClause))
			) {
				const text = getOriginalComment(node);
				const comment = text === undefined ? undefined : parser.parseString(text).docComment;
				const tags =
					comment === undefined
						? []
						: releaseLevels
								.map((level) => releaseLevelTags[level])
								.filter((tag) => comment.modifierTagSet.hasTagName(tag));
				if (tags.length > 0) {
					for (const symbol of getReexportSymbols(compiler.checker, node)) {
						constraints.push({
							name: symbol.name,
							origin: getOrigin(locations, file, node.pos),
							target: collect(
								compiler,
								locations,
								state,
								resolveSymbolTarget(compiler.checker, symbol),
							),
							releaseTags: tags,
						});
					}
				}
			}
			node.forEachChild(visit);
		};
		visit(source);
	}
	return constraints;
}

/**
 * Gets named re-export targets or the non-default targets of a star export.
 * @param checker - Active native checker.
 * @param node - Original ordinary export declaration.
 * @returns Symbols before alias resolution, retaining the exported names.
 */
function getReexportSymbols(
	checker: Project["checker"],
	node: ExportDeclaration,
): readonly CompilerSymbol[] {
	if (node.exportClause !== undefined && isNamedExports(node.exportClause)) {
		return node.exportClause.elements.flatMap((element) => {
			const symbol = checker.getSymbolAtLocation(element.name);
			return symbol === undefined ? [] : [symbol];
		});
	}
	const moduleSymbol =
		node.moduleSpecifier === undefined
			? undefined
			: checker.getSymbolAtLocation(node.moduleSpecifier);
	return moduleSymbol === undefined
		? []
		: checker.getExportsOfModule(moduleSymbol).filter((symbol) => symbol.name !== "default");
}

/**
 * Package comments and scanned inputs retained by one extraction.
 */
interface PackageDocumentationExtraction {
	/**
	 * The sole package comment, or undefined when no package comment exists.
	 */
	readonly documentation: PackageDocumentationFact | undefined;

	/**
	 * Every scanned package-owned input, including files without package comments.
	 */
	readonly inputs: readonly Origin[];
}

/**
 * A compiler-located TSDoc comment that might declare package documentation.
 */
interface PackageCommentOccurrence {
	/**
	 * Original comment text including delimiters.
	 */
	readonly text: string;

	/**
	 * Offset of the opening comment delimiter.
	 */
	readonly start: number;

	/**
	 * Whether the comment precedes all statements in its source file.
	 */
	readonly leading: boolean;
}

/**
 * Collects candidate comments at compiler-node boundaries without scanning text inside literals.
 *
 * @param source - Package-owned source file from the active compiler.
 * @returns Distinct candidate comments in source order, including misplaced package tags.
 */
function collectPackageComments(source: SourceFile): readonly PackageCommentOccurrence[] {
	if (!source.text.includes("@packageDocumentation")) {
		return [];
	}
	const leading = new Set(
		(getLeadingCommentRanges(source.text, 0) ?? []).map((range) => range.pos),
	);
	const comments = new Map<number, PackageCommentOccurrence>();

	/**
	 * Records comments at syntax-node boundaries without interpreting literal contents as trivia.
	 * @param node - Current source node whose children are visited recursively.
	 */
	function visit(node: Node): void {
		for (const position of [node.pos, node.end]) {
			for (const range of [
				...(getLeadingCommentRanges(source.text, position) ?? []),
				...(getTrailingCommentRanges(source.text, position) ?? []),
			]) {
				const text = source.text.slice(range.pos, range.end);
				if (text.startsWith("/**") && text.includes("@packageDocumentation")) {
					comments.set(range.pos, { text, start: range.pos, leading: leading.has(range.pos) });
				}
			}
		}
		node.forEachChild(visit);
	}
	visit(source);
	return [...comments.values()].sort((left, right) => left.start - right.start);
}

/**
 * Extracts the package's single leading documentation comment independently of entrypoint selection.
 *
 * @param compiler - Active native compiler services used to enumerate package inputs.
 * @param locations - Package ownership lookup state.
 * @param parser - Invocation-owned parser with the configured tag vocabulary.
 * @returns Scanned inputs and optional package documentation, or invalid-comment diagnostics.
 */
function extractPackageDocumentation(
	compiler: CompilerContext,
	locations: LocationContext,
	parser: TSDocParser,
): Result<PackageDocumentationExtraction> {
	let documentation: PackageDocumentationFact | undefined;
	const inputs: Origin[] = [];
	for (const file of [...compiler.program.getSourceFileNames()].sort()) {
		const source = compiler.program.getSourceFile(file);
		if (source === undefined || compiler.program.isSourceFileDefaultLibrary(source)) {
			continue;
		}
		const origin = getOrigin(locations, file, 0);
		if (origin.packageName !== locations.configuration.packageName) {
			continue;
		}
		inputs.push(origin);
		for (const comment of collectPackageComments(source)) {
			const parsed = parsePackageDocumentation(comment, origin, parser);
			if (!parsed.ok) {
				return parsed;
			}
			if (parsed.value === undefined) {
				continue;
			}
			if (documentation !== undefined) {
				return reportFailure(
					DiagnosticCode.PackageDocumentationInvalid,
					`Package ${origin.packageName}: multiple @packageDocumentation comments at ${documentation.origin.file}:${documentation.origin.start} and ${origin.file}:${comment.start}. Keep one package-owned comment.`,
				);
			}
			documentation = parsed.value;
		}
	}
	return { ok: true, value: { documentation, inputs } };
}

/**
 * Parses a candidate package comment and checks the supported package-level documentation contract.
 *
 * @param comment - Compiler-located comment with its placement classification.
 * @param origin - Original file ownership and location.
 * @param parser - Invocation-owned TSDoc parser with the configured modifier vocabulary.
 * @returns Package documentation, undefined for literal tag text, or a syntax, placement, or unsupported-reference diagnostic.
 */
function parsePackageDocumentation(
	comment: PackageCommentOccurrence,
	origin: Origin,
	parser: TSDocParser,
): Result<PackageDocumentationFact | undefined> {
	const parsed = parser.parseString(comment.text);
	const doc = parsed.docComment;
	if (!doc.modifierTagSet.hasTagName("@packageDocumentation")) {
		return { ok: true, value: undefined };
	}
	if (parsed.log.messages.length > 0) {
		return reportFailure(
			DiagnosticCode.DocumentationTsdoc,
			`Package ${origin.packageName}, ${origin.file}:${comment.start}: ${parsed.log.messages.map((message) => message.text).join("; ")}`,
		);
	}
	if (
		!comment.leading ||
		doc.inheritDocTag !== undefined ||
		doc.params.count > 0 ||
		doc.typeParams.count > 0 ||
		doc.returnsBlock !== undefined ||
		["@public", "@beta", "@alpha", "@internal"].some((tag) =>
			doc.modifierTagSet.hasTagName(tag),
		)
	) {
		return reportFailure(
			DiagnosticCode.PackageDocumentationInvalid,
			`Package ${origin.packageName}, ${origin.file}:${comment.start}: @packageDocumentation must be a leading file comment without release tags, parameter blocks, returns, or @inheritDoc.`,
		);
	}
	return {
		ok: true,
		value: { origin: { ...origin, start: comment.start }, documentation: comment.text },
	};
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
export function getOrigin(
	locations: LocationContext,
	fileName: string,
	start: number,
): Origin {
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
 * Resolves aliases while preserving documented module namespace export wrappers.
 *
 * @param checker - The checker for the active compiler snapshot.
 * @param symbol - The exported symbol to resolve.
 * @returns The target declaration or namespace-export wrapper; non-alias symbols are unchanged.
 */
export function resolveSymbolTarget(
	checker: Project["checker"],
	symbol: CompilerSymbol,
): CompilerSymbol {
	const visited = new Set<number>();
	let current = symbol;
	while (current.flags & SymbolFlags.Alias) {
		if (current.declarations.some((handle) => handle.kind === SyntaxKind.NamespaceExport)) {
			return current;
		}
		if (visited.has(current.id)) {
			return checker.getAliasedSymbol(symbol);
		}
		visited.add(current.id);
		const next = checker.getImmediateAliasedSymbol(current);
		if (next === undefined) {
			return checker.getAliasedSymbol(current);
		}
		current = next;
	}
	return current;
}

/**
 * Constructs a provisional identifier for a declaration symbol.
 *
 * @remarks
 * Uses sorted, distinct package-relative locations and containing symbol names.
 * Source-file modules use a fixed marker instead of the compiler's absolute-path name.
 * Does not encode source offsets or package versions.
 * Static member symbols include a separate marker so same-named instance members retain distinct identities.
 * The format is not a stable public contract.
 * Uniqueness across installed versions or all compiler-generated symbols is not guaranteed.
 *
 * @param locations - Package settings and cache used to resolve declaration locations.
 * @param symbol - The symbol whose identity is needed.
 * @returns An opaque identifier for declaration tracking and export references.
 */
export function getDeclarationId(
	locations: LocationContext,
	symbol: CompilerSymbol,
): ApiItemId {
	const declarationLocations = symbol.declarations.map((handle) => {
		const location = getOrigin(locations, handle.path, 0);
		return [location.packageName, location.file];
	});
	const parents: string[] = [];
	let parent = symbol.getParent();

	// Exclude the source-file parent: its compiler name can contain an absolute path.
	while (
		parent &&
		!parent.declarations.some((handle) => handle.kind === SyntaxKind.SourceFile)
	) {
		parents.unshift(getSourceSymbolName(parent));
		parent = parent.getParent();
	}
	return JSON.stringify([
		// Declaration order and repeated declarations in one file must not change the ID.
		[...new Set(declarationLocations.map((location) => JSON.stringify(location)))].sort(),
		...parents,

		// Static and instance members can have the same parent and name but are distinct declarations.
		...(symbol.declarations.some((handle) => {
			const node = handle.resolve();
			return (
				node !== undefined &&
				"modifiers" in node &&
				Array.isArray(node.modifiers) &&
				node.modifiers.some((modifier: Node) => modifier.kind === SyntaxKind.StaticKeyword)
			);
		})
			? ["<static>"]
			: []),
		symbol.declarations.some((handle) => handle.kind === SyntaxKind.SourceFile)
			? "<module>"
			: getSourceSymbolName(symbol),
	]);
}

/**
 * Retains computed member syntax instead of compiler-generated symbol names with session-specific identifiers.
 * @param symbol - Original declaration symbol.
 * @returns Stable source-level member syntax or the ordinary symbol name.
 */
function getSourceSymbolName(symbol: CompilerSymbol): string {
	const names = symbol.declarations.flatMap((handle) => {
		const node = handle.resolve();
		const name =
			node !== undefined && "name" in node ? (node.name as Node | undefined) : undefined;
		return name !== undefined && isComputedPropertyName(name) ? [name.getText()] : [];
	});
	return [...new Set(names)].sort()[0] ?? symbol.name;
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
export function isTypeOnlyAlias(
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
	return next ? isTypeOnlyAlias(checker, next, seen) : false;
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
export function isTypeOnlyExport(
	checker: Project["checker"],
	locations: LocationContext,
	moduleSymbol: CompilerSymbol,
	name: string,
	seen = new Set<string>(),
): boolean {
	const key = JSON.stringify([getDeclarationId(locations, moduleSymbol), name]);
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
					statement.isTypeOnly || isTypeOnlyExport(checker, locations, from, name, active),
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
								? isTypeOnlyExport(
										checker,
										locations,
										from,
										(specifier.propertyName ?? specifier.name).text,
										active,
									)
								: local
									? isTypeOnlyAlias(checker, local)
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
		return isTypeOnlyAlias(checker, symbol);
	}
	return stars.length > 0
		? stars.every(Boolean)
		: symbol
			? isTypeOnlyAlias(checker, symbol)
			: false;
}

/**
 * Converts a type's call signatures into detached facts.
 *
 * @remarks
 * Prints each signature as a function type and combines its text hash with the owner identifier.
 * Retains matching effective call-signature text, original source records, and separate reduced and normalized views.
 * Normalization does not contribute to identity. Reports consume the normalized view after compiler disposal.
 * Retains the closest attached TSDoc comment without declaration text, or `undefined` if absent.
 * Preserves explicit empty comments so later inheritance can distinguish them from absent comments.
 * Does not extract construct signatures.
 *
 * @param compiler - The checker, emitter, and program metadata for the active compiler snapshot.
 * @param type - The compiler type whose callable signatures are requested.
 * @param owner - The containing declaration's provisional identifier.
 * @param locations - Package ownership information for original declaration records.
 * @returns Signature facts in compiler order, or an empty array if there are no call signatures.
 * @throws If the compiler cannot produce a printable node for a call signature.
 */
export function extractSignatures(
	compiler: CompilerContext,
	type: Type,
	owner: ApiItemId,
	locations: LocationContext,
): SignatureFact[] {
	const { checker, emitter } = compiler;
	return checker.getSignaturesOfType(type, SignatureKind.Call).map((signature) => {
		// Alias accessibility depends on the original module scope. Without it the printer can
		// expose a dependency's private declaration name instead of its consumer-visible alias.
		const enclosingDeclaration = signature.declaration?.resolve()?.getSourceFile();
		const node = checker.signatureToSignatureDeclaration(
			signature,
			SyntaxKind.FunctionType,
			enclosingDeclaration,
			NodeBuilderFlags.UseOnlyExternalAliasing,
		);
		assert(
			node !== undefined,
			"The compiler must materialize a printable node for a call signature.",
		);
		const functionTypeText = emitter.printNode(node).trim();
		const declaration = checker.signatureToSignatureDeclaration(
			signature,
			SyntaxKind.CallSignature,
			enclosingDeclaration,
			NodeBuilderFlags.UseOnlyExternalAliasing,
		);
		assert(
			declaration !== undefined && isCallSignatureDeclaration(declaration),
			"The compiler must materialize a call-signature declaration.",
		);
		const source = signature.declaration?.resolve();
		const views = createSignatureViews(compiler, signature, declaration, source, locations);

		// Keep reference capture separate from identity: IDs still use the original effective function text.
		return {
			...printSignatureText(
				compiler,
				declaration,
				source,
				signature,
				createExcerptTargetResolver(compiler, locations),
			),
			...views,
			...(source === undefined || signature.declaration === undefined
				? {}
				: { source: extractSourceDeclaration(locations, signature.declaration, compiler) }),
			callSignatureText: emitter.printNode(declaration).trim(),
			id: `${owner}:${createHash("sha256").update(functionTypeText).digest("hex")}`,
			functionTypeText,
			documentation: getOriginalComment(signature.declaration?.resolve()),
		};
	});
}

/**
 * Builds resolved alternatives without changing the compiler's effective identity text.
 *
 * @remarks
 * Uses printed argument positions because tuple-rest parameters can expand into several parameters.
 * Rest syntax and predicate returns cannot be reconstructed from ordinary argument and return types alone.
 *
 * @param compiler - Active checker and emitter.
 * @param signature - Instantiated callable signature.
 * @param template - Compiler-produced call-signature syntax, including parameter and predicate shape.
 * @param scope - Original declaration scope, or undefined when no source is available.
 * @param locations - Current package and selected dependency owners used by excerpt reference policy.
 * @returns Reduced and selectively normalized text, independent of report selection.
 * @throws If the compiler cannot materialize a required type or violates parameter-shape invariants.
 */
function createSignatureViews(
	compiler: CompilerContext,
	signature: Signature,
	template: CallSignatureDeclaration,
	scope: Node | undefined,
	locations: LocationContext,
): Pick<SignatureFact, "reduced" | "normalized"> {
	const { checker } = compiler;
	const receiver = signature.getThisParameter();
	const firstParameter = template.parameters[0];
	assert(
		receiver === undefined ||
			(firstParameter !== undefined &&
				isIdentifier(firstParameter.name) &&
				firstParameter.name.text === "this"),
		"Explicit receivers must be the first printed parameter.",
	);
	const reducedParameters = template.parameters.map((parameter, index) => {
		// getParameterType returns a rest argument's element type, not the declaration's array or tuple type.
		if (parameter.dotDotDotToken !== undefined) {
			return parameter;
		}
		const type =
			receiver !== undefined && index === 0
				? checker.getTypeOfSymbol(receiver)
				: checker.getParameterType(signature, index - (receiver === undefined ? 0 : 1));
		assert(
			type !== undefined && !type.isErrorType(),
			"Signature parameters must have resolved types.",
		);
		const node = checker.typeToTypeNode(type, scope, NodeBuilderFlags.NoTruncation);
		assert(node !== undefined, "Resolved parameters must have printable type nodes.");
		return updateParameterDeclaration(
			parameter,
			parameter.modifiers,
			parameter.dotDotDotToken,
			parameter.name,
			parameter.questionToken,
			node,
			parameter.initializer,
		);
	});
	let reducedReturn = template.type;
	if (checker.getTypePredicateOfSignature(signature) === undefined) {
		// Replacing a predicate with its ordinary boolean or void return would remove narrowing semantics.
		const type = checker.getReturnTypeOfSignature(signature);
		assert(
			type !== undefined && !type.isErrorType(),
			"Signatures must have resolved return types.",
		);
		reducedReturn = checker.typeToTypeNode(type, scope, NodeBuilderFlags.NoTruncation);
		assert(reducedReturn !== undefined, "Resolved returns must have printable type nodes.");
	}

	// Preserve optional-parameter syntax and named application types; normalize only selected computed roots.
	const normalizedParameters = template.parameters.map((parameter, index) =>
		parameter.questionToken === undefined &&
		isComputedSignatureType(parameter.type, compiler, scope)
			? assertDefined(reducedParameters[index])
			: parameter,
	);
	return {
		reduced: printSignatureText(
			compiler,
			updateCallSignatureDeclaration(
				template,
				template.typeParameters,
				reducedParameters,
				reducedReturn,
			),
			scope,
			signature,
			createExcerptTargetResolver(compiler, locations),
		),
		normalized: printSignatureText(
			compiler,
			updateCallSignatureDeclaration(
				template,
				template.typeParameters,
				normalizedParameters,
				isComputedSignatureType(template.type, compiler, scope)
					? reducedReturn
					: template.type,
			),
			scope,
			signature,
			createExcerptTargetResolver(compiler, locations),
		),
	};
}

/**
 * Identifies outer computed types and compiler utilities without expanding application-defined aliases.
 * @param node - Effective type syntax, or undefined when no annotation was printed.
 * @param compiler - Active compiler name lookup and source-file classification.
 * @param scope - Original declaration scope; undefined disables utility-name lookup.
 * @returns Whether the expression can use the compiler-resolved alternative.
 */
function isComputedSignatureType(
	node: TypeNode | undefined,
	compiler: Pick<Project, "checker" | "program">,
	scope: Node | undefined,
): boolean {
	if (node === undefined) {
		return false;
	}
	if (
		[
			SyntaxKind.IndexedAccessType,
			SyntaxKind.TypeQuery,
			SyntaxKind.ConditionalType,
			SyntaxKind.TypeOperator,
		].includes(node.kind)
	) {
		return true;
	}
	if (scope === undefined || !isTypeReferenceNode(node) || !isIdentifier(node.typeName)) {
		return false;
	}

	// Query the original lexical scope, not a synthesized node. A user-defined utility with the same name must stay named.
	const { checker } = compiler;
	const symbol = checker.resolveName(node.typeName.text, SymbolFlags.Type, scope);
	if (symbol === undefined || checker.isUnknownSymbol(symbol)) {
		return false;
	}
	const resolved = resolveSymbolTarget(checker, symbol);
	return (
		resolved.declarations.length > 0 &&
		resolved.declarations.every((handle) => {
			const source = handle.resolve()?.getSourceFile();
			return (
				handle.kind === SyntaxKind.TypeAliasDeclaration &&
				source !== undefined &&
				compiler.program.isSourceFileDefaultLibrary(source)
			);
		})
	);
}

/**
 * Supplies suite ownership and stable identity policy to compiler excerpt capture.
 * @param compiler - Active services for checking declaration ownership.
 * @param locations - Current package and selected dependency owners.
 * @returns A resolver that leaves symbols outside the selected suite unlinked.
 */
function createExcerptTargetResolver(
	compiler: CompilerContext,
	locations: LocationContext,
): (symbol: CompilerSymbol) => ApiItemId | undefined {
	return (symbol) =>
		isSuiteSymbol(compiler, locations, symbol)
			? getDeclarationId(locations, symbol)
			: undefined;
}

/**
 * Detaches one source declaration without combining or inheriting its documentation.
 *
 * @param locations - Package settings and cache used for the original location.
 * @param handle - A compiler declaration handle from a symbol.
 * @param compiler - Active services used to resolve original source references.
 * @returns Original location, syntax kind, source text, and the closest attached TSDoc comment.
 */
function extractSourceDeclaration(
	locations: LocationContext,
	handle: CompilerSymbol["declarations"][number],
	compiler: CompilerContext,
): SourceDeclarationFact {
	const node = handle.resolve();
	return {
		...(node === undefined
			? {}
			: {
					excerpt: createSourceExcerpt(
						compiler,
						node,
						createExcerptTargetResolver(compiler, locations),
					),
				}),
		...getOrigin(locations, handle.path, node?.pos ?? 0),
		kind: SyntaxKind[handle.kind],
		text: node?.getFullText() ?? "",
		documentation: getOriginalComment(
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
function extractHeritageFacts(
	compiler: CompilerContext,
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
		assert(
			(node && (isClassDeclaration(node) || isInterfaceDeclaration(node))) === true,
			"The compiler must resolve a class or interface declaration.",
		);
		for (const clause of node.heritageClauses ?? []) {
			for (const heritageType of clause.types) {
				const heritageSymbol = compiler.checker.getSymbolAtLocation(heritageType.expression);
				assert(heritageSymbol !== undefined, "The compiler must resolve a heritage target.");
				const target = resolveSymbolTarget(compiler.checker, heritageSymbol);
				if (!isSuiteSymbol(compiler, locations, target)) {
					continue;
				}
				const instantiated = compiler.checker.getTypeAtLocation(heritageType);
				assert(
					instantiated !== undefined,
					"The compiler must resolve an instantiated heritage type.",
				);
				const targetId = collect(compiler, locations, state, target);
				const kind = clause.token === SyntaxKind.ExtendsKeyword ? "extends" : "implements";
				const viewOwner = `heritage:${JSON.stringify([owner, kind, targetId, compiler.checker.typeToString(instantiated)])}`;
				const viewMembers = extractMembers(compiler, locations, instantiated, viewOwner);
				views.push({
					kind,
					target: targetId,
					members: viewMembers,
					documentationMatches: receiver
						? findDocumentationMatches(
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
function findDocumentationMatches(
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
			!haveMatchingDocumentationTypes(checker, receiverType, ancestorType)
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
				!haveMatchingDocumentationTypes(
					checker,
					checker.getReturnTypeOfSignature(receiverSignature),
					checker.getReturnTypeOfSignature(ancestorSignature),
				) ||
				receiverSignature
					.getParameters()
					.some(
						(_parameter, index) =>
							!haveMatchingDocumentationTypes(
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
	// Overloads need explicit selection. Callable kind, optionality, and write access must also agree.
	// Equal unknown readonly states do not establish compatible write access.
	return (
		receiver.signatures.length <= 1 &&
		candidate.signatures.length <= 1 &&
		receiver.signatures.length === candidate.signatures.length &&
		receiver.optional === candidate.optional &&
		receiver.readonly === candidate.readonly &&
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
	// Check those forms explicitly, but reject unresolved nodes before inspecting their parameters.
	return (
		node !== undefined &&
		(isFunctionLikeDeclaration(node) ||
			isMethodSignatureDeclaration(node) ||
			isCallSignatureDeclaration(node) ||
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

	// Preserve names and order; copying must not leave stale or missing parameter documentation.
	return (
		receiver.parameters.length === candidate.parameters.length &&
		receiver.parameters.every((parameter, index) => {
			const other = assertDefined(
				candidate.parameters[index],
				"Equal parameter counts must provide a corresponding source parameter.",
			);

			// Destructuring cannot supply one reusable parameter name. Both '?' and initializers
			// make parameters optional, while rest parameters describe multiple arguments.
			return (
				isIdentifier(parameter.name) &&
				isIdentifier(other.name) &&
				parameter.name.text === other.name.text &&
				(parameter.questionToken !== undefined || parameter.initializer !== undefined) ===
					(other.questionToken !== undefined || other.initializer !== undefined) &&
				(parameter.dotDotDotToken !== undefined) === (other.dotDotDotToken !== undefined)
			);
		}) &&
		receivingTypeParameters.length === candidateTypeParameters.length &&
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
function haveMatchingDocumentationTypes(
	checker: Project["checker"],
	receiver: Type | undefined,
	candidate: Type | undefined,
): boolean {
	// Unresolved or unconstrained types provide no evidence of safe documentation copying.
	// Require assignability in both directions to reject both widening and narrowing.
	return (
		receiver !== undefined &&
		candidate !== undefined &&
		!((receiver.flags | candidate.flags) & (TypeFlags.Any | TypeFlags.Unknown)) &&
		checker.isTypeAssignableTo(receiver, candidate) &&
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
export function extractMembers(
	compiler: CompilerContext,
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
		.filter(
			(property) =>
				property.declarations.length === 0 || isSuiteSymbol(compiler, locations, property),
		)
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
			assert(
				propertyType !== undefined,
				"The compiler must resolve the effective type of a member.",
			);
			const id = `member:${JSON.stringify([owner, name])}`;
			const callableType = checker.getNonNullableType(propertyType);
			const callableSignatures = callableType
				? extractSignatures(compiler, callableType, id, locations)
				: [];
			const sourceDeclarations = property.declarations.map((handle) =>
				extractSourceDeclaration(locations, handle, compiler),
			);
			const visibility = getMemberVisibility(nodes);
			const accessorView =
				state === undefined
					? {}
					: extractInheritedAccessors(
							compiler,
							locations,
							state,
							property,
							propertyType,
							owner,
							nodes,
						);
			const propertyContext =
				state &&
				nodes.length > 0 &&
				nodes.length === sourceDeclarations.length &&
				nodes.every(
					(propertyNode) =>
						propertyNode.kind === SyntaxKind.PropertyDeclaration ||
						propertyNode.kind === SyntaxKind.PropertySignature,
				)
					? mergeReferenceContexts(compiler, locations, state, nodes, sourceDeclarations, id)
					: undefined;
			const symbolId = getMemberSymbolId(compiler, locations, property);
			const typeNode = checker.typeToTypeNode(
				propertyType,
				declaration,
				NodeBuilderFlags.NoTruncation | NodeBuilderFlags.UseOnlyExternalAliasing,
			);
			const nameImports =
				nameNode !== null && typeof nameNode === "object" && "kind" in nameNode
					? (captureImports(
							compiler,
							nameNode as Node,
							declaration,
							createExcerptTargetResolver(compiler, locations),
						).imports ?? [])
					: [];
			return {
				id,
				...(visibility === undefined ? {} : { visibility }),
				...accessorView,
				imports: [
					...nameImports,
					...(typeNode === undefined
						? []
						: (captureImports(
								compiler,
								typeNode,
								declaration,
								createExcerptTargetResolver(compiler, locations),
							).imports ?? [])),
				],
				...(typeNode === undefined
					? {}
					: {
							typeExcerpt: printNativeExcerpt(
								compiler,
								typeNode,
								declaration,
								[propertyType],
								createExcerptTargetResolver(compiler, locations),
							),
						}),
				referenceName: symbolId === undefined ? property.name : name,
				...(symbolId === undefined ? {} : { symbolId }),
				...(propertyContext === undefined || state === undefined
					? {}
					: {
							documentationContext: addEffectiveTypeReferences(
								compiler,
								locations,
								state,
								propertyContext,
								[propertyType],
								owner,
							),
						}),
				signatures: (callableType && state
					? addDocumentationContexts(
							compiler,
							locations,
							state,
							callableType,
							callableSignatures,
						)
					: callableSignatures
				).map((signature) =>
					nameImports.length === 0
						? signature
						: {
								...signature,
								normalized: {
									...signature.normalized,
									imports: [...nameImports, ...(signature.normalized.imports ?? [])],
								},
							},
				),
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
 * Reads original accessibility without interpreting compiler-printed text.
 * @param nodes - Original declarations contributing to an effective member.
 * @returns Non-public visibility, or undefined for ordinary public members.
 */
function getMemberVisibility(nodes: readonly Node[]): MemberFact["visibility"] {
	for (const node of nodes) {
		// ECMAScript private names have no private modifier, but must not appear as derived declarations.
		if (
			"name" in node &&
			(node.name as Node | undefined)?.kind === SyntaxKind.PrivateIdentifier
		) {
			return "private";
		}
		if ("modifiers" in node && Array.isArray(node.modifiers)) {
			if (
				node.modifiers.some((modifier: Node) => modifier.kind === SyntaxKind.PrivateKeyword)
			) {
				return "private";
			}
			if (
				node.modifiers.some((modifier: Node) => modifier.kind === SyntaxKind.ProtectedKeyword)
			) {
				return "protected";
			}
		}
	}
	return undefined;
}

/**
 * Joins inherited getter/setter syntax to original declaring-member metadata.
 * @param compiler - Active compiler services.
 * @param locations - Original package ownership settings.
 * @param state - Invocation-owned declaration collection.
 * @param property - Effective property symbol, including generic substitution.
 * @param propertyType - Effective read type, or write type for a setter-only property.
 * @param owner - Receiving declaration or heritage-view identity.
 * @param nodes - Original member declarations.
 * @returns Inherited accessor syntax; an empty view retains unresolved write types through heritage.
 */
function extractInheritedAccessors(
	compiler: CompilerContext,
	locations: LocationContext,
	state: CollectionState,
	property: CompilerSymbol,
	propertyType: Type,
	owner: ApiItemId,
	nodes: readonly Node[],
): Pick<MemberFact, "accessors" | "declaringContainer"> {
	const original = nodes[0];
	if (
		original === undefined ||
		!nodes.every((node) => isGetAccessorDeclaration(node) || isSetAccessorDeclaration(node))
	) {
		return {};
	}
	const declaringContainer = collectDeclaringContainer(compiler, locations, state, original);

	// Direct accessors already have declared-member records; only inherited views need substituted syntax.
	if (declaringContainer === undefined || declaringContainer === owner) {
		return {};
	}
	const getter = nodes.find(isGetAccessorDeclaration);
	const setter = nodes.find(isSetAccessorDeclaration);
	let writeType = propertyType;
	if (getter !== undefined && setter !== undefined) {
		// Compare types in the original declaration before reusing the receiver's substituted read type.
		// A setter may accept more values than the getter returns.
		const originalSymbol = assertDefined(compiler.checker.getSymbolAtLocation(getter.name));
		const readType = compiler.checker.getTypeOfSymbol(originalSymbol);
		const setterType = compiler.checker.getTypeOfSymbolAtLocation(property, setter.name);
		if (readType?.id !== setterType.id) {
			// TODO: Expand distinct generic setter types when the native checker exposes their instantiated write type.
			// The native write-type query retains original type parameters. Keep these accessors in the base
			// instead of narrowing the setter to the substituted read type or emitting an unbound parameter.
			if (
				"typeParameters" in setter.parent &&
				((setter.parent.typeParameters as readonly Node[] | undefined)?.length ?? 0) > 0
			) {
				return { declaringContainer, accessors: [] };
			}
			writeType = setterType;
		}
	}
	const accessors = nodes.map((node) => {
		assert(
			isGetAccessorDeclaration(node) || isSetAccessorDeclaration(node),
			"Accessor views require accessor declarations.",
		);
		const effectiveType = isGetAccessorDeclaration(node) ? propertyType : writeType;
		const typeNode = assertDefined(
			compiler.checker.typeToTypeNode(effectiveType, node, NodeBuilderFlags.NoTruncation),
		);

		// Identity uses original syntax, not the substituted type, so all receivers share the source docs.
		const clone = getSynthesizedDeepClone(node);
		const printedOriginal = compiler.emitter.printNode(clone).trim();
		const id = `${declaringContainer}:declared:${createHash("sha256").update(printedOriginal).digest("hex")}`;
		const source = getOrigin(locations, node.getSourceFile().fileName, node.pos);

		// Reuse completed source records when available; recursive collection may still be building the base.
		const record =
			state.declarations
				.get(declaringContainer)
				?.container?.declaredMembers.find((member) => member.id === id) ??
			createDeclaredMemberRecord(
				compiler,
				locations,
				state,
				node,
				source,
				id,
				printedOriginal,
			);
		let effective: Node;
		if (isGetAccessorDeclaration(clone)) {
			effective = updateGetAccessorDeclaration(
				clone,
				clone.modifiers,
				clone.name,
				undefined,
				clone.parameters,
				typeNode,
				undefined,
			);
		} else {
			assert(isSetAccessorDeclaration(clone), "Setter clones must retain their syntax kind.");
			effective = updateSetAccessorDeclaration(
				clone,
				clone.modifiers,
				clone.name,
				undefined,
				clone.parameters.map((parameter) =>
					updateParameterDeclaration(
						parameter,
						parameter.modifiers,
						parameter.dotDotDotToken,
						parameter.name,
						parameter.questionToken,
						typeNode,
						undefined,
					),
				),
				undefined,
				undefined,
			);
		}

		// Display syntax and its imports can change after substitution; source text and metadata must not.
		return {
			...record,
			printed: compiler.emitter.printNode(effective).trim(),
			imports:
				captureImports(
					compiler,
					effective,
					node,
					createExcerptTargetResolver(compiler, locations),
				).imports ?? [],
		};
	});
	return { declaringContainer, accessors };
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
 * @param namespaceOnly - Exclude class statics and synthetic exports when collecting a compound namespace. Defaults to false.
 * @returns Detached export facts sorted by exported name.
 */
export function collectExports(
	compiler: CompilerContext,
	locations: LocationContext,
	state: CollectionState,
	moduleSymbol: CompilerSymbol,
	namespaceOnly = false,
): ExportFact[] {
	const { checker } = compiler;
	return checker
		.getExportsOfModule(moduleSymbol)
		.filter(
			(exported) =>
				!namespaceOnly ||
				exported.declarations.some((handle) => {
					let node = handle.resolve()?.parent;
					while (
						node !== undefined &&
						!isModuleBlock(node) &&
						!isClassDeclaration(node) &&
						!isEnumDeclaration(node) &&
						!isSourceFile(node)
					) {
						node = node.parent;
					}
					return node !== undefined && isModuleBlock(node);
				}),
		)
		.map((exported) => {
			const resolved = resolveSymbolTarget(checker, exported);
			const id = collect(compiler, locations, state, resolved);
			return {
				name: exported.name,
				target: id,
				typeOnly: isTypeOnlyExport(checker, locations, moduleSymbol, exported.name),
			};
		})
		.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
}

/**
 * Looks up a documentation reference in its original scope or a configured export surface.
 *
 * @remarks
 * Internal helper. Not exported from the package entrypoint.
 * Supports unqualified names and falls back to module export aliases.
 * Self-package qualified names start at a configured entrypoint's exports and never fall back to lexical names.
 * A missing or unconfigured export path produces a not-found result; foreign qualified names use dependency models later.
 * Links and inheritance accept namespace paths, unambiguous static or instance members, and explicit member-side selectors.
 * Numeric selectors retain the declaration target; binding later selects the callable overload.
 * Named declaration selectors validate the compiler syntax kind at each selected path component.
 * A static/instance name collision requires an explicit side and is never guessed.
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
 * @param allowIndexSelector - Whether this lookup accepts numeric callable selectors. Link and inheritance extraction enable them.
 * @param collectTarget - Retain target facts for later binding. Defaults to true; symbol-key lookup only needs an identity.
 * @returns Detached lookup facts without compatibility or release-policy validation.
 * @throws If compiler queries or target collection fail unexpectedly.
 */
export function lookupReference(
	compiler: CompilerContext,
	locations: LocationContext,
	state: CollectionState,
	node: Node,
	source: SourceFile,
	reference: DocDeclarationReference | undefined,
	allowIndexSelector: boolean,
	collectTarget = true,
): DocumentationReferenceLookup {
	const { checker } = compiler;
	const member = reference?.memberReferences[0];
	const name = member?.memberIdentifier?.identifier;

	const selfQualified = reference?.packageName === locations.configuration.packageName;

	// Qualified names start at configured exports, never at private lexical declarations.
	// This is a lookup capability check, not TSDoc syntax or target compatibility validation.
	// Member paths preserve original scope for both links and inheritance. Numeric selector
	// ranges and callable compatibility are checked later by the binder.
	const supported =
		reference !== undefined &&
		((reference.packageName === undefined && reference.importPath === undefined) ||
			(selfQualified && state.entrypoints !== undefined)) &&
		name !== undefined &&
		reference.memberReferences.every((part, index) => {
			if (
				part.memberIdentifier === undefined &&
				(index === 0 || part.memberSymbol === undefined)
			) {
				return false;
			}

			return (
				part.selector === undefined ||
				part.selector.selectorKind === SelectorKind.Label ||
				(part.selector.selectorKind === SelectorKind.System &&
					part.selector.selector === "constructor") ||
				(part.selector.selectorKind === SelectorKind.System &&
					getDeclarationSelectorKind(part.selector.selector) !== undefined) ||
				(allowIndexSelector &&
					index === reference.memberReferences.length - 1 &&
					part.selector.selectorKind === SelectorKind.Index) ||
				(index > 0 &&
					part.selector.selectorKind === SelectorKind.System &&
					["static", "instance"].includes(part.selector.selector))
			);
		});
	let targetId: ApiItemId | undefined;
	if (supported && name !== undefined) {
		const entrypoint =
			reference.importPath === undefined || reference.importPath === ""
				? "."
				: `./${reference.importPath.replace(/^\//, "").replace(/^\.\//, "")}`;
		const moduleSymbol = selfQualified
			? state.entrypoints?.get(entrypoint)
			: checker.getSymbolAtLocation(source);

		// Only unqualified names can resolve where the comment was written.
		const found =
			(selfQualified
				? undefined
				: checker.resolveName(
						name,
						SymbolFlags.Value | SymbolFlags.Type | SymbolFlags.Namespace,
						node,
					)) ??
			(moduleSymbol
				? checker.getExportsOfModule(moduleSymbol).find((entry) => entry.name === name)
				: undefined);

		// The compiler's unknown-symbol sentinel is not a declaration we can traverse or collect.
		if (found !== undefined && !checker.isUnknownSymbol(found)) {
			// Follow aliases before inspecting the kind of container that owns the next path component.
			let resolved: CompilerSymbol | undefined = resolveSymbolTarget(checker, found);
			const firstKind =
				member?.selector?.selectorKind === SelectorKind.System
					? getDeclarationSelectorKind(member.selector.selector)
					: undefined;
			if (
				(firstKind !== undefined && !hasDeclarationKind(resolved, firstKind)) ||
				(reference.memberReferences.length > 1 &&
					member?.selector?.selectorKind === SelectorKind.Label &&
					!hasSymbolLabel(resolved, member.selector.selector, state))
			) {
				resolved = undefined;
			}
			for (const [pathIndex, part] of reference.memberReferences.slice(1).entries()) {
				// A failed intermediate lookup invalidates the whole path; do not restart in outer scope.
				if (!resolved || checker.isUnknownSymbol(resolved)) {
					break;
				}
				const partName = part.memberIdentifier?.identifier;
				const symbolLookup =
					part.memberSymbol === undefined
						? undefined
						: lookupReference(
								compiler,
								locations,
								state,
								node,
								source,
								part.memberSymbol.symbolReference,
								true,
								false,
							);
				if (symbolLookup !== undefined && symbolLookup.status !== "resolved") {
					return { reference: reference.emitAsTsdoc(), status: "not-found" };
				}
				const side =
					part.selector?.selectorKind === SelectorKind.System &&
					["static", "instance"].includes(part.selector.selector)
						? part.selector.selector
						: undefined;
				const selected: Result<CompilerSymbol | undefined> = lookupMemberSymbol(
					checker,
					resolved,
					partName ?? "",
					side,
					symbolLookup?.status === "resolved"
						? (property) =>
								getMemberSymbolId(compiler, locations, property) === symbolLookup.target
						: undefined,
				);
				if (!selected.ok) {
					return { reference: reference.emitAsTsdoc(), status: "unsupported" };
				}
				resolved = selected.value;
				if (resolved) {
					// Each exported path component can itself be an alias, including the final target.
					resolved = resolveSymbolTarget(checker, resolved);
					const kind =
						part.selector?.selectorKind === SelectorKind.System
							? getDeclarationSelectorKind(part.selector.selector)
							: undefined;
					if (
						(kind !== undefined && !hasDeclarationKind(resolved, kind)) ||
						(pathIndex < reference.memberReferences.length - 2 &&
							part.selector?.selectorKind === SelectorKind.Label &&
							!hasSymbolLabel(resolved, part.selector.selector, state))
					) {
						resolved = undefined;
					}
				}
			}
			if (resolved && !checker.isUnknownSymbol(resolved)) {
				// Retain the target's detached facts even when no entrypoint exports it.
				targetId = collectTarget
					? collect(compiler, locations, state, resolved)
					: getSymbolReferenceId(compiler, locations, resolved);
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
 * Matches a declaration selector while treating module namespace exports as namespace APIs.
 * @param symbol - Resolved declaration or module namespace export.
 * @param kind - Compiler declaration kind associated with the selector.
 * @returns Whether the symbol supports the requested selector.
 */
function hasDeclarationKind(symbol: CompilerSymbol, kind: string): boolean {
	return symbol.declarations.some(
		(handle) =>
			SyntaxKind[handle.kind] === kind ||
			(kind === "ModuleDeclaration" && handle.kind === SyntaxKind.NamespaceExport),
	);
}

/**
 * Validates a label on an intermediate compiler-resolved path component.
 * @param symbol - Resolved declaration symbol.
 * @param label - Requested original documentation label.
 * @param state - Invocation parser vocabulary.
 * @returns Whether an original declaration carries the label.
 */
function hasSymbolLabel(
	symbol: CompilerSymbol,
	label: string,
	state: CollectionState,
): boolean {
	const parser = state.documentation?.parser ?? new TSDocParser();
	return symbol.declarations.some((handle) => {
		const node = handle.resolve();
		return (
			node !== undefined &&
			collectDocumentationLabels(
				parser.parseString(
					getOriginalComment(isNamespaceExport(node) ? node.parent : node) ?? "/** */",
				).docComment,
			).includes(label)
		);
	});
}

/**
 * Looks up one path component without choosing between colliding class member sides.
 * @param checker - Active native checker.
 * @param owner - Resolved class, interface, or module symbol containing the component.
 * @param name - Parsed member identifier.
 * @param side - Explicit static or instance selector, or undefined for an unqualified component.
 * @param matchSymbol - Matches a computed key by compiler identity. Omit to match an ordinary identifier.
 * @returns The member, undefined for a missing target, or an unsupported-path diagnostic.
 */
function lookupMemberSymbol(
	checker: Project["checker"],
	owner: CompilerSymbol,
	name: string,
	side: string | undefined,
	matchSymbol?: (symbol: CompilerSymbol) => boolean,
): Result<CompilerSymbol | undefined> {
	if (owner.declarations.some((handle) => handle.kind === SyntaxKind.NamespaceExport)) {
		return lookupMemberSymbol(
			checker,
			checker.getAliasedSymbol(owner),
			name,
			side,
			matchSymbol,
		);
	}
	if (owner.flags & (SymbolFlags.Class | SymbolFlags.Interface)) {
		const staticType =
			owner.flags & (SymbolFlags.Value | SymbolFlags.Module)
				? checker.getTypeOfSymbol(owner)
				: undefined;
		const staticMember =
			staticType === undefined
				? undefined
				: checker
						.getPropertiesOfType(staticType)
						.find((entry) => matchSymbol?.(entry) ?? entry.name === name);
		const instanceMember = checker
			.getPropertiesOfType(checker.getDeclaredTypeOfSymbol(owner))
			.find((entry) => matchSymbol?.(entry) ?? entry.name === name);
		if (side === undefined && staticMember !== undefined && instanceMember !== undefined) {
			return reportFailure(
				DiagnosticCode.DocumentationUnsupported,
				`Member ${name} exists on both class sides. Specify static or instance.`,
			);
		}
		return {
			ok: true,
			value:
				side === "static"
					? staticMember
					: side === "instance"
						? instanceMember
						: (instanceMember ?? staticMember),
		};
	}
	if (owner.flags & SymbolFlags.Module) {
		if (side !== undefined) {
			return reportFailure(
				DiagnosticCode.DocumentationUnsupported,
				`Namespace member ${name} does not have a class member side.`,
			);
		}
		return {
			ok: true,
			value: checker.getExportsOfModule(owner).find((entry) => entry.name === name),
		};
	}
	const valueType = checker.getTypeOfSymbol(owner);
	return {
		ok: true,
		value:
			valueType === undefined || side === "instance"
				? undefined
				: checker
						.getPropertiesOfType(valueType)
						.find((entry) => matchSymbol?.(entry) ?? entry.name === name),
	};
}

/**
 * Identifies a computed member through the compiler symbol of its key expression.
 * @param compiler - Active compiler services.
 * @param locations - Source ownership lookup.
 * @param member - Property or method symbol.
 * @returns The key declaration identity, or undefined for non-symbol names.
 */
function getMemberSymbolId(
	compiler: CompilerContext,
	locations: LocationContext,
	member: CompilerSymbol,
): ApiItemId | undefined {
	for (const handle of member.declarations) {
		const node = handle.resolve();
		if (
			node !== undefined &&
			"name" in node &&
			node.name !== undefined &&
			isComputedPropertyName(node.name as Node)
		) {
			const name = node.name as ComputedPropertyName;
			if (
				!(
					(compiler.checker.getTypeAtLocation(name.expression)?.flags ?? 0) &
					TypeFlags.UniqueESSymbol
				)
			) {
				continue;
			}
			const symbol = compiler.checker.getSymbolAtLocation(name.expression);
			if (symbol !== undefined) {
				return getSymbolReferenceId(
					compiler,
					locations,
					resolveSymbolTarget(compiler.checker, symbol),
				);
			}
		}
	}
	return undefined;
}

/**
 * Identifies a unique-symbol declaration independently of compiler-library file versions.
 * @param compiler - Active compiler services.
 * @param locations - Package-relative identity context.
 * @param symbol - Resolved key symbol.
 * @returns A stable well-known symbol key or the package declaration identity.
 */
function getSymbolReferenceId(
	compiler: CompilerContext,
	locations: LocationContext,
	symbol: CompilerSymbol,
): ApiItemId {
	return symbol.declarations.length > 0 &&
		symbol.declarations.every((handle) => {
			const source = handle.resolve()?.getSourceFile();
			return source !== undefined && compiler.program.isSourceFileDefaultLibrary(source);
		})
		? `well-known-symbol:${symbol.name}`
		: getDeclarationId(locations, symbol);
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

	/**
	 * Visits parsed nodes in source order without modifying the comment tree.
	 * @param node - Current node in the original TSDoc tree.
	 */
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
 * @param state - Declaration tracking and optional configured module symbols. Discard it if extraction throws.
 * @param symbol - A declaration target after alias resolution.
 * @returns The provisional identifier used to reference the declaration in this result.
 * @throws If a declaration or heritage target cannot be resolved, or extraction of required facts fails.
 */
export function collect(
	compiler: CompilerContext,
	locations: LocationContext,
	state: CollectionState,
	symbol: CompilerSymbol,
): ApiItemId {
	const { checker } = compiler;
	const { declarations, visiting } = state;
	assert(!checker.isUnknownSymbol(symbol), "Collected declaration symbols must be resolved.");
	const id = getDeclarationId(locations, symbol);
	if (declarations.has(id) || visiting.has(id)) {
		return id;
	}

	// Reserve the identifier before following exports or documentation references back to this symbol.
	visiting.add(id);
	const namespace = extractModuleNamespace(compiler, locations, state, symbol, id);
	if (namespace !== undefined) {
		declarations.set(id, namespace);
		visiting.delete(id);
		return id;
	}
	const moduleSource = symbol.declarations.find(
		(handle) => handle.kind === SyntaxKind.SourceFile,
	);

	// Keep module exports, but omit module type text that can contain absolute paths.
	const type = moduleSource
		? undefined
		: symbol.flags & SymbolFlags.Type
			? checker.getDeclaredTypeOfSymbol(symbol)
			: checker.getTypeOfSymbol(symbol);
	const typeSymbol = type?.getSymbol();
	const externalType =
		typeSymbol !== undefined &&
		Boolean(typeSymbol.flags & (SymbolFlags.Class | SymbolFlags.Interface)) &&
		!isSuiteSymbol(compiler, locations, typeSymbol);
	const effectiveMembers =
		type &&
		!externalType &&
		(!(symbol.flags & SymbolFlags.Module) ||
			Boolean(symbol.flags & (SymbolFlags.Class | SymbolFlags.Interface)))
			? extractMembers(compiler, locations, type, id, state)
			: [];
	const baseDeclarations = collectBaseDeclarations(compiler, locations, state, symbol, type);
	const namespaceExports =
		symbol.flags & SymbolFlags.Module
			? collectExports(compiler, locations, state, symbol, moduleSource === undefined)
			: [];
	const heritage = extractHeritageFacts(
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
	const outsideSuite = Boolean(
		type &&
			(externalType ||
				checker
					.getPropertiesOfType(type)
					.some(
						(property) =>
							property.declarations.length > 0 &&
							!isSuiteSymbol(compiler, locations, property),
					)),
	);
	const partial = Boolean(
		type &&
			(type.isConditionalType() ||
				type.isIndexedAccessType() ||
				type.isUnionType() ||
				effectiveMembers.some((member) => member.readonly === null)),
	);
	const callSignatures = extractDeclarationSignatures(
		compiler,
		locations,
		state,
		symbol,
		type,
		id,
	);
	const sources = symbol.declarations.map((handle) =>
		extractSourceDeclaration(locations, handle, compiler),
	);
	const sourceNodes = symbol.declarations.map((handle) => handle.resolve());
	const sourceNode = sourceNodes[0];
	const documentationContext = extractDeclarationDocumentationContext(
		compiler,
		locations,
		state,
		sources,
		sourceNodes,
		id,
	);
	const containerIndices = sourceNodes.flatMap((node, index) =>
		node !== undefined &&
		(isClassDeclaration(node) || isInterfaceDeclaration(node) || isEnumDeclaration(node))
			? [index]
			: [],
	);
	const containerIndex = containerIndices[0];
	const container =
		containerIndices.length === 1 && containerIndex !== undefined
			? extractContainerSyntax(
					compiler,
					locations,
					state,
					assertDefined(sourceNodes[containerIndex]),
					assertDefined(sources[containerIndex]),
					id,
				)
			: mergeDeclarationContainers(
					compiler,
					locations,
					state,
					containerIndices.map((index) => sourceNodes[index]),
					containerIndices.map((index) => assertDefined(sources[index])),
					id,
				);
	const statementNode = sourceNodes.find(
		(node) =>
			node !== undefined && (isVariableDeclaration(node) || isTypeAliasDeclaration(node)),
	);
	const statement = extractStatementSyntax(
		compiler,
		locations,
		statementNode ?? sourceNode,
		type,
	);
	const symbolId = getMemberSymbolId(compiler, locations, symbol);

	// Publish only after recursive dependencies have been collected; active identities prevent cycles.
	declarations.set(id, {
		id,
		...(symbolId === undefined ? {} : { symbolId }),
		...(documentationContext === undefined ? {} : { documentationContext }),
		...(container === undefined ? {} : { container }),
		...(statement === undefined ? {} : { statement }),
		baseDeclarations,
		heritage,
		implementedDeclarations: implemented,
		name: moduleSource
			? getOrigin(locations, moduleSource.path, 0).file
			: getSourceSymbolName(symbol),
		declarations: sources,
		type: type ? checker.typeToString(type, symbol.declarations[0]?.resolve()) : "",
		memberView: partial || outsideSuite ? "partial" : "complete",
		limitations:
			partial || outsideSuite
				? [
						{
							code: partial
								? DiagnosticCode.MemberExpansionIncomplete
								: DiagnosticCode.MemberExpansionOutsideSuite,
							message: partial
								? `Member expansion for ${symbol.name} is incomplete. Retain the original declaration and do not present this member list as complete.`
								: `Member expansion for ${symbol.name} stops at types outside the suite. Retain the original type references and do not present this member list as complete.`,
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
 * Extracts a module namespace wrapper without replacing its child declarations or their metadata.
 * @param compiler - Active native compiler services.
 * @param locations - Original package ownership settings.
 * @param state - Collection state with the wrapper identity already reserved for cycle detection.
 * @param symbol - Resolved symbol, preserving namespace-export aliases.
 * @param id - Wrapper declaration identity.
 * @returns A documented namespace wrapper, or undefined for other declaration forms.
 */
function extractModuleNamespace(
	compiler: CompilerContext,
	locations: LocationContext,
	state: CollectionState,
	symbol: CompilerSymbol,
	id: ApiItemId,
): DeclarationFact | undefined {
	const namespaceNode = symbol.declarations
		.find((handle) => handle.kind === SyntaxKind.NamespaceExport)
		?.resolve();
	if (namespaceNode === undefined || !isNamespaceExport(namespaceNode)) {
		return undefined;
	}
	const statement = namespaceNode.parent;
	assert(
		isExportDeclaration(statement),
		"Namespace exports must belong to export declarations.",
	);
	const source = {
		...extractSourceDeclaration(locations, assertDefined(symbol.declarations[0]), compiler),
		documentation: getOriginalComment(statement),
	};
	return {
		id,
		name: namespaceNode.name.text,
		declarations: [source],
		documentationContext: createReferenceContext(
			compiler,
			locations,
			state,
			statement,
			source,
			id,
			source.documentation,
		),
		type: "",
		memberView: "complete",
		baseDeclarations: [],
		heritage: [],
		implementedDeclarations: [],
		limitations: [],
		members: [],
		signatures: [],
		exports: collectExports(
			compiler,
			locations,
			state,
			compiler.checker.getAliasedSymbol(symbol),
		),
	};
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
	compiler: CompilerContext,
	locations: LocationContext,
	state: CollectionState,
	symbol: CompilerSymbol,
	type: Type | undefined,
): ApiItemId[] {
	if (
		!(symbol.flags & (SymbolFlags.Class | SymbolFlags.Interface)) ||
		type?.isClassOrInterface() !== true
	) {
		return [];
	}
	return compiler.checker.getBaseTypes(type).flatMap((base) => {
		const baseSymbol = base.getSymbol();
		assert(
			baseSymbol !== undefined,
			"The compiler must resolve a declaration symbol for a base type.",
		);
		const target = resolveSymbolTarget(compiler.checker, baseSymbol);
		return isSuiteSymbol(compiler, locations, target)
			? [collect(compiler, locations, state, target)]
			: [];
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
function extractDeclarationSignatures(
	compiler: CompilerContext,
	locations: LocationContext,
	state: CollectionState,
	symbol: CompilerSymbol,
	type: Type | undefined,
	id: ApiItemId,
): SignatureFact[] {
	if (type === undefined) {
		return [];
	}
	const facts = extractSignatures(compiler, type, id, locations);
	const hasCallableComment = symbol.declarations.some(
		(handle) =>
			handle.kind === SyntaxKind.FunctionDeclaration ||
			handle.kind === SyntaxKind.MethodDeclaration ||
			handle.kind === SyntaxKind.MethodSignature,
	);
	return hasCallableComment
		? addDocumentationContexts(compiler, locations, state, type, facts).map((fact) =>
				symbol.declarations.some((handle) => handle.kind === SyntaxKind.ModuleDeclaration) &&
				fact.documentationContext !== undefined
					? { ...fact, documentationContext: { ...fact.documentationContext, container: id } }
					: fact,
			)
		: facts;
}

/**
 * Captures the original documentation context for a supported declaration.
 *
 * @remarks
 * Merged interface, property, and named namespace comments combine content in compiler order while retaining each surviving reference's scope.
 * Supported compound symbols retain a shared context while each callable keeps its original parameter context.
 * Retains type-reference occurrences from every supported declaration part.
 *
 * @param compiler - Active checker and emitter.
 * @param locations - Package ownership lookup state.
 * @param state - Target collection and parsed comments updated during extraction.
 * @param sources - Original declaration records in compiler order.
 * @param sourceNodes - Original nodes in source-record order. An undefined entry prevents context extraction.
 * @param id - Owning declaration identity.
 * @returns The original reference context, or `undefined` for ambiguous, unavailable, or unsupported declarations.
 * @throws If source records are inconsistent or compiler extraction fails unexpectedly.
 */
function extractDeclarationDocumentationContext(
	compiler: CompilerContext,
	locations: LocationContext,
	state: CollectionState,
	sources: readonly SourceDeclarationFact[],
	sourceNodes: readonly (Node | undefined)[],
	id: ApiItemId,
): DocumentationReferenceContext | undefined {
	const source = sources[0];
	const sourceNode = sourceNodes[0];
	if (!sourceNode || !source) {
		return undefined;
	}
	if (sources.length > 1) {
		const namespace = sources.some((part) => part.kind === "ModuleDeclaration");
		const enumeration = sources.every((part) => part.kind === "EnumDeclaration");
		if (
			!sourceNodes.every(
				(node): node is Node =>
					node !== undefined &&
					(isInterfaceDeclaration(node) ||
						isClassDeclaration(node) ||
						isVariableDeclaration(node) ||
						(enumeration && isEnumDeclaration(node)) ||
						(namespace &&
							(node.kind === SyntaxKind.FunctionDeclaration || isEnumDeclaration(node))) ||
						node.kind === SyntaxKind.PropertySignature ||
						node.kind === SyntaxKind.PropertyDeclaration ||
						(namespace && isModuleDeclaration(node))),
			)
		) {
			return undefined;
		}
		return mergeReferenceContexts(compiler, locations, state, sourceNodes, sources, id);
	}
	const supported =
		source.kind === "EnumMember" ||
		source.kind === "PropertyDeclaration" ||
		source.kind === "PropertySignature" ||
		isClassDeclaration(sourceNode) ||
		isInterfaceDeclaration(sourceNode) ||
		isEnumDeclaration(sourceNode) ||
		isTypeAliasDeclaration(sourceNode) ||
		isModuleDeclaration(sourceNode) ||
		isVariableDeclaration(sourceNode);
	return supported
		? createReferenceContext(
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
 * Combines source comments in compiler order without changing original reference scopes.
 *
 * @remarks
 * Resolves each comment in its own declaration scope before deduplicating content.
 * Equal contributions retain the first occurrence and its lookup results; distinct contributions retain separate lookups.
 *
 * @param compiler - Active checker and emitter.
 * @param locations - Package ownership lookup state.
 * @param state - Parsed comments and target collection updated during extraction.
 * @param nodes - Available original nodes in source-record order.
 * @param sources - Nonempty original source records with the same length as nodes.
 * @param id - Documentation input identity of the effective member or declaration.
 * @returns Combined metadata and original contributions for inheritance, or `undefined` for malformed comments.
 * @throws If source records are empty, do not correspond to the nodes, or compiler extraction fails unexpectedly.
 */
function mergeReferenceContexts(
	compiler: CompilerContext,
	locations: LocationContext,
	state: CollectionState,
	nodes: readonly Node[],
	sources: readonly SourceDeclarationFact[],
	id: ApiItemId,
): DocumentationReferenceContext | undefined {
	assert(sources.length > 0, "Merged contexts require original source records.");
	assert(nodes.length === sources.length, "Merged nodes must correspond to source records.");

	const parser = state.documentation?.parser ?? new TSDocParser();
	const comments = sources.map((source) =>
		parser.parseString(source.documentation ?? "/** */"),
	);
	if (comments.some((comment) => comment.log.messages.length > 0)) {
		return undefined;
	}
	const hasInheritance = comments.some(
		(comment) => comment.docComment.inheritDocTag !== undefined,
	);
	const distinct = new Map<string, DocumentationReferenceContext>();
	const links = new Map<DocLinkTag, DocumentationReferenceLookup>();
	const inheritance = new Map<DocNode, DocumentationReferenceLookup>();

	// Resolve before combining: a retained node must keep the lookup from its own declaration scope.
	const contexts = nodes.map((node, index) => {
		const source = assertDefined(sources[index]);
		const parsed = assertDefined(comments[index]);
		const text = parsed.docComment.emitAsTsdoc() || "/** */";
		const duplicate = hasInheritance ? distinct.get(text) : undefined;
		if (duplicate !== undefined) {
			for (const [linkIndex, link] of collectApiLinkNodes(parsed.docComment).entries()) {
				links.set(link, {
					...assertDefined(duplicate.links[linkIndex]),
					origin: duplicate.origin,
				});
			}
			return {
				...duplicate,
				typeReferences: collectDeclarationReferences(compiler, locations, state, node, source),
			};
		}
		const context = createReferenceContext(
			compiler,
			locations,
			state,
			node,
			source,
			id,
			source.documentation,
			parsed,
		);
		if (hasInheritance) {
			distinct.set(text, { ...context, documentation: text });
		}
		for (const [linkIndex, link] of collectApiLinkNodes(parsed.docComment).entries()) {
			links.set(link, { ...assertDefined(context.links[linkIndex]), origin: context.origin });
		}
		if (parsed.docComment.inheritDocTag !== undefined && context.inheritance !== undefined) {
			inheritance.set(parsed.docComment.inheritDocTag, {
				...context.inheritance,
				origin: context.origin,
			});
		}
		return context;
	});
	const first = assertDefined(
		contexts[0],
		"Merged contexts must retain an original lookup context.",
	);
	if (sources.length === 1) {
		return first;
	}
	const merged = mergeDocumentationComments(
		parser,
		comments.map((comment) => comment.docComment),
		!hasInheritance,
	);
	if (merged === undefined) {
		return undefined;
	}
	const documentation = sources.every((source) => source.documentation === undefined)
		? undefined
		: merged.emitAsTsdoc() || "/** */";
	state.documentation?.comments.set(id, parser.parseString(documentation ?? "/** */"));
	const request =
		merged.inheritDocTag === undefined ? undefined : inheritance.get(merged.inheritDocTag);
	return {
		...(first.container === undefined ? {} : { container: first.container }),
		labels: collectDocumentationLabels(merged),
		...(hasInheritance ? { contributions: [...distinct.values()] } : {}),
		origin: first.origin,
		...(first.typeParameters === undefined ? {} : { typeParameters: first.typeParameters }),
		...(documentation === undefined ? {} : { documentation }),
		links: collectApiLinkNodes(merged).map((link) => assertDefined(links.get(link))),
		...(request === undefined ? {} : { inheritance: request }),
		typeReferences: contexts.flatMap((context) => context.typeReferences ?? []),
	};
}

/**
 * Combines compiler-validated interface headers into one container description.
 *
 * @remarks
 * Merges generic defaults and heritage syntax through native AST factories; comments are combined separately.
 * Declared signatures retain their original source records and documentation contexts.
 *
 * @param compiler - Active checker and emitter.
 * @param locations - Package ownership lookup state.
 * @param state - Target collection and parsed comments updated during extraction.
 * @param nodes - Original declaration nodes in source order. An undefined entry prevents merging.
 * @param sources - Original source records for the same symbol, in node order and with the same length as nodes.
 * @param id - Merged declaration identity.
 * @returns One combined container header and declared members, or `undefined` for unsupported merges.
 * @throws If a required source record is missing or compiler extraction fails unexpectedly.
 */
function mergeDeclarationContainers(
	compiler: CompilerContext,
	locations: LocationContext,
	state: CollectionState,
	nodes: readonly (Node | undefined)[],
	sources: readonly SourceDeclarationFact[],
	id: ApiItemId,
): DeclarationContainerFact | undefined {
	const source = sources[0];
	if (
		source !== undefined &&
		nodes.length > 1 &&
		nodes.every((node): node is Node => node !== undefined)
	) {
		const classNode = nodes.find(isClassDeclaration);
		const enums = nodes.every(isEnumDeclaration);
		if (
			enums ||
			(classNode !== undefined &&
				nodes.every((node) => isClassDeclaration(node) || isInterfaceDeclaration(node)))
		) {
			const concreteContainers = nodes.map((node, index) =>
				assertDefined(
					extractContainerSyntax(
						compiler,
						locations,
						state,
						node,
						assertDefined(sources[index]),
						id,
					),
				),
			);
			const primary = assertDefined(
				concreteContainers[enums ? 0 : nodes.indexOf(assertDefined(classNode))],
			);
			if (concreteContainers.some((container) => !container.supported)) {
				return undefined;
			}
			const interfaceIndices = nodes.flatMap((node, index) =>
				isInterfaceDeclaration(node) ? [index] : [],
			);
			const separateInterface =
				classNode !== undefined &&
				concreteContainers.some((container) =>
					container.declaredMembers.some(
						(member) =>
							member.kind === "CallSignature" || member.kind === "ConstructSignature",
					),
				);
			const interfaceContainer = separateInterface
				? interfaceIndices.length === 1
					? concreteContainers[assertDefined(interfaceIndices[0])]
					: mergeDeclarationContainers(
							compiler,
							locations,
							state,
							interfaceIndices.map((index) => nodes[index]),
							interfaceIndices.map((index) => assertDefined(sources[index])),
							id,
						)
				: undefined;
			if (separateInterface && interfaceContainer === undefined) {
				return undefined;
			}
			return {
				...primary,
				imports: [...(primary.imports ?? []), ...(interfaceContainer?.imports ?? [])],
				...(interfaceContainer === undefined
					? {}
					: { interfaceSuffix: interfaceContainer.suffix }),
				declaredMembers: concreteContainers.flatMap((container) => container.declaredMembers),
			};
		}
	}

	// Other declaration kinds require separate structural merge support.
	if (
		sources.length < 2 ||
		source === undefined ||
		!nodes.every((node) => node !== undefined && isInterfaceDeclaration(node))
	) {
		return undefined;
	}
	const containers = nodes.map((node, index) =>
		extractContainerSyntax(
			compiler,
			locations,
			state,
			node,
			assertDefined(sources[index]),
			id,
		),
	);
	const first = assertDefined(
		containers[0],
		"Interface sources must supply container syntax.",
	);
	if (
		containers.some(
			(container) =>
				container === undefined || !container.supported || container.prefix !== first.prefix,
		)
	) {
		return undefined;
	}

	const original = assertDefined(nodes[0]);
	const parameters: TypeParameterDeclaration[] = [];
	for (const node of nodes) {
		for (const [index, parameter] of (node.typeParameters ?? []).entries()) {
			if (parameter.defaultType !== undefined || parameters[index] === undefined) {
				parameters[index] = parameter;
			}
		}
	}
	const bases = new Map(
		nodes.flatMap((node) =>
			(node.heritageClauses ?? []).flatMap((clause) =>
				clause.types.map((base) => [compiler.emitter.printNode(base), base] as const),
			),
		),
	);
	const merged = updateInterfaceDeclaration(
		original,
		original.modifiers,
		original.name,
		parameters,
		bases.size === 0
			? undefined
			: [createHeritageClause(SyntaxKind.ExtendsKeyword, [...bases.values()])],
		[],
	);
	const header = assertDefined(
		extractContainerSyntax(compiler, locations, state, merged, source, id),
	);
	return {
		...header,
		imports: containers.flatMap((container) => container?.imports ?? []),
		declaredMembers: containers.flatMap((container) => container?.declaredMembers ?? []),
	};
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
function extractContainerSyntax(
	compiler: CompilerContext,
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
			imports: [
				...(node.typeParameters ?? []),
				...(node.heritageClauses ?? []).flatMap((clause) => clause.types),
			].flatMap(
				(part) =>
					captureImports(
						compiler,
						part,
						part,
						createExcerptTargetResolver(compiler, locations),
					).imports ?? [],
			),
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

				// Declaration emit erases private constructor parameters. Keep each original comment distinct even when syntax is identical.
				const occurrence = member.kind === SyntaxKind.Constructor ? `:${member.pos}` : "";
				const memberId = `${id}:declared:${createHash("sha256").update(printed).digest("hex")}${occurrence}`;
				return createDeclaredMemberRecord(
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
				return createDeclaredMemberRecord(
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
		getMemberVisibility([member]) !== undefined ||
		(member.kind !== SyntaxKind.PropertyDeclaration &&
			member.kind !== SyntaxKind.PropertySignature &&
			member.kind !== SyntaxKind.MethodDeclaration &&
			member.kind !== SyntaxKind.MethodSignature) ||
		("modifiers" in member &&
			Array.isArray(member.modifiers) &&
			member.modifiers.some((modifier: Node) => modifier.kind === SyntaxKind.StaticKeyword))
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
function createDeclaredMemberRecord(
	compiler: CompilerContext,
	locations: LocationContext,
	state: CollectionState,
	member: Node,
	source: Origin,
	id: ApiItemId,
	printed: string,
): DeclaredMemberFact {
	const location = { packageName: source.packageName, file: source.file, start: member.pos };
	const documentation = getOriginalComment(member);
	let staticTarget: ApiItemId | undefined;
	if (
		(member.kind === SyntaxKind.EnumMember ||
			("modifiers" in member &&
				Array.isArray(member.modifiers) &&
				member.modifiers.some(
					(modifier: Node) => modifier.kind === SyntaxKind.StaticKeyword,
				))) &&
		"name" in member &&
		member.name !== undefined
	) {
		const symbol = compiler.checker.getSymbolAtLocation(member.name as Node);
		assert(symbol !== undefined, "Named static members must have compiler symbols.");
		staticTarget = collect(
			compiler,
			locations,
			state,
			resolveSymbolTarget(compiler.checker, symbol),
		);
	}
	const documentationContext = createReferenceContext(
		compiler,
		locations,
		state,
		member,
		location,
		id,
		documentation,
	);
	const pairedAccessor = getPairedAccessorId(compiler, member, documentationContext.container);
	return {
		...location,
		...(pairedAccessor === undefined ? {} : { pairedAccessor }),
		...captureImports(
			compiler,
			member,
			member,
			createExcerptTargetResolver(compiler, locations),
		),
		excerpt: createSourceExcerpt(
			compiler,
			member,
			createExcerptTargetResolver(compiler, locations),
		),
		...(staticTarget === undefined ? {} : { staticTarget }),
		kind: SyntaxKind[member.kind],
		text: member.getFullText(),
		documentation,
		id,
		printed,
		documentationContext,
	};
}

/**
 * Identifies the other accessor from compiler declarations instead of comparing displayed member names.
 * @param compiler - Active checker and emitter.
 * @param member - Original member declaration.
 * @param container - Original declaring-container identity; undefined means no pair can be recorded.
 * @returns The other accessor's declared-member identity, or undefined for an unpaired member.
 */
function getPairedAccessorId(
	compiler: CompilerContext,
	member: Node,
	container: ApiItemId | undefined,
): ApiItemId | undefined {
	if (
		container === undefined ||
		!(isGetAccessorDeclaration(member) || isSetAccessorDeclaration(member))
	) {
		return undefined;
	}
	const partnerKind = isGetAccessorDeclaration(member)
		? SyntaxKind.SetAccessor
		: SyntaxKind.GetAccessor;

	// Symbol identity distinguishes static, instance, and computed keys; the parent check keeps ownership local.
	const symbol = compiler.checker.getSymbolAtLocation(member.name);
	const partner = symbol?.declarations
		.map((handle) => handle.resolve())
		.find((node) => node?.kind === partnerKind && node.parent === member.parent);
	if (partner === undefined) {
		return undefined;
	}

	// Match the original declared-member ID even if the partner has not been collected yet.
	const printed = compiler.emitter.printNode(getSynthesizedDeepClone(partner)).trim();
	return `${container}:declared:${createHash("sha256").update(printed).digest("hex")}`;
}

/**
 * Extracts atomic declaration syntax while keeping the name available for alias rendering.
 * @param compiler - Active checker and emitter.
 * @param locations - Package ownership for import target identities.
 * @param sourceNode - Original node, or undefined when unavailable; produces no statement then.
 * @param type - Effective variable type; if undefined and no type or initializer exists, prints unknown.
 * @returns Detached type alias or variable syntax, or undefined for other declarations.
 */
function extractStatementSyntax(
	compiler: CompilerContext,
	locations: LocationContext,
	sourceNode: Node | undefined,
	type: Type | undefined,
): DeclarationStatementFact | undefined {
	if (sourceNode && isTypeAliasDeclaration(sourceNode)) {
		return {
			...captureImports(
				compiler,
				sourceNode,
				sourceNode,
				createExcerptTargetResolver(compiler, locations),
			),
			prefix: "type ",
			suffix: `${sourceNode.typeParameters === undefined ? "" : `<${sourceNode.typeParameters.map((parameter) => compiler.emitter.printNode(getSynthesizedDeepClone(parameter)).trim()).join(", ")}>`} = ${compiler.emitter.printNode(getSynthesizedDeepClone(sourceNode.type)).trim()};`,
		};
	}
	if (sourceNode && isVariableDeclaration(sourceNode)) {
		return {
			...captureImports(
				compiler,
				sourceNode,
				sourceNode,
				createExcerptTargetResolver(compiler, locations),
			),
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
function addDocumentationContexts(
	compiler: CompilerContext,
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
					...addEffectiveTypeReferences(
						compiler,
						locations,
						state,
						createReferenceContext(
							compiler,
							locations,
							state,
							node,
							getOrigin(locations, handle.path, node.pos),
							fact.id,
							fact.documentation,
						),
						[
							...signature
								.getParameters()
								.map((_parameter, parameterIndex) =>
									compiler.checker.getParameterType(signature, parameterIndex),
								),
							compiler.checker.getReturnTypeOfSignature(signature),
						],
						fact.id,
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
 * @param parsedComment - Original parsed comment for a deduplicated merge contribution. Omit to parse the comment here.
 * @returns Detached reference facts, including original generic declaration parameter names; parsed nodes remain private to the invocation.
 */
function createReferenceContext(
	compiler: CompilerContext,
	locations: LocationContext,
	state: CollectionState,
	node: Node,
	location: Origin,
	id: ApiItemId,
	documentation: string | undefined,
	parsedComment?: ReturnType<TSDocParser["parseString"]>,
): DocumentationReferenceContext {
	const container = collectDeclaringContainer(compiler, locations, state, node);
	let source = node;
	while (!isSourceFile(source)) {
		source = source.parent;
	}
	const parsed =
		parsedComment ??
		(state.documentation?.parser ?? new TSDocParser()).parseString(documentation ?? "/** */");
	state.documentation?.comments.set(id, parsed);
	const links = collectLinks(parsed.docComment, (reference) =>
		lookupReference(compiler, locations, state, node, source, reference, true),
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
	const context: DocumentationReferenceContext = {
		labels: collectDocumentationLabels(parsed.docComment),
		...(container === undefined ? {} : { container }),
		origin: { packageName: location.packageName, file: location.file, start: location.start },
		...(isInterfaceDeclaration(node) ||
		isClassDeclaration(node) ||
		isTypeAliasDeclaration(node)
			? { typeParameters: node.typeParameters?.map((parameter) => parameter.name.text) ?? [] }
			: {}),
		typeReferences: collectDeclarationReferences(compiler, locations, state, node, location),
		links,
		...(inheritance === undefined ? {} : { inheritance }),
	};
	return isVariableDeclaration(node)
		? addEffectiveTypeReferences(
				compiler,
				locations,
				state,
				context,
				[compiler.checker.getTypeAtLocation(node)],
				id,
			)
		: context;
}

/**
 * Retains the original lexical container, not the receiver of an inherited member view.
 * @param compiler - Active compiler services.
 * @param locations - Package ownership information.
 * @param state - Declaration collection with reserved identities for recursive extraction.
 * @param node - Original node that owns the documentation input.
 * @returns The closest class, interface, enum, or namespace identifier, or undefined at module scope.
 * @throws If a named container cannot be resolved by the compiler.
 */
function collectDeclaringContainer(
	compiler: CompilerContext,
	locations: LocationContext,
	state: CollectionState,
	node: Node,
): ApiItemId | undefined {
	let parent = node.parent;
	while (parent !== undefined && !isSourceFile(parent)) {
		if (
			isClassDeclaration(parent) ||
			isInterfaceDeclaration(parent) ||
			isEnumDeclaration(parent) ||
			isModuleDeclaration(parent)
		) {
			// A source-file module does not impose one release level on all its top-level exports.
			if (parent.name === undefined) {
				return undefined;
			}
			const symbol = compiler.checker.getSymbolAtLocation(parent.name);
			assert(symbol !== undefined, "Named containers must have compiler symbols.");
			return collect(
				compiler,
				locations,
				state,
				resolveSymbolTarget(compiler.checker, symbol),
			);
		}
		parent = parent.parent;
	}
	return undefined;
}

/**
 * Adds named reference edges from an effective compiler type without expanding named declarations.
 *
 * @remarks
 * Keeps syntax occurrences intact and appends only additional target identities. Anonymous structural,
 * union, intersection, indexed, conditional, and instantiated argument types are traversed with compiler APIs.
 * Compiler type identities guard recursive traversal and are never stored in returned facts.
 *
 * @param compiler - Active native compiler services.
 * @param locations - Original package ownership lookup.
 * @param state - Invocation-owned target collection.
 * @param context - Original documentation context, including syntax references and diagnostic location.
 * @param types - Effective types of the property or selected signature.
 * @param owner - Receiving API identity excluded from self-reference collection.
 * @returns A new context with additional named target references, without mutating the original.
 */
function addEffectiveTypeReferences(
	compiler: CompilerContext,
	locations: LocationContext,
	state: CollectionState,
	context: DocumentationReferenceContext,
	types: readonly (Type | undefined)[],
	owner: ApiItemId,
): DocumentationReferenceContext {
	const references = [...(context.typeReferences ?? [])];
	const targets = new Set(references.map((reference) => reference.target));
	const visited = new Set<number>();
	const pending = [...types];
	while (pending.length > 0) {
		const type = pending.pop();
		if (type === undefined || visited.has(type.id)) {
			continue;
		}
		visited.add(type.id);
		pending.push(...type.getAliasTypeArguments());
		if (type.isTypeReference()) {
			pending.push(...compiler.checker.getTypeArguments(type));
		}
		const symbol = type.getAliasSymbol() ?? type.getSymbol();
		if (symbol !== undefined && symbol.declarations.length > 0) {
			if (!isSuiteSymbol(compiler, locations, symbol)) {
				continue;
			}
			if (
				symbol.declarations.some((handle) =>
					[
						SyntaxKind.ClassDeclaration,
						SyntaxKind.InterfaceDeclaration,
						SyntaxKind.TypeAliasDeclaration,
						SyntaxKind.EnumDeclaration,
						SyntaxKind.FunctionDeclaration,
						SyntaxKind.VariableDeclaration,
					].includes(handle.kind),
				)
			) {
				const target = collect(
					compiler,
					locations,
					state,
					resolveSymbolTarget(compiler.checker, symbol),
				);
				if (target !== owner && !targets.has(target)) {
					targets.add(target);
					references.push({ target, text: symbol.name, origin: context.origin });
				}
				continue;
			}
		}
		if (type.isUnionType() || type.isIntersectionType() || type.isTemplateLiteralType()) {
			pending.push(...type.getTypes());
		} else if (type.isIndexedAccessType()) {
			pending.push(type.getObjectType(), type.getIndexType());
		} else if (type.isIndexType() || type.isStringMappingType()) {
			pending.push(type.getTarget());
		} else if (type.isConditionalType()) {
			pending.push(
				type.getCheckType(),
				type.getExtendsType(),
				type.getTrueType(),
				type.getFalseType(),
			);
		} else if (type.isSubstitutionType()) {
			pending.push(type.getBaseType(), type.getConstraint());
		} else if (type.isObjectType()) {
			pending.push(
				...compiler.checker
					.getPropertiesOfType(type)
					.map((property) => compiler.checker.getTypeOfSymbol(property)),
			);
			for (const index of compiler.checker.getIndexInfosOfType(type)) {
				pending.push(index.keyType, index.valueType);
			}
			for (const kind of [SignatureKind.Call, SignatureKind.Construct]) {
				for (const signature of compiler.checker.getSignaturesOfType(type, kind)) {
					pending.push(
						compiler.checker.getReturnTypeOfSignature(signature),
						...signature
							.getParameters()
							.map((_parameter, index) => compiler.checker.getParameterType(signature, index)),
					);
				}
			}
		}
	}
	return { ...context, typeReferences: references };
}

/**
 * Checks whether a compiler symbol has an original declaration owned by this suite.
 *
 * @param compiler - Active compiler services used to recognize standard-library files.
 * @param locations - Current package and resolved dependency owners.
 * @param symbol - Resolved symbol whose original declarations are inspected.
 * @returns True for a declaration in the current package or a selected dependency, excluding compiler libraries.
 */
function isSuiteSymbol(
	compiler: CompilerContext,
	locations: LocationContext,
	symbol: CompilerSymbol,
): boolean {
	return symbol.declarations.some((handle) => {
		const source = handle.resolve()?.getSourceFile();
		if (source === undefined || compiler.program.isSourceFileDefaultLibrary(source)) {
			return false;
		}
		const owner = getOrigin(locations, handle.path, 0).packageName;
		return (
			owner === locations.configuration.packageName ||
			locations.suitePackages?.has(owner) === true
		);
	});
}

/**
 * Captures reference identities from original type syntax without parsing printed types.
 *
 * @param compiler - Active checker and emitter.
 * @param locations - Package ownership lookup state.
 * @param state - Shared target collection for this invocation.
 * @param node - Original declaration whose type syntax is inspected.
 * @param location - Package-relative declaration location.
 * @returns Ordered reference occurrences, excluding type parameters and outside-suite targets.
 */
function collectDeclarationReferences(
	compiler: CompilerContext,
	locations: LocationContext,
	state: CollectionState,
	node: Node,
	location: Origin,
): DeclarationReferenceFact[] {
	const references: DeclarationReferenceFact[] = [];

	/**
	 * Collects references owned by this API, excluding child APIs and implementation bodies.
	 * @param current - Current original compiler node.
	 */
	function visit(current: Node): void {
		if (current.kind === SyntaxKind.Block) {
			return;
		}

		// An import type names its API through the qualifier, without a local import binding.
		// An unqualified import type has no named target here; its child type arguments are still visited.
		const name = isTypeReferenceNode(current)
			? current.typeName
			: isTypeQueryNode(current)
				? current.exprName
				: isExpressionWithTypeArguments(current)
					? current.expression
					: isImportTypeNode(current)
						? current.qualifier
						: undefined;
		if (name !== undefined) {
			const symbol = compiler.checker.getSymbolAtLocation(name);
			if (symbol && !compiler.checker.isUnknownSymbol(symbol)) {
				const resolved = resolveSymbolTarget(compiler.checker, symbol);
				if (
					!(resolved.flags & SymbolFlags.TypeParameter) &&
					isSuiteSymbol(compiler, locations, resolved)
				) {
					references.push({
						// Include the module path in import-type diagnostics so the target is unambiguous.
						text: compiler.emitter
							.printNode(isImportTypeNode(current) ? current : name)
							.trim(),
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
			// Members have their own metadata and reference checks; do not attribute their types to the container.
			for (const parameter of current.typeParameters ?? []) {
				visit(parameter);
			}
			for (const clause of current.heritageClauses ?? []) {
				visit(clause);
			}
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
function getOriginalComment(node: Node | undefined): string | undefined {
	const comment = node?.jsDoc?.at(-1);
	if (node === undefined || comment === undefined) {
		return undefined;
	}
	const source = node.getSourceFile().text;
	const range = getLeadingCommentRanges(source, comment.pos)?.find(
		(entry) => entry.end === comment.end && entry.kind === SyntaxKind.MultiLineCommentTrivia,
	);
	assert(range !== undefined, "Attached TSDoc nodes must identify an original comment range.");
	const text = source.slice(range.pos, range.end);
	return text.includes("@packageDocumentation") &&
		new TSDocParser()
			.parseString(text)
			.docComment.modifierTagSet.hasTagName("@packageDocumentation")
		? undefined
		: text;
}

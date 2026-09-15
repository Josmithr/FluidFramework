import type { AnalyzerDiagnostic } from "./result.js";

/**
 * A declaration location relative to its owning package.
 */
export interface Origin {
	/**
	 * The name of the package that owns the declaration file.
	 *
	 * @remarks
	 * Can identify a dependency rather than the package being analyzed.
	 */
	readonly packageName: string;
	/**
	 * The file path relative to the owning package root, with `/` separators.
	 */
	readonly file: string;
	/**
	 * The compiler node's starting source position.
	 *
	 * @remarks
	 * Uses the node's `pos` value, which can include leading whitespace and comments.
	 * Uses `0` when the declaration node is unavailable.
	 * This is a source offset, not a line number.
	 */
	readonly start: number;
}

/**
 * An exported binding and the declaration it exposes.
 */
export interface ExportFact {
	/**
	 * The exported name, which can differ from the target declaration's name.
	 */
	readonly name: string;
	/**
	 * The {@link DeclarationFact.id} of the resolved export target.
	 *
	 * @remarks
	 * Aliases that expose the same declaration share this target identifier.
	 */
	readonly target: string;
	/**
	 * Whether the binding is exposed only through type-only imports or exports.
	 *
	 * @remarks
	 * Describes the export path, not whether the target is a type declaration.
	 * An interface exported without type-only syntax does not imply `true`.
	 */
	readonly typeOnly: boolean;
}

/**
 * A callable signature detached from the compiler snapshot.
 */
export interface SignatureFact {
	/**
	 * An opaque, provisional identifier derived from the owner and printed signature.
	 *
	 * @remarks
	 * Does not depend on overload order.
	 * Identical printed signatures for the same owner have the same identifier.
	 * Stability across compiler or analyzer versions is not guaranteed.
	 */
	readonly id: string;
	/**
	 * The compiler-printed function type for this call signature.
	 */
	readonly text: string;
	/**
	 * The full source text of the signature's declaration, including leading comments.
	 *
	 * @remarks
	 * This is raw declaration text, not parsed or resolved TSDoc.
	 * An empty string means that the declaration text was unavailable.
	 */
	readonly documentation: string;
}

/**
 * A property or method as observed on the containing type.
 *
 * @remarks
 * Includes inherited members and compiler-resolved generic substitutions where supported.
 */
export interface MemberFact {
	/**
	 * The compiler-printed declaration name, or the symbol name when no name node is available.
	 */
	readonly name: string;
	/**
	 * The effective member type rendered by the compiler in its declaration context.
	 *
	 * @remarks
	 * This is display text, not a structured type model or a standalone declaration.
	 */
	readonly type: string;
	/**
	 * Whether the compiler marks the effective member as optional.
	 */
	readonly optional: boolean;
	/**
	 * The resolved readonly modifier state.
	 *
	 * @remarks
	 * `true` indicates a readonly modifier; `false` indicates no readonly modifier.
	 * `null` means that the analyzer could not resolve the modifier state.
	 */
	readonly readonly: boolean | null;
	/**
	 * The source locations associated with the member's declarations.
	 *
	 * @remarks
	 * Inherited members retain their original declaration locations.
	 * The array can be empty when the compiler provides no declarations.
	 */
	readonly origins: readonly Origin[];
}

/**
 * A source declaration with its package-relative location, syntax kind, and text.
 *
 * @remarks
 * Describes one source declaration.
 * Several source declarations can contribute to one {@link DeclarationFact} through declaration merging.
 */
export interface SourceDeclarationFact extends Origin {
	/**
	 * The compiler syntax-kind name for this declaration.
	 */
	readonly kind: string;
	/**
	 * The full declaration source text, including leading whitespace and comments.
	 *
	 * @remarks
	 * An empty string means that the declaration node was unavailable.
	 */
	readonly text: string;
}

/**
 * Provisional semantic facts for a resolved declaration symbol.
 *
 * @remarks
 * This is not a complete serialized documentation model or a stable artifact schema.
 * A symbol can have several source declarations through declaration merging.
 */
export interface DeclarationFact {
	/**
	 * An opaque identifier used by export targets within the analysis result.
	 *
	 * @remarks
	 * Derived from package names, package-relative files, and symbol names.
	 * It does not include package versions and is not a globally unique or version-stable identifier.
	 */
	readonly id: string;
	/**
	 * The symbol name, or the package-relative file path for a source-file module.
	 */
	readonly name: string;
	/**
	 * The source declarations associated with the symbol, including their locations and text.
	 */
	readonly declarations: readonly SourceDeclarationFact[];
	/**
	 * The declaration's type rendered by the compiler.
	 *
	 * @remarks
	 * An empty string means that no type was extracted, including for source-file modules.
	 * This text is not a structured type model or a standalone declaration.
	 */
	readonly type: string;
	/**
	 * Whether the analyzer detected incomplete member expansion.
	 *
	 * @remarks
	 * `partial` means that consumers must retain the original declaration and must not
	 * present the member list as complete. See {@link DeclarationFact.limitations} for details.
	 * `complete` means no limitation was detected within the supported extraction subset.
	 * It does not guarantee a complete representation of every TypeScript type feature.
	 */
	readonly memberView: "complete" | "partial";
	/**
	 * Diagnostics that describe incomplete member expansion and how consumers should handle it.
	 *
	 * @remarks
	 * Empty when no member-expansion limitation was detected.
	 */
	readonly limitations: readonly AnalyzerDiagnostic[];
	/**
	 * Effective properties and methods, sorted by member name.
	 *
	 * @remarks
	 * Currently extracted only for object and intersection types.
	 * An empty array does not prove that the original type has no members.
	 */
	readonly members: readonly MemberFact[];
	/**
	 * The compiler's callable signatures, with a separate fact for each overload.
	 *
	 * @remarks
	 * Does not include construct signatures or an overload implementation signature.
	 * Empty when no call signatures were extracted.
	 */
	readonly signatures: readonly SignatureFact[];
	/**
	 * Bindings exported by this module or namespace symbol, sorted by exported name.
	 *
	 * @remarks
	 * Empty for symbols that do not expose module or namespace exports.
	 */
	readonly exports: readonly ExportFact[];
}

/**
 * Exported bindings for one configured entrypoint.
 *
 * @remarks
 * Export targets refer to declaration facts shared across the analysis result.
 */
export interface SurfaceFact {
	/**
	 * The configured entrypoint name, such as `.` or `./browser`.
	 */
	readonly name: string;
	/**
	 * The entrypoint's exported bindings, sorted by exported name.
	 */
	readonly exports: readonly ExportFact[];
}

/**
 * Shared semantic data for all configured entrypoints in one analysis context.
 *
 * @remarks
 * Results produced by the analyzer are deeply frozen and contain no compiler objects.
 * They remain usable after the compiler snapshot or analysis session closes.
 */
export interface AnalysisFacts {
	/**
	 * The configured name of the package being analyzed.
	 */
	readonly packageName: string;
	/**
	 * The version of the compiler used for analysis, not necessarily the package's build compiler.
	 */
	readonly compilerVersion: string;
	/**
	 * The configured entrypoint surfaces, sorted by entrypoint name.
	 */
	readonly surfaces: readonly SurfaceFact[];
	/**
	 * Declaration facts referenced by surface and namespace exports, sorted by identifier.
	 *
	 * @remarks
	 * Shared export targets use the same declaration fact.
	 * This collection is not a complete graph of every type referenced by those declarations.
	 */
	readonly declarations: readonly DeclarationFact[];
}

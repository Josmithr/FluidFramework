import type { AnalyzerDiagnostic } from "./result.js";

/**
 * An opaque string that identifies an API item within its owning data set.
 *
 * @remarks
 * Used for declaration, member, and signature identities, export references, and classification metadata.
 * Compare identifiers by exact string equality. Do not parse, trim, or normalize them.
 * No prescribed syntax, non-blank requirement, global uniqueness, or cross-version stability is guaranteed.
 * This alias does not add runtime validation or distinguish different kinds of API items.
 *
 * When passing facts to classification, reuse their identifiers to associate metadata with the original facts.
 * Classification requires distinct identifiers within each request and preserves them through selection.
 * It sorts results by JavaScript string comparison and includes identifiers in item-specific diagnostic messages.
 * Callers that supply their own documentation inputs also supply their identifiers.
 *
 * Analyzer-generated identifiers are provisional. See {@link DeclarationFact.id} and
 * {@link MemberFact.id} and {@link SignatureFact.id} for their generation rules and limitations.
 */
export type ApiItemId = string;

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
	readonly target: ApiItemId;
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
	 * Compiler lookup and parameter facts for function or method documentation.
	 *
	 * @remarks
	 * The analyzer provides this property for collected functions and methods and inspectable effective callable signatures.
	 * Effective signatures retain their original declaration scope even when parameter types are substituted.
	 * Low-level signature extraction and heritage comparison views can omit it.
	 * An absent property does not mean that the comment has no references.
	 *
	 * @defaultValue Omitted for unsupported declaration forms.
	 */
	readonly documentationContext?: SignatureDocumentationContext;
	/**
	 * The compiler-printed call-signature declaration, including generic parameters and its trailing semicolon.
	 *
	 * @remarks
	 * Contains no function name or body. Report rendering prefixes a function keyword and local name.
	 * This is printed independently from {@link SignatureFact.functionTypeText}; it is not a rewritten function type.
	 *
	 * @example
	 * A simple signature uses a colon before its return type and includes a trailing semicolon.
	 * Unlike `functionTypeText`, it does not use arrow-function type syntax.
	 *
	 * ```typescript
	 * // For a signature whose functionTypeText is "(value: string) => string":
	 * const callSignatureText = "(value: string): string;";
	 * const declaration = `export function convert${callSignatureText}`;
	 * // Produces: export function convert(value: string): string;
	 * ```
	 *
	 * @example
	 * Generic parameters precede the parameter list and retain their constraints and defaults.
	 *
	 * ```typescript
	 * const callSignatureText = "<Value extends string = string>(value: Value): Value;";
	 * const declaration = `declare function identity${callSignatureText}`;
	 * // Produces: declare function identity<Value extends string = string>(value: Value): Value;
	 * ```
	 */
	readonly callSignatureText: string;
	/**
	 * An opaque, provisional identifier derived from the owner and printed signature.
	 *
	 * @remarks
	 * Does not depend on overload order.
	 * Identical printed signatures for the same owner have the same identifier.
	 * Stability across compiler or analyzer versions is not guaranteed.
	 */
	readonly id: ApiItemId;
	/**
	 * The compiler-printed function type for this call signature.
	 *
	 * @remarks
	 * Uses function type syntax, with `=>` before the return type. Contains no function name,
	 * implementation body, or trailing declaration semicolon.
	 * Includes the signature's type parameters, parameter list, and return type.
	 * Represents one callable signature, not the containing declaration's full overload set.
	 *
	 * Printed independently from {@link SignatureFact.callSignatureText}, which uses call-signature
	 * declaration syntax. The analyzer uses this text with the owner identifier to derive {@link SignatureFact.id}.
	 * Formatting follows the compiler and is not guaranteed to remain stable across compiler versions.
	 * This is display text, not a structured type model. Do not parse it to resolve semantic references.
	 * Referenced types still require their original declaration context; the text is not necessarily self-contained.
	 *
	 * @example
	 * A simple function type uses an arrow rather than the colon used in a call-signature declaration.
	 *
	 * ```typescript
	 * const functionTypeText = "(value: string) => string";
	 * const callSignatureText = "(value: string): string;";
	 * ```
	 *
	 * @example
	 * A generic function type retains its type parameter constraint and default.
	 * A type alias can contain this syntax when all referenced types are in scope.
	 *
	 * ```typescript
	 * const functionTypeText = "<Value extends string = string>(value: Value) => Value";
	 * const declaration = `type Identity = ${functionTypeText};`;
	 * // Produces: type Identity = <Value extends string = string>(value: Value) => Value;
	 * ```
	 */
	readonly functionTypeText: string;
	/**
	 * The associated TSDoc comment, including delimiters, or `undefined` if absent.
	 *
	 * @remarks
	 * Preserves an explicit empty comment. Does not include declaration text or ordinary comments.
	 * If several TSDoc comments are attached, retains the closest one to the declaration.
	 * This is raw comment text, not parsed or resolved TSDoc. JSON serialization omits absent documentation.
	 */
	readonly documentation: string | undefined;
}

/**
 * A property or method as observed on the containing type.
 *
 * @remarks
 * Includes inherited members and compiler-resolved generic substitutions where supported.
 */
export interface MemberFact {
	/**
	 * Original reference lookup facts for a single property declaration, including callable properties.
	 * @defaultValue Omitted for methods, accessors, merged declarations, heritage comparison views, or unavailable extraction state.
	 * Methods retain lookup facts on their signatures instead.
	 */
	readonly documentationContext?: DocumentationReferenceContext;
	/**
	 * A provisional identifier for the member as observed on its containing declaration or heritage view.
	 *
	 * @remarks
	 * Combines the containing declaration or heritage-view identifier with the compiler-printed member name.
	 * Inherited members on different containing declarations have different identifiers,
	 * even when they share source declarations. The format is not a stable public contract.
	 */
	readonly id: ApiItemId;
	/**
	 * Effective call signatures in compiler order, including optional methods and callable properties.
	 *
	 * @remarks
	 * Each signature retains its own source comment and uses this member's identifier as its owner.
	 * Null and undefined are removed from the effective type before extracting call signatures.
	 * Property comments are not copied to function-type signatures. Non-callable members have no signatures.
	 * Effective callable signatures retain original-scope documentation lookup contexts when their declarations are inspectable.
	 * Property-owned comments are separate from these signatures; non-callable property contexts are on the member.
	 * Construct signatures and contexts on heritage comparison views are not extracted.
	 */
	readonly signatures: readonly SignatureFact[];
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
	// eslint-disable-next-line @rushstack/no-new-null -- The detached fact contract uses null to distinguish unresolved from false.
	readonly readonly: boolean | null;
	/**
	 * The source declarations associated with the effective member, in compiler order.
	 *
	 * @remarks
	 * Inherited members retain their original declarations and comments, not comments from the containing type.
	 * Overloads and merged declarations retain separate records. No comment is selected or combined.
	 * A local override without a comment remains undocumented in these raw facts.
	 * The array can be empty when the compiler provides no declarations.
	 */
	readonly declarations: readonly SourceDeclarationFact[];
}

/**
 * The name and declaration flags of one function parameter.
 *
 * @remarks
 * Used to check documentation compatibility without compiler objects.
 * Does not include the parameter's type.
 */
export interface FunctionParameterFact {
	/**
	 * The parameter identifier, omitted when the parameter uses object or array destructuring.
	 *
	 * @defaultValue Omitted for destructured parameters.
	 */
	readonly name?: string;
	/**
	 * Whether the declaration has a question token or an initializer for this parameter.
	 */
	readonly optional: boolean;
	/**
	 * Whether this is a rest parameter.
	 */
	readonly rest: boolean;
}

/**
 * The compiler lookup result for a documentation declaration reference.
 *
 * @remarks
 * Contains no compiler objects.
 * The result does not establish that the comment is valid or that the target is compatible.
 *
 * Narrow on `status` before accessing the target of a resolved lookup.
 */
export type DocumentationReferenceLookup =
	| ResolvedDocumentationReference
	| MissingDocumentationReference
	| UnsupportedDocumentationReference;

/**
 * Reference text shared by all documentation lookup outcomes.
 */
interface DocumentationReferenceLookupBase {
	/**
	 * The declaration reference printed by TSDoc, or an empty string when the request has no reference.
	 *
	 * @example
	 * An API link retains the reference name, not its display label or resolved target identifier.
	 * The same reference text is used for an explicit inheritance request.
	 *
	 * ```typescript
	 * // For either {@link base | Base function} or {@inheritDoc base}:
	 * const reference = "base";
	 * ```
	 *
	 * @example
	 * Unsupported reference syntax is still retained for later diagnostics.
	 * Package-qualified references and selectors in API links are not supported by the current lookup.
	 * Numeric selectors in explicit inheritance requests are supported and retain the selected reference text.
	 *
	 * ```typescript
	 * // For {@link example#base}:
	 * const qualifiedReference = "example#base";
	 * // For {@link (base:1)}:
	 * const overloadReference = "(base:1)";
	 * ```
	 *
	 * @example
	 * An inheritance request without a target produces an empty reference.
	 * This does not mean that a supplied name failed lookup; a missing target retains its name.
	 *
	 * ```typescript
	 * // For {@inheritDoc}:
	 * const implicitReference = "";
	 * // For {@link missing}, when no declaration named "missing" exists:
	 * const unresolvedReference = "missing";
	 * ```
	 */
	// TODO (Stage 2 reference syntax): Update qualified-reference and API-link selector examples when
	// lookup supports them. Preserve the printed reference text even when the target is missing.
	// TODO (Stage 2 automatic inheritance): Revisit the target-less inheritance example when implicit
	// target selection is defined. Distinguish supported requests from malformed comments;
	// an empty reference alone must not authorize automatic inheritance.
	readonly reference: string;
}

/**
 * A documentation reference whose declaration was found by compiler lookup.
 *
 * @remarks
 * Resolution does not establish target compatibility or reference-policy compliance.
 */
export interface ResolvedDocumentationReference extends DocumentationReferenceLookupBase {
	/**
	 * Identifies a lookup that found a declaration.
	 */
	readonly status: "resolved";
	/**
	 * The resolved declaration identifier.
	 *
	 * @remarks
	 * The identifier refers to a declaration, not an individual overload.
	 * Reference validation checks the target's declaration form, package, and applicable policies separately.
	 */
	readonly target: ApiItemId;
}

/**
 * A supported documentation reference for which compiler lookup found no declaration.
 */
export interface MissingDocumentationReference extends DocumentationReferenceLookupBase {
	/**
	 * Identifies a supported reference with no resolved target.
	 */
	readonly status: "not-found";
}

/**
 * A documentation reference whose syntax is not supported by compiler lookup.
 *
 * @remarks
 * Includes target-less inheritance requests. This outcome does not indicate whether a target exists.
 */
export interface UnsupportedDocumentationReference extends DocumentationReferenceLookupBase {
	/**
	 * Identifies a reference for which lookup is unsupported.
	 */
	readonly status: "unsupported";
}

/**
 * Original-scope reference facts for a declaration or effective member comment.
 *
 * @remarks
 * These facts contain no compiler objects.
 * Optional properties are omitted when their values are absent, including during JSON serialization.
 */
export interface DocumentationReferenceContext {
	/**
	 * Compiler-resolved declaration references in this API's type syntax.
	 * @defaultValue Omitted when reference extraction was not supplied, as in synthetic internal facts.
	 * An empty array means extraction supplied no supported reference occurrences.
	 */
	readonly typeReferences?: readonly DeclarationReferenceFact[];
	/**
	 * The original declaration location, independent of the receiving type or re-exporting entrypoint.
	 */
	readonly origin: Origin;
	/**
	 * API link lookup results in TSDoc tree traversal order, including repeated references.
	 *
	 * @remarks
	 * Excludes URL links. Empty when the parser found no API links.
	 * Results retain unsupported and missing targets but do not establish valid TSDoc or release-policy compliance.
	 * Lookup uses the original declaration scope, including for links inside documentation blocks.
	 */
	readonly links: readonly DocumentationReferenceLookup[];
	/**
	 * The lookup result for an explicit documentation inheritance request.
	 *
	 * @remarks
	 * Omitted when the parser found no inheritance request.
	 * This result does not indicate whether the full comment passed TSDoc validation.
	 * @defaultValue Omitted when the original comment contains no explicit inheritance request.
	 */
	readonly inheritance?: DocumentationReferenceLookup;
}

/**
 * A declaration reference with original source spelling and compiler-resolved identity.
 */
export interface DeclarationReferenceFact {
	/**
	 * The original referenced type or value name, including aliases.
	 */
	readonly text: string;
	/**
	 * The target declaration identity, independent of its exported alias.
	 */
	readonly target: ApiItemId;
	/**
	 * The location of the reference in the original declaration input.
	 */
	readonly origin: Origin;
}

/**
 * Original reference lookup and parameter facts for one callable signature.
 */
export interface SignatureDocumentationContext extends DocumentationReferenceContext {
	/**
	 * Parameter names and optional and rest parameter flags, in declaration order.
	 */
	readonly parameters: readonly FunctionParameterFact[];
	/**
	 * Type-parameter names in declaration order, without constraints or defaults.
	 */
	readonly typeParameters: readonly string[];
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
	 * The closest attached TSDoc comment, including delimiters, or `undefined` if absent.
	 *
	 * @remarks
	 * Preserves empty and tag-only comments. Excludes ordinary comments and does not inherit content.
	 * Records each declaration's own comment, including separate overload and merged-declaration comments.
	 * Does not classify comments or choose precedence between merged declarations.
	 * An unavailable declaration node supplies no comment. JSON serialization omits absent documentation.
	 */
	readonly documentation: string | undefined;
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
 * A direct heritage relationship with members instantiated in the receiving declaration's context.
 */
export interface HeritageFact {
	/**
	 * Confident non-overloaded documentation matches from receiving members to this view's members.
	 *
	 * @remarks
	 * These pairs establish compatibility, not source precedence or permission to copy a comment.
	 * Local comments suppress automatic inheritance. Multiple distinct sources must not be guessed.
	 * Both identifiers refer to member facts retained in the same analysis result.
	 */
	readonly documentationMatches: readonly {
		readonly source: ApiItemId;
		readonly target: ApiItemId;
	}[];
	/**
	 * Whether the declaration extends a base or implements a contract.
	 */
	readonly kind: "extends" | "implements";
	/**
	 * The original target declaration identifier, retained in the analysis result.
	 */
	readonly target: ApiItemId;
	/**
	 * Effective target members after applying the receiving declaration's type arguments.
	 *
	 * @remarks
	 * Member identifiers are scoped to this heritage view. Original source declarations remain unchanged.
	 * View identities use the receiver, relationship kind, target identifier, and compiler-printed target type.
	 * Printed type text is used only for provisional identity, not compatibility checks.
	 */
	readonly members: readonly MemberFact[];
}

/**
 * Detached syntax and independently documented members of a class, interface, or enum.
 *
 * @remarks
 * The declaration name is stored on the owning declaration so renderers can preserve export aliases.
 * Effective instance members remain on {@link DeclarationFact.members}.
 */
export interface DeclarationContainerFact {
	/**
	 * The declaration form represented by this container.
	 */
	readonly kind: "class" | "interface" | "enum";
	/**
	 * Keywords and modifiers before the declaration name, including trailing whitespace.
	 */
	readonly prefix: string;
	/**
	 * Type parameters and heritage clauses after the name, excluding the member body.
	 */
	readonly suffix: string;
	/**
	 * Whether the container has no implementation bodies or static blocks that prevent review rendering.
	 * This flag does not establish support for every member's documentation or reference semantics.
	 */
	readonly supported: boolean;
	/**
	 * Independently documented constructors, static members, accessors, or enum members in source order.
	 * These records supplement rather than replace effective instance members.
	 */
	readonly declaredMembers: readonly DeclaredMemberFact[];
}

/**
 * Compiler-derived syntax around the name of an atomic type alias or variable declaration.
 */
export interface DeclarationStatementFact {
	/**
	 * Declaration keyword and trailing whitespace before the name.
	 */
	readonly prefix: string;
	/**
	 * Type parameters, type or initializer, and terminating semicolon after the name.
	 */
	readonly suffix: string;
}

/**
 * Provisional semantic facts for a resolved declaration symbol.
 *
 * @remarks
 * This is not a complete serialized documentation model or a stable artifact schema.
 * A symbol can have several source declarations through declaration merging.
 */
// TODO (Stage 2 documentation resolution): Extend signature documentation contexts to general
// declaration targets and member references. Preserve local-comment precedence.
// These facts must support resolution without compiler handles or parsing printed type strings.
export interface DeclarationFact {
	/**
	 * Compiler-derived syntax around the name of an atomic type alias or variable declaration.
	 *
	 * @defaultValue Omitted for other declaration forms or when the source node is unavailable.
	 */
	readonly statement?: DeclarationStatementFact;
	/**
	 * Detached container syntax assembled from compiler nodes, without source comments or member bodies.
	 *
	 * @defaultValue Omitted for unsupported or merged container forms, other declarations, or unavailable source nodes.
	 */
	readonly container?: DeclarationContainerFact;
	/**
	 * Original lookup context for a non-callable declaration comment.
	 * @defaultValue Omitted for merged, unavailable, or unsupported declaration-level comments.
	 * Callable function and method contexts are retained on signatures instead.
	 */
	readonly documentationContext?: DocumentationReferenceContext;
	/**
	 * Direct instantiated heritage views in source declaration and clause order.
	 *
	 * @remarks
	 * Empty for other declaration forms. Retains direct target members, not recursive instantiated ancestry.
	 */
	// TODO (Stage 2 documentation resolution): Retain recursive instantiated ancestry where direct
	// matches and original-member source chains are insufficient. Never infer overload compatibility.
	readonly heritage: readonly HeritageFact[];
	/**
	 * Identifiers of direct base declarations for a class or interface, in compiler order.
	 *
	 * @remarks
	 * Targets are retained in the same analysis result, including bases that are not exported.
	 * Shared ancestors are collected once. Each target describes its original declaration,
	 * not a generic instantiation as observed from this declaration.
	 * Excludes implements clauses and is empty for other declaration forms.
	 * These links do not establish member overrides or compatible overload matches.
	 */
	readonly baseDeclarations: readonly ApiItemId[];
	/**
	 * Declaration identifiers named by local class implements clauses, in source declaration and clause order.
	 *
	 * @remarks
	 * Targets are retained in the same analysis result without adding exports.
	 * Import aliases are resolved, but type alias declarations remain targets rather than being expanded.
	 * Targets describe original declarations, not generic instantiations.
	 * Excludes clauses inherited through a base class and is empty for other declaration forms.
	 * These links neither add members nor copy documentation to the implementing class.
	 */
	readonly implementedDeclarations: readonly ApiItemId[];
	/**
	 * An opaque identifier used by export targets within the analysis result.
	 *
	 * @remarks
	 * Derived from package names, package-relative files, and symbol names.
	 * It does not include package versions and is not a globally unique or version-stable identifier.
	 */
	readonly id: ApiItemId;
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
 * An independently documented constructor, static member, accessor, or signature declaration.
 */
export interface DeclaredMemberFact extends SourceDeclarationFact {
	/**
	 * Identity scoped to the owner and compiler-printed declaration.
	 */
	readonly id: ApiItemId;
	/**
	 * Compiler-printed declaration without source trivia.
	 */
	readonly printed: string;
	/**
	 * Reference lookup in the original member declaration scope.
	 */
	readonly documentationContext: DocumentationReferenceContext;
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
	 * Hashes of package-owned compiler inputs used to validate dependency model freshness.
	 * @defaultValue Omitted on synthetic internal facts without captured inputs; those facts cannot generate dependency models.
	 */
	readonly inputFiles?: readonly InputFileFact[];
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
	 * Declaration facts referenced by exports, supported documentation lookups, or heritage links, sorted by identifier.
	 *
	 * @remarks
	 * Shared export targets use the same declaration fact.
	 * Documentation targets can be retained without being exported by a configured surface.
	 * Base and implements targets can also be retained without being exported.
	 * This collection is not a complete graph of every type referenced by those declarations.
	 */
	readonly declarations: readonly DeclarationFact[];
}

/**
 * An analyzed file's package-relative name and SHA-256 digest of its UTF-8 text.
 */
export interface InputFileFact {
	/**
	 * Package-relative file path with forward slash separators.
	 */
	readonly file: string;
	/**
	 * Hexadecimal SHA-256 digest of the analyzed file's UTF-8 text, retained before compiler disposal.
	 *
	 * @remarks
	 * Suite loading hashes the installed file again and rejects the model if the values differ.
	 * This detects stale recorded inputs; it is not an authenticity signature or a semantic API hash.
	 * Comment and whitespace changes also change the digest. No incremental cache uses it.
	 */
	readonly sha256: string;
}

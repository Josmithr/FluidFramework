import type { AnalyzerDiagnostic } from "./result.js";
import type { CodeExcerpt } from "./excerpt.js";

/**
 * A compiler-resolved import binding used by a displayed declaration fragment.
 */
export interface ImportFact {
	/**
	 * Collected declaration identity for local or suite-owned targets.
	 * @defaultValue Omitted for targets outside the analyzed suite.
	 */
	readonly target?: ApiItemId;

	/**
	 * Import syntax for this binding.
	 */
	readonly kind: "named" | "default" | "namespace";

	/**
	 * Module specifier from the original import.
	 */
	readonly moduleSpecifier: string;

	/**
	 * Local identifier used by the displayed fragment.
	 */
	readonly name: string;

	/**
	 * Exported name for a named import.
	 * @defaultValue Omitted for default and namespace imports.
	 */
	readonly importedName?: string;

	/**
	 * Whether the original import exposes only a type binding.
	 */
	readonly typeOnly: boolean;
}

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
	 *
	 * @remarks
	 * Resolve this path within the package named by {@link Origin.packageName}, not necessarily the package being analyzed.
	 * It is not relative to the working directory or the configured entrypoint.
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
	 *
	 * @remarks
	 * This is the name exposed by this binding, including `default` or names that require quoted export syntax.
	 * Use {@link ExportFact.target} to associate aliases with their declaration rather than comparing names.
	 */
	readonly name: string;

	/**
	 * The {@link DeclarationFact.id} of the resolved export target.
	 *
	 * @remarks
	 * Aliases that expose the same declaration share this target identifier.
	 * The same target can be exposed by multiple configured surfaces without duplicating its declaration fact.
	 *
	 * @example Several bindings for one declaration
	 * All three bindings target the same `Store` declaration, but retain their separate exported names.
	 * Only the `StoreType` binding has `typeOnly: true`.
	 *
	 * ```typescript
	 * declare class Store {}
	 * export { Store, Store as SharedStore };
	 * // This alias exposes the type but not the constructor value.
	 * export type { Store as StoreType };
	 * ```
	 */
	readonly target: ApiItemId;

	/**
	 * Whether the binding is exposed only through type-only imports or exports.
	 *
	 * @remarks
	 * Describes the export path, not whether the target is a type declaration.
	 * An interface exported without type-only syntax does not imply `true`.
	 * A false value does not guarantee that the target has a runtime value.
	 */
	readonly typeOnly: boolean;
}

/**
 * Two compiler-printed syntax forms of the same callable signature view.
 */
export interface SignatureText {
	/**
	 * Imports referenced by these displayed signature forms.
	 * @defaultValue Omitted when no imported bindings are needed.
	 */
	readonly imports?: readonly ImportFact[];

	/**
	 * Structured call text with producer-resolved reference tokens.
	 * @defaultValue Omitted on synthetic facts that did not capture excerpts.
	 */
	readonly callSignatureExcerpt?: CodeExcerpt;

	/**
	 * Structured arrow-function text with producer-resolved reference tokens.
	 * @defaultValue Omitted on synthetic facts that did not capture excerpts.
	 */
	readonly functionTypeExcerpt?: CodeExcerpt;

	/**
	 * A call-signature declaration without a name or body, including its terminating semicolon.
	 */
	readonly callSignatureText: string;

	/**
	 * A function type using arrow syntax, without a terminating semicolon.
	 */
	readonly functionTypeText: string;
}

/**
 * A callable signature detached from the compiler snapshot.
 */
export interface SignatureFact extends SignatureText {
	/**
	 * The original declaration for this particular signature, before generic substitution or type reduction.
	 *
	 * @remarks
	 * Retains exact input text, including trivia, and its package-relative location.
	 * When analysis reads declarations, this is the declaration input, not the pre-build implementation source.
	 * Inherited effective signatures can share this source while having different types and identities.
	 *
	 * @defaultValue Omitted when the compiler supplies no inspectable source declaration, including synthetic test facts.
	 */
	readonly source?: SourceDeclarationFact;

	/**
	 * A compiler-resolved alternative to the effective signature text.
	 *
	 * @remarks
	 * Reduces ordinary parameter and return types in the original lookup scope.
	 * Named primitive aliases can collapse, and optional parameters can gain an explicit undefined union.
	 * Preserves compiler-produced rest annotations, generic headers, and predicate or assertion returns.
	 * Generic expressions can remain symbolic. This is not a promise to fully expand every type.
	 */
	readonly reduced: SignatureText;

	/**
	 * An alias-preserving signature with selected outer computed type expressions reduced.
	 *
	 * @remarks
	 * Reduces indexed accesses, type queries, conditional types, type operators, and compiler-library utility aliases at ordinary parameter or return roots.
	 * Preserves application-defined named references, unions, optional parameters, rest parameters, generic headers, and predicates.
	 * Reduction is not recursive inside preserved syntax. Reports use this view, but it does not determine identity.
	 *
	 * @example Preserve a named type while removing helper syntax
	 * A signature using `Label` keeps that name, while a resolved utility expression can become `string`.
	 *
	 * ```typescript
	 * const effective = "(value: Parameters<typeof helper>[0]): Label;";
	 * const normalized = "(value: string): Label;";
	 * ```
	 */
	readonly normalized: SignatureText;

	/**
	 * Compiler lookup and parameter facts for function or method documentation.
	 *
	 * @remarks
	 * The analyzer provides this property for collected functions and methods and inspectable effective callable signatures.
	 * Effective signatures retain their original declaration scope even when parameter types are substituted.
	 * Low-level signature extraction and heritage comparison views can omit it.
	 * An absent property does not mean that the comment has no references.
	 *
	 * @defaultValue Omitted when extraction did not supply an inspectable original callable context, including low-level extraction and heritage comparison views.
	 */
	readonly documentationContext?: SignatureDocumentationContext;

	/**
	 * The compiler-printed call-signature declaration, including generic parameters and its trailing semicolon.
	 *
	 * @remarks
	 * Contains no function name or body. Retains the compiler's effective, scope-aware syntax before selective normalization.
	 * Report rendering uses {@link SignatureFact.normalized} instead.
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
	 * Use the signature array's order for numeric overload selectors; this identifier does not encode an overload index.
	 * Reduced and normalized text do not contribute to this identifier, so report presentation does not change it.
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
	 * Imports used by the effective member name and type.
	 * @defaultValue Omitted when no import bindings are needed.
	 */
	readonly imports?: readonly ImportFact[];

	/**
	 * Compiler-printed effective type with resolved display references.
	 * @defaultValue Omitted on synthetic facts without compiler excerpt capture.
	 */
	readonly typeExcerpt?: CodeExcerpt;

	/**
	 * Compiler member identifier without TypeScript quoting or computed-name punctuation.
	 * @defaultValue Omitted by synthetic callers; use the printed name.
	 */
	readonly referenceName?: string;

	/**
	 * Identity of the unique symbol used as the member name.
	 * @defaultValue Omitted for ordinary named members.
	 */
	readonly symbolId?: ApiItemId;

	/**
	 * Original reference lookup facts for a property.
	 *
	 * @remarks
	 * Includes callable properties and repeated declarations with combined documentation.
	 * Retained references use the scope of the part that supplied their content.
	 * Methods retain lookup facts on their signatures instead.
	 *
	 * @defaultValue Omitted for methods, accessors, unsupported merges, heritage comparison views, or unavailable extraction state.
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
	 *
	 * @remarks
	 * Can contain quoted or computed property syntax, such as `[Symbol.iterator]`.
	 * Do not assume that the value is a plain identifier suitable for dot-property access.
	 */
	readonly name: string;

	/**
	 * The effective member type rendered by the compiler in its declaration context.
	 *
	 * @remarks
	 * This is display text, not a structured type model or a standalone declaration.
	 * Reflects the containing type's generic substitutions, while {@link MemberFact.declarations} retains the original source syntax.
	 * Do not parse this string to resolve referenced declarations or prove type compatibility.
	 */
	readonly type: string;

	/**
	 * Whether the compiler marks the effective member as optional.
	 *
	 * @remarks
	 * Describes whether the member can be omitted, not whether its type includes `undefined`.
	 *
	 * @example Optional versus undefined-valued properties
	 * The `optional` member has this flag set to `true`.
	 * The `required` member has it set to `false`, even though its value can be `undefined`.
	 *
	 * ```typescript
	 * interface Settings {
	 *     optional?: string;
	 *     required: string | undefined;
	 * }
	 * ```
	 */
	readonly optional: boolean;

	/**
	 * The resolved readonly modifier state.
	 *
	 * @remarks
	 * `true` indicates a readonly modifier; `false` indicates no readonly modifier.
	 * `null` means that the analyzer could not resolve the modifier state.
	 * Do not treat `null` as evidence that the member is writable.
	 * Mapped types can change this flag without changing the original source declaration.
	 * The flag does not imply deep or runtime immutability of the member's value.
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
	 * Several effective member records can share these source locations while having different identifiers or substituted types.
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
	 * @remarks
	 * An omitted name still represents one parameter in the containing parameter array.
	 * Bound names inside a destructuring pattern are not substituted for the parameter name.
	 *
	 * @defaultValue Omitted for destructured parameters.
	 */
	readonly name?: string;

	/**
	 * Whether the declaration has a question token or an initializer for this parameter.
	 *
	 * @remarks
	 * A default such as `value = "default"` sets this flag, even without a question token.
	 * A type such as `string | undefined` alone does not set it.
	 */
	readonly optional: boolean;

	/**
	 * Whether this is a rest parameter.
	 *
	 * @remarks
	 * Records the `...` declaration syntax, not whether the parameter has an array type.
	 * A rest parameter can have `optional: false`; the two flags describe separate syntax features.
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
	 * The source location of an occurrence retained from a merged comment.
	 * @defaultValue Omitted; use the enclosing documentation context's origin.
	 */
	readonly origin?: Origin;

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
	 * Qualified references and numeric selectors retain their original reference text.
	 * Self-package qualified references use configured exports rather than lexical lookup.
	 * Foreign package-qualified references are resolved through selected dependency models during binding.
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
	// TODO (Future implicit inheritance): Revisit the target-less inheritance example when implicit
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
	 * For a member path, identifies that member's collected declaration rather than its effective {@link MemberFact.id}.
	 * Numeric selectors for links and inheritance are applied later; finding this declaration does not validate the requested index.
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
	 *
	 * @remarks
	 * Lookup failed in the original declaration scope. This does not prove that the name is absent from every package or scope.
	 */
	readonly status: "not-found";
}

/**
 * A documentation reference that cannot be evaluated by the supported compiler lookup rules.
 *
 * @remarks
 * Includes target-less inheritance requests. This outcome does not indicate whether a target exists.
 */
export interface UnsupportedDocumentationReference extends DocumentationReferenceLookupBase {
	/**
	 * Identifies a reference for which lookup is unsupported.
	 *
	 * @remarks
	 * Includes unsupported syntax and unqualified static/instance name collisions.
	 * Unlike `not-found`, this outcome does not establish that a supported search found no target.
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
	 * Labels declared on this original comment, not inherited from its documentation targets.
	 * @defaultValue Omitted when the comment declares no labels.
	 */
	readonly labels?: readonly string[];

	/**
	 * Distinct original comments that must resolve inheritance before their content is merged.
	 * Entries retain compiler order and original lookup scope; equal comments keep the first occurrence.
	 * @defaultValue Omitted when merged documentation has no inheritance requests.
	 */
	readonly contributions?: readonly DocumentationReferenceContext[];

	/**
	 * Original type-parameter names in declaration order for supported inheritance shapes.
	 *
	 * @remarks
	 * Class, interface, and type-alias contexts retain these names without parsing printed headers.
	 * Signature contexts require this array separately from ordinary parameter facts.
	 * @defaultValue Omitted for declaration forms without retained type-parameter facts.
	 * An empty array means that a supported declaration has no type parameters.
	 */
	readonly typeParameters?: readonly string[];

	/**
	 * Combined local documentation for a supported merged declaration.
	 * Original comments remain on their source declaration records.
	 * @defaultValue Omitted; use the original source comment, including its absence.
	 */
	readonly documentation?: string;

	/**
	 * The original class, interface, enum, or namespace that declares this API.
	 *
	 * @remarks
	 * Used for release-level inheritance and container validation, not descriptive documentation inheritance.
	 * Inherited member views retain the declaring container rather than the receiving type.
	 * Source-file modules are entrypoints, not atomic containers.
	 *
	 * @defaultValue Omitted for APIs without a declaring container.
	 */
	readonly container?: ApiItemId;

	/**
	 * Compiler-resolved declaration references in this API's type syntax.
	 *
	 * @remarks
	 * An empty array means extraction supplied no supported reference occurrences.
	 * Records occurrences rather than a set of unique targets, so repeated references are retained.
	 * Excludes type parameters and declarations outside the selected suite, including compiler libraries.
	 * Effective compiler-type traversal adds named targets introduced by substitution or inference.
	 * Named declarations and outside-suite boundaries are not recursively expanded into this occurrence list.
	 * Inherited member views retain these facts for artifacts, not for repeated reference-policy validation.
	 *
	 * @defaultValue Omitted when reference extraction was not supplied, as in synthetic internal facts.
	 */
	readonly typeReferences?: readonly DeclarationReferenceFact[];

	/**
	 * The original declaration location, independent of the receiving type or re-exporting entrypoint.
	 *
	 * @remarks
	 * Lookup uses the scope where the comment was written, even when an effective member belongs to another type.
	 * For supported merged comments, this is the first source location.
	 * Individual documentation and type-reference occurrences retain their own origins.
	 */
	readonly origin: Origin;

	/**
	 * API link lookup results in TSDoc tree traversal order, including repeated references.
	 *
	 * @remarks
	 * Excludes URL links. Empty when the parser found no API links.
	 * Results retain unsupported and missing targets but do not establish valid TSDoc or release-policy compliance.
	 * Lookup uses the original declaration scope, including for links inside documentation blocks.
	 * Do not sort or deduplicate this array: each result corresponds to an occurrence in the parsed comment.
	 */
	readonly links: readonly DocumentationReferenceLookup[];

	/**
	 * The lookup result for an explicit documentation inheritance request.
	 *
	 * @remarks
	 * Omitted when the parser found no inheritance request.
	 * This result does not indicate whether the full comment passed TSDoc validation.
	 * A target-less explicit request still produces an unsupported lookup record with empty reference text.
	 * Absence of this property does not decide whether separate automatic-inheritance rules can supply documentation.
	 *
	 * @defaultValue Omitted when the parser found no explicit inheritance request.
	 */
	readonly inheritance?: DocumentationReferenceLookup;
}

/**
 * A type-syntax reference with compiler-printed text and a resolved declaration identity.
 */
export interface DeclarationReferenceFact {
	/**
	 * The compiler-printed reference name or import-type expression, preserving aliases.
	 *
	 * @remarks
	 * Ordinary type references retain the name, not the enclosing type-argument list.
	 * Import types retain the full expression, such as `import("library").Item<string>`, to identify the module in diagnostics.
	 * Formatting can differ from the source text. Use {@link DeclarationReferenceFact.target} for identity comparisons.
	 */
	readonly text: string;

	/**
	 * The target declaration identity, independent of its exported alias.
	 */
	readonly target: ApiItemId;

	/**
	 * The location of the reference in the original declaration input.
	 *
	 * @remarks
	 * Points to the referring name, not the target's declaration or the effective member's receiving type.
	 * Different occurrences can share a target identifier while retaining different source locations.
	 */
	readonly origin: Origin;
}

/**
 * Original reference lookup and parameter facts for one callable signature.
 */
export interface SignatureDocumentationContext extends DocumentationReferenceContext {
	/**
	 * Parameter names and optional and rest parameter flags, in declaration order.
	 *
	 * @remarks
	 * Describes the original signature's parameter shape for documentation compatibility, not its effective parameter types.
	 * Empty for a callable with no parameters. Destructured parameters remain in the array with an omitted name.
	 */
	readonly parameters: readonly FunctionParameterFact[];

	/**
	 * Type-parameter names in declaration order, without constraints or defaults.
	 *
	 * @remarks
	 * Used to associate inherited parameter documentation by name and position.
	 * Equal names alone do not establish type compatibility. Empty when the signature declares no type parameters.
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
	 * Imports used by separately rendered declared-member syntax.
	 * @defaultValue Omitted when this source has no captured import bindings.
	 */
	readonly imports?: readonly ImportFact[];

	/**
	 * Original source text with compiler-resolved reference tokens.
	 * @defaultValue Omitted for synthetic sources without compiler capture.
	 */
	readonly excerpt?: CodeExcerpt;

	/**
	 * The closest attached TSDoc comment, including delimiters, or `undefined` if absent.
	 *
	 * @remarks
	 * Preserves empty and tag-only comments. Excludes ordinary comments and does not inherit content.
	 * Package documentation is retained on {@link AnalysisFacts.packageDocumentation}, not on the following API declaration.
	 * Records each declaration's own comment, including separate overload and merged-declaration comments.
	 * Does not classify comments or choose precedence between merged declarations.
	 * An unavailable declaration node supplies no comment. JSON serialization omits absent documentation.
	 */
	readonly documentation: string | undefined;

	/**
	 * The compiler syntax-kind name for this declaration.
	 *
	 * @remarks
	 * Describes this individual source node, such as `InterfaceDeclaration` or `MethodSignature`.
	 * It is not a release classification or the kind of an effective substituted type.
	 */
	readonly kind: string;

	/**
	 * The full declaration source text, including leading whitespace and comments.
	 *
	 * @remarks
	 * An empty string means that the declaration node was unavailable.
	 * Preserves authored syntax rather than effective generic substitutions.
	 * The fragment can depend on surrounding declarations and imports; it is not necessarily valid as a standalone file.
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
	 * An empty array means that no compatible pair was established, not that all possible pairs are incompatible.
	 */
	readonly documentationMatches: readonly {
		/**
		 * The receiving member's identifier from the owning declaration's effective member list.
		 */
		readonly source: ApiItemId;

		/**
		 * The candidate documentation source member's identifier from {@link HeritageFact.members}.
		 */
		readonly target: ApiItemId;
	}[];

	/**
	 * Whether the declaration extends a base or implements a contract.
	 */
	readonly kind: "extends" | "implements";

	/**
	 * The original target declaration identifier, retained in the analysis result.
	 *
	 * @remarks
	 * Identifies the base or contract declaration before type arguments are applied.
	 * Use {@link HeritageFact.members} for its member view in the receiving declaration's context.
	 */
	readonly target: ApiItemId;

	/**
	 * Effective target members after applying the receiving declaration's type arguments.
	 *
	 * @remarks
	 * Member identifiers are scoped to this heritage view. Original source declarations remain unchanged.
	 * View identities use the receiver, relationship kind, target identifier, and compiler-printed target type.
	 * Printed type text is used only for provisional identity, not compatibility checks.
	 *
	 * @example Instantiated base members
	 * In the heritage view for `StringBox`, the `value` member has type `string`.
	 * Its original source declaration still contains `value: Value`, and the heritage target identifies `Box`.
	 *
	 * ```typescript
	 * interface Box<Value> {
	 *     value: Value;
	 * }
	 * interface StringBox extends Box<string> {}
	 * ```
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
	 * Imports used by type parameters and heritage clauses.
	 * @defaultValue Omitted when the headers need no import bindings.
	 */
	readonly imports?: readonly ImportFact[];

	/**
	 * Type parameters and heritage for an interface merged with a callable or constructable class instance.
	 * Call and construct signatures in declaredMembers belong in this interface, not the class body.
	 * @defaultValue Omitted when no separate interface declaration is needed.
	 */
	readonly interfaceSuffix?: string;

	/**
	 * The declaration form represented by this container.
	 */
	readonly kind: "class" | "interface" | "enum";

	/**
	 * Keywords and modifiers before the declaration name, including trailing whitespace.
	 *
	 * @remarks
	 * For example, `interface ` or `abstract class `.
	 * Does not include an `export` or `declare` prefix; the renderer supplies the export form and name.
	 */
	readonly prefix: string;

	/**
	 * Type parameters and heritage clauses after the name, excluding the member body.
	 *
	 * @remarks
	 * Can contain syntax such as `<Value> extends Base<Value>`, but no opening or closing member braces.
	 * Empty when the header has no type parameters or heritage clauses, including enum headers.
	 */
	readonly suffix: string;

	/**
	 * Whether the container has no implementation bodies or static blocks that prevent review rendering.
	 *
	 * @remarks
	 * This flag does not establish support for every member's documentation or reference semantics.
	 * A true value is a syntax check, not a promise that report generation will succeed.
	 */
	readonly supported: boolean;

	/**
	 * Member declarations that need separate syntax or documentation records, in source order.
	 *
	 * @remarks
	 * Includes constructors, static members, accessors, enum members, non-public members, and call, construct, or index signatures.
	 * These records supplement rather than replace effective instance members.
	 * Some also occur in {@link DeclarationFact.members}; consumers must avoid rendering both representations of the same source declaration.
	 */
	readonly declaredMembers: readonly DeclaredMemberFact[];
}

/**
 * Compiler-derived syntax around the name of an atomic type alias or variable declaration.
 */
export interface DeclarationStatementFact {
	/**
	 * Imports used by the declaration's displayed type or initializer.
	 * @defaultValue Omitted when no import bindings are needed.
	 */
	readonly imports?: readonly ImportFact[];

	/**
	 * Declaration keyword and trailing whitespace before the name.
	 *
	 * @remarks
	 * Contains `type `, `const `, `let `, or `var `, without an export modifier or declaration name.
	 */
	readonly prefix: string;

	/**
	 * Type parameters, type or initializer, and terminating semicolon after the name.
	 *
	 * @remarks
	 * The name is separate so a renderer can preserve exported aliases without rewriting the type syntax.
	 *
	 * @example Supplying a declaration name
	 * Combine the preserved fragments with a chosen name and export modifier to form review text.
	 *
	 * ```typescript
	 * const prefix = "type ";
	 * const suffix = "<Value> = readonly Value[];";
	 * const declaration = `export ${prefix}Items${suffix}`;
	 * // Produces: export type Items<Value> = readonly Value[];
	 * ```
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
export interface DeclarationFact {
	/**
	 * Unique symbol key when this declaration is a collected computed member.
	 * @defaultValue Omitted for declarations with ordinary names.
	 */
	readonly symbolId?: ApiItemId;

	/**
	 * Compiler-derived syntax around the name of an atomic type alias or variable declaration.
	 *
	 * @defaultValue Omitted for other declaration forms or when the source node is unavailable.
	 */
	readonly statement?: DeclarationStatementFact;

	/**
	 * Detached container syntax assembled from compiler nodes, without source comments or member bodies.
	 *
	 * @remarks
	 * Supported merged interfaces use one common header.
	 * Their original source records remain on {@link DeclarationFact.declarations}.
	 * Presence of this record does not guarantee rendering support; inspect its syntax flag and the completed member documentation.
	 *
	 * @defaultValue Omitted for unsupported merges, other declaration forms, or unavailable source nodes.
	 */
	readonly container?: DeclarationContainerFact;

	/**
	 * Original lookup context for a declaration-level comment.
	 *
	 * @remarks
	 * Supported merged interface, property, and named namespace comments combine distinct content in compiler declaration order.
	 * Identical contributions retain their first occurrence and its lookup results; all type-reference occurrences remain retained.
	 * Callable function and method contexts are retained on signatures instead.
	 *
	 * @defaultValue Omitted for unsupported merges, unavailable source nodes, or unsupported declaration-level comments.
	 */
	readonly documentationContext?: DocumentationReferenceContext;

	/**
	 * Direct instantiated heritage views in source declaration and clause order.
	 *
	 * @remarks
	 * Empty for other declaration forms.
	 * Each direct target's member view can include members inherited by that target.
	 * This array does not contain a separately instantiated view for every ancestor.
	 */
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
	 *
	 * @remarks
	 * This is not necessarily a name exported by an entrypoint.
	 * Exported aliases retain their names on {@link ExportFact.name} while referring to this declaration's identifier.
	 */
	readonly name: string;

	/**
	 * The source declarations associated with the symbol, including their locations and text.
	 *
	 * @remarks
	 * Merged declarations and overloads can contribute multiple records in compiler order.
	 * The order does not establish documentation precedence or combine the comments into one source.
	 * Use the supported documentation context rather than assuming the first comment is authoritative.
	 */
	readonly declarations: readonly SourceDeclarationFact[];

	/**
	 * The declaration's type rendered by the compiler.
	 *
	 * @remarks
	 * An empty string means that no type was extracted, including for source-file modules.
	 * This text is not a structured type model or a standalone declaration.
	 * Describes the declaration's own type; instantiated heritage member views are retained separately.
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
	 *
	 * @example A partial union view
	 * This union has a partial member view because the analyzer does not expand union members.
	 * An empty member array does not mean that either branch lacks properties.
	 *
	 * ```typescript
	 * type Choice = { text: string } | { count: number };
	 * ```
	 */
	readonly memberView: "complete" | "partial";

	/**
	 * Diagnostics that describe incomplete member expansion and how consumers should handle it.
	 *
	 * @remarks
	 * Empty when no member-expansion limitation was detected.
	 * These describe extraction limits, not necessarily invalid input or a failed analysis.
	 * Callers must decide whether their requested output can preserve the original declaration or must reject the partial view.
	 */
	readonly limitations: readonly AnalyzerDiagnostic[];

	/**
	 * Effective properties and methods, sorted by member name.
	 *
	 * @remarks
	 * Currently extracted only for object and intersection types.
	 * An empty array does not prove that the original type has no members.
	 * Includes inherited properties and methods with supported generic substitutions; it is not just the locally declared member list.
	 * Check {@link DeclarationFact.memberView} before treating the array as complete.
	 * Module and namespace bindings are represented by {@link DeclarationFact.exports}, not duplicated here.
	 */
	readonly members: readonly MemberFact[];

	/**
	 * The compiler's callable signatures, with a separate fact for each overload.
	 *
	 * @remarks
	 * Does not include construct signatures or an overload implementation signature.
	 * Empty when no call signatures were extracted.
	 * Describes calls to the declaration itself, not methods listed in {@link DeclarationFact.members}.
	 * Preserve compiler order because it determines numeric overload selectors and overload resolution order.
	 */
	readonly signatures: readonly SignatureFact[];

	/**
	 * Bindings exported by this module or namespace symbol, sorted by exported name.
	 *
	 * @remarks
	 * Empty for symbols that do not expose module or namespace exports.
	 * An exported alias can point back to this declaration or another enclosing namespace, so this relationship can contain cycles.
	 * Consumers that traverse exports must track declaration identities instead of recursively expanding every target.
	 */
	readonly exports: readonly ExportFact[];
}

/**
 * An independently documented constructor, static member, accessor, or signature declaration.
 */
export interface DeclaredMemberFact extends SourceDeclarationFact {
	/**
	 * The collected declaration identity of a named static or enum member.
	 * @defaultValue Omitted for constructors, instance members, and declarations without a name.
	 */
	readonly staticTarget?: ApiItemId;

	/**
	 * A provisional identifier scoped to the owning declaration and the member's printed syntax or enum member name.
	 *
	 * @remarks
	 * Class and interface member identities use the printed declaration; enum member identities use the printed name.
	 * Constructor identities also include their source position because private overload parameters can be erased during declaration emit.
	 * These identities are provisional and can change when the input text moves.
	 * This is not an effective {@link MemberFact.id}.
	 * Use source locations to recognize when declared and effective records describe the same original member.
	 */
	readonly id: ApiItemId;

	/**
	 * Compiler-printed declaration without source trivia.
	 *
	 * @remarks
	 * Intended for the containing class, interface, or enum body, not as a standalone declaration.
	 * Includes required member punctuation, such as an enum member's trailing comma.
	 * Unlike the inherited source text, this field excludes the original comments and whitespace.
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
	 *
	 * @remarks
	 * Identifies which configured surface supplied the bindings, not the release-level selection for a report.
	 * The name itself does not select module-resolution conditions.
	 */
	readonly name: string;

	/**
	 * The entrypoint's exported bindings, sorted by exported name.
	 *
	 * @remarks
	 * Different surfaces can expose the same declaration under different names or type-only export paths.
	 * Keep these bindings separate even when they share target identifiers.
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
	 * The package's single documentation comment, independent of configured entrypoints.
	 *
	 * @defaultValue Omitted when no package documentation was found in the analyzed package inputs.
	 */
	readonly packageDocumentation?: PackageDocumentationFact;

	/**
	 * Hashes of package-owned compiler inputs used to validate dependency model freshness.
	 *
	 * @remarks
	 * Includes every compiler input inspected for package documentation, even when it supplies no retained API declaration.
	 * Covers recorded files in the analyzed package, not serialized dependency-model content or newly added project files.
	 * A text-only change can invalidate a recorded input even when the reviewed API is unchanged.
	 *
	 * @defaultValue Omitted on synthetic internal facts without captured inputs; those facts cannot generate dependency models.
	 */
	readonly inputFiles?: readonly InputFileFact[];

	/**
	 * The configured name of the package being analyzed.
	 */
	readonly packageName: string;

	/**
	 * The version of the compiler used for analysis, not necessarily the package's build compiler.
	 *
	 * @remarks
	 * For example, declarations built with TypeScript 6 can be analyzed by TypeScript 7.
	 * This field records the latter, whose printing and lookup behavior produced these facts.
	 */
	readonly compilerVersion: string;

	/**
	 * The configured entrypoint surfaces, sorted by entrypoint name.
	 */
	readonly surfaces: readonly SurfaceFact[];

	/**
	 * Declaration facts retained for exports, supported documentation and type references, or heritage links, sorted by identifier.
	 *
	 * @remarks
	 * Shared export targets use the same declaration fact.
	 * Documentation targets can be retained without being exported by a configured surface.
	 * Base and implements targets can also be retained without being exported.
	 * This collection is not a complete graph of every type referenced by those declarations.
	 * Presence here does not mean that a declaration is exported or selected for a report.
	 * Use the configured surfaces' bindings to determine what each entrypoint exposes.
	 */
	readonly declarations: readonly DeclarationFact[];
}

/**
 * Package-owned documentation retained separately from API declaration metadata.
 */
export interface PackageDocumentationFact {
	/**
	 * Original-scope lookup results for API links, in comment traversal order.
	 * @defaultValue Omitted on internal facts without extracted lookups; valid only when there are no API links.
	 */
	readonly references?: readonly DocumentationReferenceLookup[];

	/**
	 * The original comment location in a package-owned compiler input.
	 */
	readonly origin: Origin;

	/**
	 * Original TSDoc text, including comment delimiters and the package documentation tag.
	 */
	readonly documentation: string;
}

/**
 * An analyzed file's package-relative name and SHA-256 digest of its UTF-8 text.
 */
export interface InputFileFact {
	/**
	 * Package-relative file path with forward slash separators.
	 *
	 * @remarks
	 * Resolved against the package that owns the generated model, not against its consumer's working directory.
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

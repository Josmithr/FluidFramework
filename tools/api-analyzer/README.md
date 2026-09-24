# api-analyzer

This private ECMAScript module (ESM) package provides experimental one-shot package analysis.
It uses the official native TypeScript 7 API and includes the Stage 0 compiler capability tests.
Its API is not stable. It does not generate production artifacts or replace API Extractor.
Publication remains a separate decision.

## Module support

The library is ECMAScript module (ESM) only, and package analysis supports ESM entrypoints only.
CommonJS package inputs and TypeScript `export =` declarations are out of scope for analysis, API reports, portable models, and future declaration rollups.
CommonJS support is not planned work or a stage-acceptance requirement.
Node, browser, and custom package-resolution conditions remain supported within ESM entrypoints.
This scope does not promise a dedicated diagnostic for every unsupported CommonJS input.

## Current scope

Stage 2 is complete as of 2026-09-20 under the accepted review and validation scope.
The [follow-up tracker](docs/api-extractor-replacement-follow-ups.md) retains the known parser limitation and optional investigations for after the remaining library implementation.
Stage 3 adds portable documentation models and source-free readers.
Declaration rollups remain Stage 4; repository documenter and historical-artifact migration remain Stage 5.

Analysis supports original declaration and member metadata, explicit method and property inheritance, conservative automatic member inheritance, and resolved API links.
Selected dependency models supply already-resolved documentation, link origins, and section provenance.
One optional package documentation comment is retained separately from entrypoints and API-item metadata.
Reports support standalone function selection and complete selected classes, interfaces, enums, and namespaces, including constructors and static members.
Type aliases and variables remain selectable as atomic declarations.
Merged generic interfaces, repeated properties and enums, compound type/value/namespace declarations, callable class augmentations, and ambient modules participate in classification, reports, and dependency models.
Their documentation deduplicates original contributions, resolves retained requests, then merges content while retaining original link and section provenance.
Local and selected-dependency references support numeric, declaration-kind, constructor, label, and static/instance selectors, quoted names, and symbol keys.
Self-package qualified references use configured root or subpath exports, including aliases and dependency re-exports.
Dependency models retain finite back-references for recursive namespace aliases.
Module-target and source-relative documentation references are deliberately forbidden.
The official parser's rejection of documented unnamed selectors is an accepted, deferred limitation, not a claim of complete TSDoc support.

## Development contract

Follow the [implementation plan](docs/api-extractor-replacement-implementation-plan.md), including documentation-driven development, test-driven development, and functional architecture.
Write behavior contracts before implementation and run focused failing tests before adding or fixing behavior.
Match TypeScript IntelliSense behavior where possible.
For merged documentation, deduplicate tags and continue to reject conflicting explicit release tags.
Document and test cases where analyzer validation or unsupported declaration forms require different behavior.
Write documentation in Simplified Technical English and follow the [repository documentation guidelines](../../docs/content/Guidelines/Documentation-Guidelines.md).
Keep compiler communication and process lifecycle separate from pure transformations.
Do not add a custom type checker, use compiler-private APIs, or switch backends to make a capability test pass.
Name functions, methods, and named callbacks with verb phrases, following the repository's [coding guidelines](../../docs/content/Guidelines/Coding-Guidelines.md#-do-name-functions-using-verb-phrases).
Compiler fixture declarations can retain names that are required to exercise an API or lookup scenario.

## Stage 0 contract

Pin the analysis engine to TypeScript 7.0.2.
Build the same fixture with TypeScript 6.0.3 and 7.0.2, then analyze both sets of untrimmed declarations with TS7.
Use the official client and the installed native executable.
Keep static TypeScript inputs in the [checked-in fixture suites](src/test/fixtures/README.md).
Copy the required inputs into temporary projects, and keep compiler output and intentional test mutations there.
Remove temporary projects after each test or suite.

The capability tests must check:

- Exported aliases retain their public names and target identities; type-only paths remain distinguishable.
- Generic inherited members use their effective types. Ordinary intersections and `Pick`, `Omit`, and `Readonly` preserve member selection and modifiers.
- Documentation and callable overload information remain available after declaration emit.
- A retained connection and snapshot support repeated output-like queries without a new analysis setup. Record the limits of any reuse evidence.
- Normal disposal and native-process failure terminate promptly and do not leave owned processes running.
- Public APIs needed for complete and release-filtered declarations are available and produce consumable output, or an explicit capability failure is recorded.

Compiler capability failures are investigation results, not permissions to lower requirements.
Do not close F1-F4 or B1-B6 based only on these small fixtures.
Full artifact, cross-package, and migration tests belong to later stages.

## Stage 1 contract

The initial reusable session has been replaced by the [one-shot API](#experimental-api).
The synchronous compiler adapter remains internal; the public entrypoint returns a promise.
Run the full declaration-input capability suite through the synchronous TS7 client before relying on it.
Retain the separate async crash reproduction and declaration-emission investigation gates.

Resolve programmatic configuration with ordered base configurations and explicit overrides.
Use `@eslint/object-schema` to validate property types and merge the ordered layers.
Use the last supplied scalar value, replace supplied arrays, and merge rule settings by rule name.
Treat `null` and `undefined` property values as omitted.
Reject inheritance cycles, missing required settings, and duplicate entrypoint names with structured diagnostics.
Return readonly effective configuration without mutating the supplied configuration objects.
Relative paths use the explicit working directory, which defaults to the process working directory.
Reject unknown settings and unimplemented rule names instead of silently ignoring them.

Each `analyzeAPIs` invocation resolves configuration, loads selected dependency models, extracts facts, and classifies supported original declaration and member comments.
It then validates configured reference policies, completes documentation processing, and prepares report metadata.
All currently implemented shared validation completes before a successful result.
The invocation closes the compiler connection before its promise settles, including on failure.
The official synchronous close destroys streams and signals child termination but does not wait for operating-system process reaping.
The completed `APIAnalysis` contains no compiler handles and has no `analyze`, `invalidate`, or `close` method.
Report generation reuses prepared data without compiler calls, comment parsing, or shared validation.
Changed inputs require a new invocation; previously completed analyses remain unchanged.
There is no persistent analysis cache or watch service.
Unexpected extraction errors are propagated after cleanup; if connection cleanup also fails, an `AggregateError` retains both errors.
The asynchronous entrypoint still blocks the Node.js event loop during synchronous compiler work.
An active compiler call cannot be canceled.
The accepted Stage 2 declaration and reference-validation scope is implemented.
Models retain portable declaration and documentation data; declaration rollups remain required by Stage 4.
These limitations do not waive the corresponding delivery requirements.

Failure diagnostics describe only user-caused issues, including invalid input, configuration, and caller actions.
Use the public `DiagnosticCode` definition for code meanings and corrective actions.
Internal-only validation uses standard assertions. Assertion failures and unexpected operational errors propagate as exceptions, not diagnostics.
Capability limitations can accompany successful facts; they are not user-input failures.

Facts retain exported names separately from declaration identifiers.
They also retain type-only export paths, namespace exports, merged declarations, effective members, and individual call signatures.
Use portable data without compiler handles. Report limitations when a representation is incomplete.
Identifiers are provisional and must not use compiler handle numbers or traversal order.
The Stage 1 representation is not yet a versioned documentation model or a complete API reference graph.

### Original declaration comments

`SourceDeclarationFact.documentation` retains the closest attached TSDoc comment, including delimiters, or `undefined` when absent.
Empty and tag-only comments remain present. Ordinary comments are excluded.
Package documentation is retained separately and never becomes the following API's comment.
The adapter reads attached compiler AST comments; it does not recover documentation by parsing printed declaration text.
An unavailable declaration node supplies no comment. JSON serialization omits absent documentation properties.

Both `DeclarationFact.declarations` and `MemberFact.declarations` retain source records with locations, syntax kinds, source text, and original comments.
The member records replace the former location-only `origins` array. Read locations from `declarations`.
Records follow compiler declaration order.
Overloads and merged declarations retain separate original comments; combined documentation is stored separately in supported lookup contexts.
An effective inherited member retains its original source records, even when generic substitution changes its effective type.
A local override retains only its own declaration comments. An absent or empty override comment does not receive ancestor content during extraction.
These records remain frozen and usable after session closure. They describe original declarations, not resolved documentation.

Compiler tests cover classes, interfaces, inherited generic members, local overrides, overloads, and merged declarations for both supported input compilers.
Original source preservation is independent of combined documentation and automatic inheritance.
Single-declaration class and interface reports now consume the completed member documentation.

### Package documentation

A package has at most one `@packageDocumentation` comment, independent of its entrypoints.
There is no special ownership rule for the `.` entrypoint.
The comment can be in any package-owned file included in the analyzed compiler project, including a file with no exported API.
It must precede all statements in that file and survive declaration emission.
Dependency files and compiler-library files do not supply the analyzed package's documentation.

This standalone module retains a package comment during declaration emission:

```typescript
/**
 * Package-wide overview.
 *
 * @remarks
 * Describe the package as a whole, not one entrypoint or API item.
 *
 * @packageDocumentation
 */
export {};
```

Missing package documentation is allowed by default.
Set `rules.requirePackageDocumentation` to `true` to require it; an inherited requirement can be disabled with `false`.
Multiple package comments are errors even when their text is identical.
Misplaced tags, malformed TSDoc, release tags, parameter or return blocks, and `@inheritDoc` in a package comment are rejected independently of the missing-comment rule.
These errors cannot be disabled through the item-classification syntax opt-out.
Literal tag text in strings and code examples does not count as a package declaration.

The facts and dependency model retain the original comment and its package-relative location outside API records.
Every entrypoint report renders the same package comment before its selected declarations, even when that selection contains no API items.
No missing-package-documentation notice is rendered when the comment is absent.
Package documentation is not copied into the first API, classified by release level, or inherited from a dependency.
The source scan records fingerprints for all inspected package-owned inputs, including files without exported APIs, so edits to those recorded files invalidate stale dependency models.

API declaration links resolve in the package comment's original file scope, including imported aliases, configured self-package surfaces, and selected dependency models.
Numeric overload and static/instance selectors use the same binding rules as item links.
The completed package record retains link occurrences, target identities, and source locations separately from API-item metadata.
Model decoding and suite loading validate stored target identities and occurrence order.
URL links require no network access.
The current conservative visibility rule permits public, beta, and alpha targets and rejects internal or unclassified targets without assigning a release tag to the package.
Whether that package-specific rule should be configurable is recorded for [acceptance review](docs/api-extractor-replacement-implementation-plan.md#stage-2-review-questions).

### Merged release tags

Explicit release tags on parts of the same merged non-overloaded API must agree.
Conflicts fail analysis with `classification-release-conflict`, even when missing-tag or syntax checks are disabled.
The diagnostic identifies the API, conflicting tags, and original package-relative source locations.
Update the tags to agree; no declaration wins by file or declaration order.
This check also applies to repeated property declarations, independently of their containing type's tags.
Callable function and method overloads remain independently classified and may use different release levels.
Untagged parts do not supply an implicit release tag or receive one from this check.

### Merged documentation

Supported merged interfaces, repeated properties, and repeated named namespaces follow TypeScript IntelliSense's content-selection policy.
Distinct summaries are combined in compiler declaration order; identical normalized summaries retain their first occurrence.
A sole description is retained when other parts have no comment or only tags.
Modifier tags form a deduplicated union, including custom tags that appear on only one part.
Identical block contributions are deduplicated; distinct content for one parameter or singleton block is combined in order.
Distinct example and see-also blocks remain separate.

Each retained link uses the scope and location of its original comment.
When identical text appears in different scopes, the first retained copy supplies the link target, as in IntelliSense.
Links in distinct retained descriptions are all validated against the resulting API's metadata.
Original source records remain unchanged.
The combined comment's primary location is the first declaration; link and type-reference occurrences retain their own locations.

Merged interface reports combine compiler-validated type parameters, defaults, heritage clauses, and declared signatures with the compiler's effective member set.
Repeated identifier-named namespaces and string-literal ambient modules use the compiler's combined export set, including nested namespaces and recursive aliases.
Selection retains the complete namespace even when a member does not match the namespace's custom tags.
All explicit release tags on merged parts must agree, and member/container equality still applies.
Compound reports retain interface/constant, function/namespace, class/namespace, interface/namespace, and enum/namespace parts together.
Namespace exports exclude synthetic class exports and statics that are already represented on the class.
Compound functions retain declaration-level link targets plus ordered callable targets for numeric references.
Explicit inheritance supports supported same-kind declaration receivers and targets, including merged interfaces and repeated properties.
Merged receivers deduplicate equal original comments, resolve every retained inheritance request in its original scope, then merge resolved content in compiler declaration order.
Equal resolved contributions keep their first occurrence; distinct summaries and parameter blocks combine without copying target-only tags or ancillary blocks.
Links and all contributing section sources survive local and dependency-model inheritance chains.
Invalid requests and cycles fail analysis; private contribution identities are not serialized.
Class, interface, type-alias, and callable type-parameter names and order must match; documentation is not adapted to renamed parameters.
Unsupported reference-bearing merges fail analysis rather than discarding their references.
Class/interface augmentations and repeated enum declarations are supported and consumer-tested.
Callable and constructable class-instance augmentations render a separate merged interface for their call and construct signatures, with combined generic defaults and heritage.
Repeated ambient modules retain original-scope documentation and export identities through direct and namespace re-exports.
Their quoted compiler names are not emitted as invalid namespace identifiers.

### Module namespace exports and re-export metadata

Module namespace exports retain their own identity and documentation, separate from the source module and its exported APIs.
Require a release tag on the namespace export statement, even when `rules.requireReleaseLevel` is disabled.
Every exported member's effective release level must match the namespace's level.
Member metadata is not replaced by the namespace tag.
Selection is atomic, including when only the namespace matches a custom-tag filter.

The following export documents a public namespace; every API exported by `tools.js` must also have the public effective release level:

```typescript
/**
 * Tools for clients.
 * @public
 */
export * as Tools from "./tools.js";
```

Reports and models preserve aliases, type-only paths, default exports, empty namespaces, recursive namespace paths, and original child provenance.
Namespace selectors and links through type-only members work locally and through selected dependency models.
Separate `export * as` statements create separate namespace APIs, even when they target the same module.
Ordinary forwarding of an existing namespace retains its identity and documentation.

Ordinary re-export statements do not override API metadata.
An absent release tag retains the source level; a matching tag is redundant; a disagreeing tag fails validation in either direction.
An explicit tag must agree with every exposed overload or target of that statement.
Other re-export documentation, including links, is ignored.
The analyzer validates package-owned intermediate export statements as well as entrypoint exports.
Conflicts cannot be disabled through missing-tag or TSDoc-syntax options.
The [suite tests](src/test/suite.test.ts) cover these rules and detached model/report reuse with both declaration producers.
Declaration-rollup compilation remains separate Stage 4 work; successful report generation is not proof of a compilable rollup.

### Type-only enum and constant exports

Reports and dependency models retain type-only flags for enum and constant aliases, including ordinary re-exports of type-only aliases and `export type *` paths.
The report renders a local declaration and an `export type` binding when a target has no direct value export.
It does not turn that binding into a value export.
Value and type-only aliases of the same original declaration retain the same target identity.

The [consumer regression](src/test/fixtures/consumer/typeOnlyValues.ts) checks declarations built by TS6 and TS7 with both consumer compilers.
It permits enum types and constant type queries while requiring value use of type-only aliases to remain an error.
The same consumer compiles against the original declarations and the isolated report code blocks.
This verifies these self-contained reports, not a general declaration-rollup implementation.

### Effective member identities and signatures

`MemberFact.id` identifies a member on its containing declaration. It combines the declaration identifier with the compiler-printed member name.
An inherited member has different identifiers on different containing declarations, even when its source records are the same.
These identifiers are provisional. They do not identify an ancestor or establish an override relationship.

`MemberFact.signatures` retains effective call signatures in compiler order, with generic substitutions and separate original comments for overloads.
The adapter removes null and undefined from the member type before requesting call signatures. This includes optional methods.
Non-callable members have an empty signature array. Callable properties retain comments from their signature declarations, not copied property comments.
Signature identifiers use the effective member as their owner and retain the limitations documented on `SignatureFact.id`.
Analysis classifies each effective callable signature from its original comment.
Untagged methods and properties inherit the effective release level of their declaring container.
An explicit member level must equal that container's level; both more-public and less-public mismatches fail.
This does not inherit descriptive documentation or other custom tags.

Both input compilers verify overload selection, inherited generic signatures, optional methods, callable properties, and frozen facts after session closure and JSON serialization.
Effective callable signatures retain original-scope lookup contexts when their signature declarations are inspectable.
Inherited generic substitution changes the signature type but does not change the lookup scope.
Single-declaration non-callable properties retain `MemberFact.documentationContext` with their original location and reference lookups.
Analysis classifies and resolves these comments under member identifiers, without creating synthetic signatures.
Callable properties use their property comments for classification and remain properties in reports.
Declared constructors, static members, accessors, and signature declarations retain separate comment and printed-syntax records.
Automatic accessor inheritance and broader explicit reference forms remain incomplete.
Heritage comparison views do not receive lookup contexts or separate classification.
Conservative ancestor matching is described below.

### Container compatibility

V1 treats classes, interfaces, enums, and namespaces as atomic selection units.
Selecting a container retains its complete supported member set, including constructors, static members, accessors, call/construct/index signatures, namespace exports, and nested containers.
Neither release-level filters nor custom-tag filters run independently on those retained members.
A member's matching tag does not select an otherwise excluded container.
Standalone overloads remain independently selectable; contained overloads remain together with their container.

The analyzer rejects explicit member/container release mismatches with `classification-container-mismatch`, including when missing-tag or syntax checks are disabled.
An untagged member inherits its declaring container's effective level recursively.
An untagged root remains untagged when missing levels are permitted; an explicitly tagged child does not assign a level to its parent and is a mismatch in that case.
Custom tags and source comments remain local and unchanged.
Serialized dependency metadata includes the effective inherited release level.

The following class gives its untagged constructor, static factory, and property the class's public release level:

```typescript
/**
 * A public client whose members remain together.
 * @public
 */
export declare class Client {
	private constructor();
	static create(): Client;
	value: string;
}
```

The private constructor stays private; language accessibility is independent of release classification.
Private constructor overloads can emit identical signatures after parameter types are erased.
Their provisional declared-member identifiers include source positions to preserve each original comment for validation.

Inherited member views retain their original declaring container and release metadata.
Validation reuses the original member source rather than checking its tag against each receiving type.
Local overrides are validated against their own declaring container.
A selected beta type can therefore retain inherited public members without reclassifying or removing them.
Namespace aliases must expose targets with the namespace's release level; aliasing does not change the target's original ownership.

These checks do not disable configured reference/exposure policies or make partial member extraction complete.
The [container fixture](src/test/fixtures/native/container-members.ts) covers complete output and original ownership with both supported input compilers.
Pure tests cover release-level pairs, nested ownership, untagged roots, repeated inherited views, and custom-tag selections.
Later declaration rollups must follow the same selection invariant; rollups are not implemented by this change.
Additional selection flexibility remains a [post-V1 investigation](docs/api-extractor-replacement-follow-ups.md#flexible-container-member-selection).

### Original and resolved signature text

Each `SignatureFact` separates original input from compiler-produced views:

- `source` identifies the original declaration for that overload and retains its exact input text and package-relative location. It is omitted when the compiler supplies no inspectable declaration.
- `callSignatureText` and `functionTypeText` retain effective, scope-aware signature syntax, including generic substitutions. The effective function type continues to determine the provisional signature identity.
- `reduced` contains compiler-resolved parameter and return types in both syntax forms. It can collapse primitive aliases and add `undefined` to optional parameter types.
- `normalized` preserves application-defined names and parameter structure while reducing selected outer computed type expressions. Callable report output uses this view, not the text used for identity.

For example, an effective parameter written as `Parameters<typeof helper>[0]` can normalize to `string`, while `AliasContract<string>` retains the dependency alias and `Label` retains a named primitive alias.
An inherited method can retain `Value` in its original source and `string` in all effective views.
Original input means the analyzed file; a declaration input does not recover the pre-build implementation source.

Normalization applies at ordinary parameter and return roots to indexed accesses, type queries, conditional types, type operators, and compiler-library utility aliases.
Utility detection uses compiler symbol lookup and default-library metadata, not a list of names.
An application-defined `Pick` is therefore not mistaken for the compiler utility.
Both alternatives retain compiler-produced generic headers, rest annotations, and predicate or assertion returns.
Normalization also preserves optional parameters, unions, and application-defined named references without recursively rewriting their contents.
Unresolved generic expressions can remain symbolic; neither alternative promises complete type expansion.
The adapter uses official type queries, syntax-node factories, and printing, without parsing printed type strings.
All views are captured before compiler disposal and do not depend on a selected report surface.

The [signature fixture](src/test/fixtures/native/signature-views.ts) and [consumer checks](src/test/fixtures/consumer/signatureViews.ts) verify both supported input and consumer compilers.
They cover utility reduction, named and branded aliases, explicit receivers, optional and tuple-rest parameters, generic members, and narrowing returns.
Existing suite tests cover dependency aliases with and without consumer re-exports.
The inherited-report snapshots retain their resolved `string` signatures without baseline updates.

### Direct base declarations

`DeclarationFact.baseDeclarations` contains direct class or interface base declaration identifiers in compiler order.
The adapter follows compiler-resolved base symbols and retains all target declarations in the same analysis result.
Unexported bases remain outside the entrypoint export surface. Shared ancestors are collected once, including in diamond hierarchies.
The links remain frozen and usable after session closure and JSON serialization.

Targets describe original declarations, not instantiated generic base views. For example, a base reached as `Base<string>` retains its original type parameter.
These links exclude `implements` clauses and are empty for declaration forms other than classes and interfaces.
If the compiler supplies a base type without a declaration symbol, extraction fails instead of silently omitting that base.
The links do not establish member overrides, select matching overloads, or authorize documentation inheritance.
Those operations still require additional compiler-backed facts and resolution rules.

### Direct implementation declarations

`DeclarationFact.implementedDeclarations` contains declaration identifiers named by local class `implements` clauses, in source declaration and clause order.
The adapter uses compiler symbol lookup, resolves import aliases, and retains the targets without adding exports.
Type alias declarations remain targets; extraction does not replace them with their constituent types.
Targets describe original declarations, not instantiated generic views.
Clauses inherited through a base class are not copied into this array. Follow `baseDeclarations` to reach that class instead.
The array is empty for other declaration forms. Unresolved class declarations or targets cause extraction to fail.
Both input compilers verify hidden and type-alias targets, direct-only links, unchanged local comments and members, and frozen facts after session closure and JSON serialization.

An `implements` clause checks a type contract but does not add members to a class.
Documentation inheritance is a separate resolution operation: a class member with no local TSDoc can receive content from a confidently compatible implemented interface member.
Any local TSDoc, including an empty or tag-only comment, suppresses automatic inheritance. Explicit inheritance remains a resolution request.
Automatic inheritance is limited to non-overloaded members with a confidently identified compatible source.
If either the receiving member or a candidate source member has multiple callable signatures, do not inherit automatically.
Ambiguous, conflicting, or unproven automatic sources leave the member undocumented; do not guess from declaration order or printed signature text.
Any configured missing-documentation policy can still report that absence.
Explicit inheritance requests must resolve and validate successfully or produce diagnostics.
The current source selector requires one distinct compatible original source across base classes and interfaces.
It does not prioritize a class source over a distinct interface source.
Supported interface/property merges and class/interface reports use completed documentation.
Broader automatic matching for uncertain merged or accessor cases remains a deferred investigation.
Current extraction does not copy interface documentation or change release classification.

### Instantiated heritage views

`DeclarationFact.heritage` retains direct `extends` and `implements` views in source declaration and clause order.
Each `HeritageFact` identifies the relationship kind and original target declaration, with effective target members after compiler substitution of the local type arguments.
For example, an `extends Base<string>` view retains string-valued members while the original `Base` declaration retains its type parameter.
Class bases and type-alias implementation targets also retain their effective members.
All views are detached and frozen. Member identifiers are scoped to the view, not reused from the original target declaration.
The provisional view identity includes compiler-printed type text; this text is not used to establish compatibility.
`HeritageFact.documentationMatches` records compatible non-overloaded member pairs between the receiver and that instantiated view.
The adapter requires mutual compiler assignability and matching parameter names, optional/rest flags, and type-parameter names.
Callable parameter and return types are checked separately; top-level `any`, `unknown`, or unresolved compared types are excluded.
Optional and readonly member states must match, and unresolved readonly state is excluded.
Computed names that cannot be matched through compiler symbols remain ineligible.
These checks can reject otherwise valid sources; they do not authorize guessing a replacement source.
Printed type text is never used for compatibility.
Recursive instantiated ancestry is not serialized, but source bindings can form chains through retained original member facts.

The pinned TS7 7.0.2 API currently blocks the tested generic-overload comparison approach.
Its public checker exposes type assignability but no pairwise signature-compatibility method.
A function-type node returned by `signatureToSignatureDeclaration` causes a node-handle resolution error when passed to `getTypeFromTypeNode`.
Comparing individual parameter types is not a valid substitute: equivalent generic methods have separately declared type parameters that fail mutual assignability.
The native capability regression reproduces both boundaries for TS6- and TS7-built inputs.
Automatic overload inheritance is excluded from Stage 2 rather than approximated with those APIs.
The [overload inheritance follow-up](docs/api-extractor-replacement-follow-ups.md#automatic-overload-documentation-inheritance) tracks better support.
This limitation does not block explicit numeric inheritance selectors or other Stage 2 work.

## Shared analysis context

The [architecture proposal](docs/Architecture-Proposal.md) defines the layer dependencies.
`src/api.ts` composes configuration resolution, analysis, and output generation without exposing internal types.
`analysis-types` contains shared graph and input contracts and generic release-selection operations.
`analysis` owns compiler queries, original classification, documentation resolution, and mutable working state.
`report-generation` consumes the completed graph without importing analysis implementation or TSDoc.
`utilities` contains only generic assertions and freezing helpers.
`model-generation` owns versioned dependency model encoding, decoding, and artifact validation.
The root composition reads artifacts and supplies validated model data to analysis.
Declaration rollup generation remains pending; no empty rollup layer is introduced.

Each public invocation creates one internal `AnalysisContext` from immutable compiler facts.
Context creation validates declaration and signature identities, indexes declarations, and classifies original comments.
It also creates the metadata index used for link-policy checks.
The compiler adapter retains parsed callable comments for this invocation; context creation parses only comments not already retained.
Classification, reference binding, and content resolution reuse these parsed nodes inside analysis.
The context records original block tags and API link nodes before inheritance changes comment content.

Compiler facts and classification stay immutable.
The context's maps and TSDoc nodes are private working data, not immutable artifact data.
Classify and bind original comments before running inheritance resolution once.
Resolution changes only those working nodes, not original comment strings or compiler facts.
Discard the context after completion or failure; do not resolve it again or reuse it with different inputs.
`completeAnalysis(context)` resolves and validates documentation, then returns a frozen `CompletedAnalysis` graph.
The graph retains original facts and classification plus resolved comments, content status, original block tags, link targets, inheritance paths, and section provenance.
It contains no TSDoc nodes or mutable construction indexes and is not a versioned model artifact.
`prepareReviewReport(graph)` copies report fields from this completed graph without performing semantic analysis.
Report calls validate new selection criteria without repeating parsing, fixed export validation, or semantic analysis.

For internal unit tests without compiler facts, `createDocumentationContext(inputs, options)` creates the same parsed-comment boundary.
Its `validation` field retains strict syntax errors even when classification is configured to tolerate them.
Neither context type is a portable model or a public package export.

## Explicit documentation inheritance contract

`resolveDocumentation(context, bindings, options)` copies documentation for explicit inheritance requests within the same package.
A binding associates a request with its target declaration or signature.
The internal `bindDocumentationReferences(context)` operation produces bindings from supported compiler lookup facts.
It is not exported from the package entrypoint.
Analysis completion runs binding and content resolution before any generator receives its input.

Configure `customModifierTags` once when creating the context.
For example, `{ customModifierTags: ["@partner"] }` registers `@partner` for all semantic stages.
The content resolver's `DocumentationResolutionOptions` supplies only API link validation inputs and validated automatic inheritance bindings.
Register tags used by all supplied comments, including inheritance targets that are not selected for a report.
The operations share the context's parsed comments and do not change the caller's options.
Invalid names, duplicate names, and redefinitions of standard tags produce configuration diagnostics.
Unknown tags and malformed comments still fail binding and resolution, even when classification disables its own syntax diagnostics.
Custom modifiers remain local metadata and are not copied from inheritance targets.

Each input supplies an item identifier, the original comment's package name, and its local TSDoc comment or `undefined`.
Each binding supplies a source identifier, the declaration reference printed by TSDoc's `emitAsTsdoc()` method, and a target identifier.
If you construct bindings manually, resolve each target in the original comment's declaration scope.
Verify that the source and target signatures have compatible parameters and type parameters.
Bindings must contain unique sources, valid target identities, and reference text from the original comments.
The binder establishes these invariants; the resolver does not repeat them.
The resolver retains checks for required inputs, suite authorization, cycles, and receiving link policy.

The following internal example resolves an explicitly bound function comment without compiler access.
The import is relative to a module in `src`; this operation is not a package export.

```typescript
import { resolveDocumentation } from "./analysis/documentation.js";
import { createDocumentationContext } from "./analysis/documentationContext.js";

const context = createDocumentationContext(
	[
		{
			id: "base-signature",
			packageName: "example",
			documentation: "/** Converts a value. @internal */",
		},
		{
			id: "derived-signature",
			packageName: "example",
			documentation: "/** {@inheritDoc base} @public */",
		},
	],
);
if (!context.ok) {
	throw new Error(JSON.stringify(context.diagnostics));
}
// These bindings must satisfy the same scope and parameter checks as the compiler-backed binder.
const result = resolveDocumentation(
	context.value,
	[
		{
			source: "derived-signature",
			reference: "base",
			target: "base-signature",
		},
	],
);
```

Successful output is deeply frozen and sorted by item identifier.
Each result contains a comment printed by TSDoc, an `inheritedFrom` array of target identifiers, and effective API `links`.
The array follows the inheritance path from the immediate target to the last target.
TSDoc supplies parsing and printing.
The resolver does not splice comment text or parse printed TypeScript signatures.
It copies the target's summary, remarks, parameter documentation, type-parameter documentation, and return documentation after resolving the target's own inheritance.
Other blocks and modifier tags come from the local comment.
In the example, the derived comment receives the summary and retains `@public`.
It does not receive `@internal`.
These copying rules are fixed. Evaluating configurable rules is a [future follow-up](docs/api-extractor-replacement-follow-ups.md#configurable-documentation-inheritance-rules).

Use the original inputs for release classification.
Do not classify the resolved comment as a new API item.
An absent or empty target comment supplies no inherited descriptive content.
A target comment that contains only metadata tags also supplies no descriptive content.
The output retains the distinction between absent and present local comments.
This output format can change.
Portable models retain this resolved TSDoc, structured link targets, and source identities for each resolved section.
Readers can parse the resolved comment for presentation without repeating semantic lookup or inheritance.

Invalid syntax, unresolved references, invalid overload selectors, parameter incompatibilities, and inheritance cycles return typed diagnostics without a partial success value.
Missing required internal data still throws assertion errors at the point of use.
The resolver trusts validated binding identities, occurrence indices, reference text, and original scope.
Unexpected processing errors propagate as exceptions.
The resolver updates context-owned parsed comments once, with traversal state local to the call.
Original input records and comment strings remain unchanged.
It does not support parameter renaming, custom block or inline tags, or inheritance from other packages.
Requests for inheritance from other packages and requests without explicit targets produce diagnostics.
API links require validated original bindings and classification as described below.
Links to URLs remain unchanged, and the resolver does not access their destinations.
An absent comment alone does not authorize automatic inheritance.
Pass validated automatic bindings through the resolution options; the resolver does not query ancestor facts or infer compatibility itself.

The pure tests cover chains, local metadata, custom modifier configuration, empty targets, blocks that remain local, invalid bindings, cycles, and unsupported features.
Checked-in plain-text snapshots contain the complete resolved comments for direct inheritance, inheritance chains, empty inherited content, and retained local blocks.
Tests compare the exact output, including whitespace, with these files.
Normal test runs read snapshots without updating them.
Review each expected comment against the inheritance contract before accepting a snapshot change.
Keep separate assertions for target identifiers, inheritance paths, unchanged inputs, and failure diagnostics.
Real-compiler tests verify binding and content resolution after the analysis session closes.
These tests use declarations built with TypeScript 6 and TypeScript 7, both analyzed with TypeScript 7.
Both compiler inputs and the direct-inheritance unit test use the same resolved-comment snapshot.
Pure and compiler-backed report tests share snapshots for descriptive and empty inherited content.
`ReviewSignature.documented` and report notices use successfully resolved content while annotation tags remain local.
Selected container reports and model-backed suite resolution now use this effective-content contract.
Remaining declaration ownership and reference coverage still prevent closing Stage 2.

### Compiler-backed callable bindings

`bindDocumentationReferences(context)` uses indexed analysis facts and original parsed comments without compiler objects.
It returns deeply frozen bindings sorted by source signature identifier.
During analysis, the official compiler resolves unqualified names, such as `base`, in each collected callable declaration's original scope.
This lookup includes imported aliases.
If the compiler finds no symbol in that scope, the adapter checks the source module's exports for an export alias.
The original declaration scope takes precedence over export aliases.
A re-exporting entrypoint does not change the lookup scope.
The adapter collects inheritance targets even when they are not exported.
A target must still exist in the declaration inputs because TypeScript emission can remove unused private declarations.

`SignatureFact.documentationContext` retains the original location, parameter names, optional parameter flags, rest parameter flags, and type-parameter names.
It also retains the lookup result for an inheritance request.
The analyzer supplies this field for collected functions, methods reached through explicit references, and inspectable effective callable member signatures.
Its type is `SignatureDocumentationContext`.
Single-declaration non-callable properties retain a `DocumentationReferenceContext` on the member instead.
This context has reference and location facts but no callable parameters.
Heritage comparison views omit documentation contexts.
Callable property signatures do not acquire the containing property's comment.
An inheritance request on a supported declaration without the required lookup context throws an assertion error.
The binder does not guess a target from its name.
These facts remain usable after the session closes or after JSON serialization.
Their format can change, and they do not represent all declaration references.

For a callable receiver, the target must be a function or method in the same package or a selected dependency model.
Without a selector, it must have exactly one callable signature.
For an overloaded target, use a numeric selector such as `{@inheritDoc (foo:2)}` to select the second callable signature.
Selectors are one-based and follow compiler declaration order, excluding implementation signatures.
Reordering overloads can change the selected source; review numeric references when overload order changes.
For an instance method, use a path such as `{@inheritDoc MethodSource.(operation:2)}`.
Namespace paths are supported for explicit inheritance, with a numeric selector only on the final member.
Unambiguous static members are supported without a side selector.
Use `ReferenceSource.(operation:static)` or `ReferenceSource.(operation:instance)` when the sides have the same member name.
An unqualified static/instance collision is rejected rather than guessed.
Missing targets, out-of-range selectors, and invalid explicit requests produce diagnostics without partial results.
Source and target parameter names, order, and count must match.
Optional parameter flags, rest parameter flags, and type-parameter names must also match.
Use local documentation when parameters use destructuring or parameter names differ.
These checks protect parameter documentation but do not establish TypeScript assignability.
They do not compare parameter types, return types, generic constraints, or generic defaults.
Package-qualified dependency paths use selected suite models.
Self-package qualified paths use configured entrypoint exports.
Named declaration selectors `class`, `interface`, `namespace`, `enum`, `type`, `function`, and `variable` check the requested kind against the compiler declarations or retained model kinds.
They can constrain intermediate path components as well as the terminal target.
A `function` selector does not choose an overload; ambiguous callable targets still require a numeric selector.
Explicit constructor selectors, original `{@label}` selectors, quoted names, enum members, and symbol-reference paths are supported locally and through models.
Overloaded constructors and duplicate labels require an unambiguous selection; labels are not inferred from inherited documentation.
TSDoc selector conformance remains required, with the explicit 2026-09-20 exclusion of module-based references.
Whole-module targets such as `my-package#` and `my-package/widgets#`, and import paths without a package name such as `./widgets#Widget`, are forbidden for now.
The rule applies to links, inheritance requests, package comments, and nested symbol references.
Named package APIs such as `my-package#Widget` and `my-package/widgets#Widget` remain supported, as do ordinary namespace-member paths.
Potential module support is tracked in a [follow-up investigation](docs/api-extractor-replacement-follow-ups.md#consider-module-based-documentation-references), not as a Stage 2 requirement.
The [remaining conformance limit](docs/api-extractor-replacement-implementation-plan.md#remaining-stage-2-decisions) concerns parser-rejected unnamed selectors.
Target-less `@inheritDoc` still requires a confidently identifiable source; no source is guessed.
The terminal component accepts one selector: selecting a side does not infer an overload when multiple callables remain.
TSDoc selectors identify a specific declaration, such as an overload, within a reference.
Classification, binding, and content resolution share parsed comments and custom modifier configuration through the analysis context.
Custom block and inline tag configuration and configuration-file loading remain pending.

Compiler fixture tests cover direct references, imported and exported aliases, original scope through re-exports, non-exported targets, missing names, ambiguous overloads, incompatible parameter shapes, and unsupported forms.
Custom modifier fixtures verify binding and resolution after session closure for both compiler inputs.
They also verify that original release classification and metadata selection do not change.
Pass bindings to `resolveDocumentation` with the context that owns the original signature comments and package names.
Use the original comments for classification.
Function reports use these bindings and resolved comments to determine documentation presence.

### Explicit declaration inheritance

Classes, interfaces, type aliases, variables, enums, namespaces, and properties can request documentation from the same supported declaration category.
This includes merged interfaces and repeated properties, using the combined target documentation.
The [merged inheritance fixture](src/test/fixtures/native/merged-inheritance.ts) covers both paths with declarations emitted by TS6 and TS7.
The [suite consumer](src/test/fixtures/suite/merged-inheritance-consumer.d.ts) covers package-qualified and imported dependency targets.

Class, interface, and type-alias type-parameter names, count, and order must match.
These names are retained from compiler nodes, not parsed from printed headers.
Property requests cannot copy callable parameter documentation.
Numeric selectors do not apply to interface or property documentation.
The checks do not compare member types, generic constraints, or generic defaults and do not establish assignability.

Inheritance resolves the target's own requests before copying content and rejects cycles.
Copied links and section provenance keep their original sources.
Release levels and custom tags stay with the receiving API; they are not copied from the target.
Dependency models retain class, interface, and type-alias type-parameter arrays even for non-generic declarations, whose arrays are empty.
Models missing those facts must be regenerated before use.
Distinct inheritance requests on supported merged declarations resolve independently before their content is merged.

### Conservative automatic inheritance

The internal `bindAutomaticDocumentationReferences(facts)` operation selects automatic sources from compiler-checked heritage matches.
It returns frozen `AutomaticDocumentationBinding` values with receiving and original-source member identifiers.
Pass these values through `DocumentationResolutionOptions.automaticInheritance`, together with original documentation inputs for each member and target.
The operation does not copy content or change the facts.

Current automatic selection supports same-package, single-declaration, non-overloaded members.
Any local TSDoc suppresses automatic inheritance, including an empty comment or a comment containing only tags.
Explicit `@inheritDoc` is still a separate request that must pass explicit binding validation.
If any same-name candidate is overloaded or lacks a proven compatible match, selection skips the receiver.
Multiple paths to the same original source are deduplicated by original declaration location.
Distinct sources remain ambiguous, even if their text happens to match.
No source wins by declaration order, signature text, or interface-clause order.

The resolver copies the same descriptive sections for automatic and explicit inheritance.
It retains link provenance and validates links against the receiving API's original metadata.
It does not copy release tags or modify classification.
Original inputs remain unchanged, and results remain frozen and usable without a compiler session.
Pure tests cover chains, local suppression, ambiguous bindings, cycles, and inherited-link policies.
Both compiler inputs cover instantiated contracts, type aliases, diamonds, conflicting sources, reordered traversal, and overloaded source/receiver exclusion after JSON serialization.

Analysis completion maps eligible automatic member bindings to property or single callable signature identifiers.
It resolves effective method and supported property comments and validates their API links before reporting success.
Explicit method and single-declaration non-callable property references are supported, including property chains.
An inherited link still requires the receiving signature's original release metadata, even when the missing-release-tag rule is disabled.
Both input compilers verify namespace-scoped inherited links, explicit method references, automatic suppression, and detached completion.
Callable-property comments and supported declared member syntax now enter classification and reports separately.
Automatic source selection can use selected suite dependencies, but still excludes merged or uncertain sources.
Individually collected method targets support explicit-reference chains and API links to supported standalone functions.
Automatic accessor inheritance and recursive instantiated ancestry require further integration.
Do not discard link or explicit-reference diagnostics to treat an unsupported member comment as documented.

### Compiler-backed API link lookup

Supported function documentation contexts include a required `links` array.
Each entry is a `DocumentationReferenceLookup`, the same lookup type used for explicit inheritance.
The adapter traverses the official TSDoc tree and records API links from summaries and documentation blocks.
Entries follow tree traversal order and include repeated references.
URL links do not produce entries and do not cause network access.
An empty array means the parser found no API links; it does not establish that the comment is valid.

Lookup supports unqualified names, imported aliases, and exported aliases in the original function declaration scope.
Re-exporting a function does not change that scope.
The adapter retains resolved target declarations, including non-exported targets that remain in the compiler inputs.
Self-references and mutually linked declarations do not cause unbounded collection.
The lookup result identifies a declaration, not an overload.
Unlike inheritance binding, link lookup can retain variables and overloaded functions without checking parameter compatibility.

Self-package qualified names start at the selected export surface instead of the comment's lexical scope.
For package `example`, `example#SourceAlias` selects an export from entrypoint `.` and `example/selectors#Source` selects one from entrypoint `./selectors`.
Scoped package names use the same rule, for example `@scope/example/selectors#Source`.
The path uses exported names, including aliases, and can continue through supported namespace and member paths.
All configured entrypoints are available before collection, regardless of their configuration or traversal order.
A missing export or unconfigured subpath produces a reference diagnostic; lookup does not fall back to private names or another surface.
Numeric overload selection, member-side disambiguation, and release policies still apply.
Self-qualified re-exports of dependency APIs require the owning package's selected model and preserve its documentation provenance.

`DocumentationReferenceLookup` is a discriminated union with three `status` values.
A `ResolvedDocumentationReference` has `status: "resolved"` and a required `target` declaration identifier.
A `MissingDocumentationReference` has `status: "not-found"` and no target field.
An `UnsupportedDocumentationReference` has `status: "unsupported"` and no target field.
Self-package qualified references are resolved during native lookup; target-less inheritance requests remain unsupported.
Local API links support namespace and static/instance member paths, using the same original-scope traversal as explicit inheritance.
Selected dependency models handle foreign package-qualified references and dependency-owned re-exports after native extraction.
Numeric selectors are supported for links and explicit inheritance; the lookup retains the declaration target and the binder selects its callable signature.
Links apply visibility policy to the selected overload, not to every overload in the declaration.
All outcomes retain the printed `reference` text, including an empty string for a target-less inheritance request.
Narrow on `status` before accessing `target`.
Lookup does not validate the target's package scope, release level, or suitability for documentation links.
The separate link binder validates the supported function subset described below.
The content resolver consumes validated bindings and preserves their original context through inheritance.

Compiler fixture tests cover these lookup cases using both supported declaration-build compilers.
They verify detached access after session closure, frozen lookup results, and JSON round-tripping of the documentation context.
Lookup alone does not establish API-link validity. Function reports also run the link binder and content resolver.

### Same-package API link binding

The internal `bindDocumentationLinks(context)` operation in [documentation.ts](src/analysis/documentation.ts) validates local API links without compiler access.
It is not exported from the package entrypoint.
The context supplies original classification, including targets excluded from report selections.
The binder does not recompute classification or rebuild its metadata index.

Sources must have original supported declaration or member documentation contexts.
Targets must have declaration-level documentation contexts, or a supported callable signature selected from its overload set.
Use a one-based numeric selector for an overloaded target; without one, the callable must be unambiguous.
The source and target must belong to the same original package, which can differ from the package that re-exports them.
Aliases and retained unexported targets are supported.
Parameter names and types do not need to match because links do not copy parameter documentation.
Ambiguous local overload targets and unsupported local path or selector syntax produce diagnostics.
Qualified references into selected dependency models use the exported paths in those models.
These limits are provisional until the remaining target semantics are defined and verified.

Public, beta, and alpha APIs can link to each other, independently of report selection.
They cannot link to internal APIs.
Internal APIs can link to any release level.
Missing source or target metadata throws an assertion error.
A retained metadata record with an unspecified release level produces a configuration diagnostic that requests a release tag.
The binder does not treat missing metadata as public or infer it from a report selection.

Each result retains the source signature identifier, API link index, reference text, target declaration and signature identifiers, and original comment location.
Indices follow TSDoc tree traversal order and exclude URL links.
Repeated links remain separate occurrences.
Results are deeply frozen and sorted by source identifier and link index.
URL destinations are not accessed or validated.
The binder checks TSDoc syntax and verifies that lookup reference text and occurrence order match the comment.
Missing names produce reference diagnostics; non-internal-to-internal links produce `documentation-link-policy`.
Missing or stale lookup facts for supported declarations throw assertion errors.
Failures contain no partial bindings.
Context creation validates fact identities before constructing classification and its index.
Missing retained target declarations are internal invariant failures and throw exceptions.

Pure tests cover all release-level combinations, selection independence, stale and missing lookups, unsupported scopes, custom modifiers, and immutable results.
Compiler tests verify aliases, unexported targets, repeated links, self-links, mutual links, and original scope through re-exports after session closure.
They use declarations built with TypeScript 6 and TypeScript 7 and verify binding after JSON serialization.
This operation validates links in original local comments.

### Inherited API links

Pass its bindings and the existing metadata index through `resolveDocumentation`'s `linkValidation` option to resolve comments that contain API links.
Omit this option only for comments without API links, including inherited content.
Each binding identifies both the target declaration and its single callable signature for release-policy checks.
The binder supplies exactly one validated binding per original API-link occurrence.
The resolver associates each original node with its binding without repeating count, text, identity, or provenance checks.
Manual bindings must satisfy the same target and scope checks as the compiler-backed binder.
The target signature must have original metadata even when it is not an inheritance target.
The resolver does not verify the declaration-to-signature association or recompute classification.

The following internal call uses parsed comments, validated bindings, and the metadata index from the same analysis:

```typescript
const resolved = resolveDocumentation(context, inheritanceBindings, {
	linkValidation: {
		bindings: linkBindings,
		metadata: context.metadata,
	},
});
```

Resolved comments expose a `links` array in effective TSDoc traversal order.
Each entry preserves the original source signature, original link index, target identifiers, and comment location.
The resolver associates bindings with original TSDoc nodes before copying inherited sections.
It does not look up an inherited reference in the receiving declaration's scope.
Only links in copied sections propagate; target-only examples and other blocks that are not copied do not contribute links.
Local ancillary blocks retain their own link bindings.
Every receiving API requires original release metadata when its effective comment contains API links.
Non-internal APIs cannot receive an inherited link to an internal target, even if the original comment belongs to an internal API.
Inherited content does not change classification or selection.
Complete-comment snapshots cover inherited links and links in copied sections alongside local examples.
Pure tests cover chains, identical reference text with different original targets, original block-tag preservation, and receiving release-policy failures.
Both compiler inputs verify resolution through aliases after JSON serialization and session closure, using the same inherited-comment snapshot.
Function reports validate local and inherited API links before constructing a successful report, including links in unselected signatures.
Effective content determines `ReviewSignature.documented`; original classification and local tags determine report annotations.
This integration does not complete the remaining Stage 2 declaration and reference acceptance work.

## Release classification and selection contract

The first Stage 2 increment classifies identified documentation inputs and selects metadata views.
It does not generate reports, validate semantic references, or trim declaration text.
`classifyApiItems(context)` reads original parsed comments from a documentation context.
Context creation accepts inputs with `id` and `documentation` fields, including callable signature facts.
The required `documentation` property has type `string | undefined`.
Supply only the associated TSDoc comment, including delimiters, or `undefined` when no comment exists.
An explicit empty comment such as `/** */` is present documentation. An empty string is invalid comment text, not an absent comment.
Do not supply declaration text in this field.
This distinction supports the inheritance rule: absence permits validated automatic inheritance, while any local TSDoc comment suppresses it.
Classification does not implement inheritance and does not preserve raw comments in its metadata output; retain the original facts for that work.
Each item is classified independently. Callers supply callable overloads, not implementation signatures.
The result contains each item's identifier, release level, and modifier tags, sorted by identifier.
Duplicate internal identifiers throw at context creation; classification does not repeat identity validation.

Use `@microsoft/tsdoc` to parse comments. Do not interpret tags with a custom comment parser.
`ReleaseLevel` is a numeric enum: `Public = 0`, `Beta = 1`, `Alpha = 2`, and `Internal = 3`.
Increasing values express increasing permissiveness. Numeric comparison is intentional API behavior.
TSDoc tags remain `@public`, `@beta`, `@alpha`, and `@internal`, with an explicit mapping to enum values.
Classification metadata, including its JSON representation, stores numeric release levels instead of strings.
Custom modifier names are supplied explicitly in `customModifierTags`, with a leading `@`.
Names must not redefine standard tags or each other. Filters use the configured spelling.
No Fluid-specific tags or surface names are built in.
TSDoc parser diagnostics fail classification by default. Set `rules.validateTsdocSyntax` to `false` to suppress those diagnostics.
For example, an unconfigured tag or malformed inline tag produces a parser diagnostic.
Disabling this rule does not disable parsing: recognized tags still contribute to classification.
Missing-release checks remain controlled by `rules.requireReleaseLevel`, and conflicting release levels always fail.
Absent documentation uses an empty parsed tree while retaining undefined original text.
An explicit empty TSDoc comment also parses successfully.
Both lack release tags and produce the same missing-release diagnostic when that rule is enabled.
Invalid supplied strings, including empty strings, produce parser diagnostics unless `rules.validateTsdocSyntax` is disabled.
Missing release levels fail by default. Set `rules.requireReleaseLevel` to `false` to retain untagged items with an `undefined` release level.
JSON serialization omits `releaseLevel` for untagged items. Reading an omitted field returns `undefined`.
Check absence explicitly: `ReleaseLevel.Public` is zero, not an absent release level.
Multiple distinct release levels on one item always fail with `classification-release-conflict` because selection would be ambiguous.
Mixed release levels across different overloads are valid, including mixed internal and non-internal overloads.
Failures contain diagnostics and no partial classification. Diagnostic messages identify the affected item.
Invalid tag configuration fails with `classification-configuration`.

`selectApiItems` accepts classified metadata and a named selection.
`releaseLevels` is an explicit set, not a release-order threshold. Internal items appear only when explicitly selected.
`includeUntagged` defaults to `false`.
All `requireTags` must be present, and none of the `excludeTags` may be present.
Both tag lists default to empty. Unknown or unconfigured filter tags fail with `selection-configuration`.
An empty selection name or an unsupported release level also fails with `selection-configuration`.
A successful selection contains its name and matching metadata items, sorted by identifier.
Classification and selection do not mutate or freeze caller-owned inputs. Their results are deeply frozen.
They perform no compiler queries, filesystem access, baseline updates, or artifact writes.
The original analysis facts remain available for later validation, including validation of excluded targets.
Full declaration selection and reference validation require later contracts and tests.
The context captures effective `rules` and `customModifierTags` from configuration.
Reuse a successful classification for several selections. The classifier does not cache or automatically repeat this work for each selection.

The following internal example classifies two overloads and selects the public partner metadata without including the internal overload.
The import is relative to a module in `src`; these operations are not package exports.

```typescript
import { classifyApiItems } from "./analysis/classification.js";
import { ReleaseLevel, selectApiItems } from "./analysis-types/classification.js";
import { createDocumentationContext } from "./analysis/documentationContext.js";

const context = createDocumentationContext(
	[
		{ id: "convert:text", documentation: "/** @public @partner */" },
		{ id: "convert:number", documentation: "/** @internal @partner */" },
	],
	{ customModifierTags: ["@partner"] },
);
if (!context.ok) {
	throw new Error(JSON.stringify(context.diagnostics));
}
const classified = classifyApiItems(context.value);
if (!classified.ok) {
	throw new Error(JSON.stringify(classified.diagnostics));
}
const selected = selectApiItems(classified.value, {
	name: "partner-public",
	releaseLevels: [ReleaseLevel.Public],
	requireTags: ["@partner"],
});
if (!selected.ok) {
	throw new Error(JSON.stringify(selected.diagnostics));
}
console.log(selected.value.items); // Contains metadata for convert:text only.
```

## Review artifacts and baselines

Review artifacts must identify the package and configured surface. Their API content must expose exported names,
type-only export paths, callable signatures, release levels, and policy-relevant modifiers.
Generation must use deterministic ordering and exclude volatile data such as timestamps and absolute checkout paths.
Separate selections must produce separate artifacts from shared analysis. Baseline comparison must not trigger analysis.
The declaration renderer supports functions, single-declaration containers, enums, type aliases, variables, and namespaces.
Its report syntax is experimental and is not a declaration rollup.
Raw declaration text is not a substitute for correctly selected declarations, and metadata-only output is not a complete API report.

Internally, `completeAnalysis(context)` owns binding and resolution and produces the immutable generator input.
`prepareReviewReport(graph)` reads resolved content, original metadata, and fixed export data from that graph.
Preparation cannot produce documentation diagnostics because analysis has already completed those checks.
Preparation validates fixed export identities and records unsupported declaration forms once per surface.
`createReviewReport(prepared, entrypoint, selection)` validates new selection criteria and filters prepared records without reparsing or repeating semantic validation.
Unselected ancestors and link targets remain available, and invalid documentation fails the request even for an empty selection.
Documentation diagnostics propagate without a partial report.
The `documented` flag measures descriptive content after resolution; an inheritance request alone does not count.
Empty inherited content remains undocumented. Original release metadata and local block tags still control report annotations.
The report identity uses the package name and selection name, not the physical entrypoint name.
This lets two resolution contexts render under the same review identity for parity comparison.
Exports are sorted by exported name. Aliases remain separate exports, and type-only export paths remain visible.
Selected overloads retain compiler order because overload order can affect resolution.
An export with no selected overloads is omitted. An empty selected surface is an explicit empty report.
Unknown entrypoints return `report-configuration` diagnostics.
Report callers supply release levels and tag filters, not independently assembled classification records or selected identifiers.
Invalid criteria produce selection diagnostics.
Duplicate fact identities assert during context creation, and unresolved export targets assert during preparation.
The builder throws for unsupported forms, including unresolved merged ownership and container implementation bodies.
Recursive namespace references render as aliases to an enclosing namespace instead of expanding indefinitely.
These are unsupported library capabilities, not user-input diagnostics. No partial report is returned.

`renderReviewReport(report, options?)` produces API Extractor-like Markdown: a package heading, generated-file notice,
surface identity, and one `ts` block containing selected declarations and explicit export statements.
Each function is declared once, with per-overload comments. Alias and type-only exports refer to that declaration.
Same-name type-only exports of interfaces and type aliases use direct `export interface` and `export type` declarations.
This simplification applies only when the declaration has no value-bearing merged parts.
Renamed type-only exports and declarations with a value aspect retain separate export statements.
Type-only export statements appear directly beneath their complete declaration group, with no intervening blank line.
For overloaded or merged declarations, they follow the last overload or merged part.
Multiple type-only aliases are sorted together there, including within nested namespaces.
Ordinary alias exports remain at the end of their namespace scope.
A declaration used only through aliases is not accidentally exported under its implementation name.
Local declarations can reuse their own exported names, including type-only exports, without a generated suffix.
Names owned by different declarations remain reserved; a genuine collision uses a distinct local name and preserves the exported alias.
Keeping an original declaration name does not turn a type-only class, enum, or constant export into a value export.
Call-signature declaration text is printed by the compiler during analysis; the renderer does not rewrite arrow-function type strings.
The report retains declaration identities internally to group aliases, but never prints those identities.

APIs re-exported from another package in the suite receive a `` // Re-exported from `package-name` `` comment above their declaration group.
The source comment follows the first declaration's tag-comment lines, or appears directly above the declaration when no tag comments are shown.
The comment names the original declaring package, not an intermediate re-exporting package or an inherited documentation source.
Aliases, overloads, and merged declarations share one comment per declaration group in each namespace scope.
Recursive namespace aliases receive the comment above their export statement instead.
Local declarations receive no re-export comment, including declarations with inherited documentation or members.
Re-export source comments remain visible when tag and undocumented-notice output are disabled.

`ReviewPresentationOptions.includeImports` defaults to `true`.
Reports include import bindings referenced by the selected declaration syntax, including container headers, members, and nested namespace contents.
Selection removes imports used only by omitted declarations or standalone overloads.
Imports retain their module specifier, local alias, default or namespace form, and type-only status.
Repeated bindings appear once; a value import takes precedence over a type-only import of the same binding.
Explicit `import("package").Type` expressions remain inline and do not add a local import.
Re-exporting an API from another package in the suite does not add an import for that API.
Imports for declarations already rendered in the report are omitted.
Import capture uses compiler lookup during analysis; rendering uses detached data after compiler disposal.
These imports support API review, not declaration-rollup compilation or import-path relocation.

The following presentation setting omits imports without changing API selection:

```typescript
const presentation = { includeImports: false };
```

`ReviewPresentationOptions.includeReleaseTags` defaults to `true` for top-level declarations and standalone overloads.
Container members omit release tags, including constructors, statics, enum values, augmentation signatures, and nested namespace exports.
Members still show requested non-release tags and undocumented notices; their original release metadata and validation are unchanged.
Inherited members also receive a separate `` // Inherited from `Base` `` line that names their original declaring type, not the nearest base type.
When the declaring type belongs to another package, the line includes `` in package `package-name` ``.
These source annotations remain visible when tag and undocumented-notice output are disabled.
A locally declared override does not receive a source annotation, even when its documentation is inherited.
`additionalTags` defaults to `["@sealed", "@virtual", "@override", "@eventProperty", "@deprecated"]` for declarations and members, matching API Extractor.
A supplied list replaces these defaults; use `[]` to hide all additional tags, or include other recognized tags such as `@input` or `@legacy` as needed.
Annotations show the release tag first, then enabled standard tags in the order above, then other configured tags in the supplied order, and finally the undocumented notice.
Standard-tag ordering does not depend on source comment order or configured list order.
Repeated configured tags appear once.
Additional names match report metadata exactly. Unknown or absent names display nothing; this option does not register custom TSDoc tags.
Release tags are controlled only by `includeReleaseTags`, not `additionalTags`; adding a release tag to `additionalTags` does not restore member release annotations.
Permitted untagged items have no release annotation.
The report builder preserves recognized modifier metadata and parsed block-tag presence for presentation.
Analysis uses the official TSDoc parser for effective-content detection; report generation reads only completed data.

`includeUndocumentedNotice` defaults to `true`. Absent, empty, and tag-only comments receive `(undocumented)` annotations.
Descriptive text in an effective summary or block, code, and validated API or URL links count as documentation.
An explicit inheritance request counts only through its successfully resolved content.
Missing targets, cycles, ambiguous overload targets, invalid TSDoc, and invalid API links prevent successful report construction.
Inherited links retain their original targets and must also satisfy the receiving API's original release policy.
This status measures content presence, not documentation quality or completeness.

Same-package explicit inheritance, selected-suite resolution, and automatic member report integration are implemented for the supported scope.
The [Stage 2 documentation-resolution plan](docs/api-extractor-replacement-implementation-plan.md#resolve-documentation-before-report-construction) records remaining declaration and reference acceptance work.
The resolver's automatic inheritance rule treats any local TSDoc comment, including an empty or tag-only comment, as an override.
Versioned dependency-model loading and structural validation now run before compiler extraction.
Portable-model serialization and source-free downstream consumption are implemented.
Disabling the annotation does not disable documentation validation or change selected APIs.
Display settings never remove metadata from the report model and do not alter semantic policy.

The following options retain release tags, display Fluid-specific metadata, and suppress undocumented annotations:

```typescript
const presentation = {
	additionalTags: ["@sealed", "@input", "@legacy"],
	includeUndocumentedNotice: false,
};
```

The package's single `@packageDocumentation` comment appears before the selected declarations when present.
No missing-package-documentation annotation is emitted when it is absent.
General report-format customization is a separate follow-up after rough API Extractor parity.
The text uses LF line endings and one final newline. It excludes API-item source comments, implementation bodies,
source locations, provisional IDs, and compiler versions. It is review text, not a declaration rollup.
Both operations perform no compiler queries or filesystem writes and do not mutate their inputs.
Full-report tests compare generated output with checked-in snapshot files.
Documentation, report, and compiler-backed snapshot tests use `assertSnapshot` from [the shared snapshot utilities](src/test/snapshotUtils.ts).
The utility compares exact UTF-8 text, including whitespace and line endings, and returns the expected text for additional assertions.
Tests use explicit file names so that multiple tests can check the same baseline.
Missing files and unequal text fail the test.
Normal tests never create or update snapshots.
Review snapshot diffs explicitly when intentionally changing the report format or fixture API.

The internal baseline comparison accepts generated report text without interpreting its syntax.
`compareReviewBaseline(actual, expected)` performs a pure, exact string comparison.
An `undefined` expected value means that no accepted baseline exists; an empty string is an existing empty baseline.
Missing and stale baselines return `baseline-missing` and `baseline-stale` diagnostics respectively.
Neither case contains a partial success value or accepts the generated text.
Line endings, whitespace, and the final newline are significant. Deterministic report generation must normalize its own output.

The caller reads baseline files and writes accepted text through its own file I/O.
The former library file-check and file-update wrappers have been removed.
Baseline acceptance must remain an explicit caller action after required validation and parity checks succeed.
Generating report text never creates directories, writes artifacts, or accepts a baseline.

Compare two generated surface texts directly to check parity without writing either text to an accepted baseline.
The caller must use the same review identity and rendering options for both surfaces.
This increment establishes baseline handling only; it does not satisfy the Stage 2 review-output or parity gates.

## Experimental API

Package exports are limited to anticipated user-facing workflows.
`analyzeAPIs` is the only exported function, alongside `ReleaseLevel`, `DiagnosticCode`, and supporting types.
Configuration resolution, classification, selection, documentation processing, report rendering, and baseline comparison are internal operations.
The returned `APIAnalysis` exposes immutable effective `configuration`, `getStatistics()`, `generateReport(entrypoint, selection, presentation?)`, and `generateModel()`.
`generateModel()` returns version 1 portable documentation as JSON with a final newline, independently of report selections.
Declaration-rollup methods remain required future work; no placeholder methods are exposed.

The following example analyzes a package once and generates public report text without writing a file.
The configured project must include the declaration entrypoint and its dependencies.
All relative configuration paths use the supplied working directory, including paths inherited from base configurations.

```typescript
import { analyzeAPIs, ReleaseLevel } from "api-analyzer";

const result = await analyzeAPIs(
	{
		packageName: "example-package",
		project: "tsconfig.api.json",
		entrypoints: [{ name: ".", path: "lib/index.d.ts" }],
		rules: { requireReleaseLevel: true },
	},
	process.cwd(),
);

if (!result.ok) {
	throw new Error(JSON.stringify(result.diagnostics));
}

// Compiler resources are already disposed. Reports reuse private, prepared data.
const analysis = result.value;
const report = analysis.generateReport(".", {
	name: "public",
	releaseLevels: [ReleaseLevel.Public],
});
if (!report.ok) {
	throw new Error(JSON.stringify(report.diagnostics));
}
console.log(report.value);
console.log(analysis.getStatistics());
```

`analyzeAPIs` returns structured diagnostics for missing settings, invalid entrypoints, duplicate names, inheritance cycles, compiler diagnostics, and supported semantic validation failures.
`packageRoot` defaults to the supplied working directory.
Supplied arrays replace inherited arrays. Rule maps merge by key.
An explicit `false` rule value overrides an inherited `true`.
`rules.requireReleaseLevel` and `rules.validateTsdocSyntax` control classification and default to `true`.
`rules.requirePackageDocumentation` controls package-comment presence and defaults to `false`.
Documentation binding and resolution still require valid TSDoc even when classification tolerates syntax errors.
`customModifierTags` registers the same modifier vocabulary for classification and documentation processing.
Compiler options and module resolution conditions come from the selected TypeScript project.
Use separate project configurations for different conditions.

Success is `{ ok: true, value: analysis }`; expected failures contain diagnostics and no partial analysis.
Internal assertions and unexpected operational failures reject the promise.
`getStatistics()` returns immutable `entrypoints`, `declarations`, and `signatures` counts.
These count collected declarations, including unexported targets, and their callable signatures; effective member-view signatures are not counted again.
They are API counts, not analysis-performance or cache counters.
`generateReport` returns `Result<string>` for the supported declaration forms described above.
An invalid selection or unknown entrypoint produces diagnostics; unsupported declaration forms still throw.
Multiple reports can use different selections and presentation options without reanalysis.

### Operation results

`Result` without a type argument represents a validation-only operation: success is `{ ok: true }` with no `value` property.
Use `Result<TValue>` when success produces a payload.
The property is required even when the payload type explicitly includes `undefined`.
`never` is the default no-payload marker; other explicit types, including `void`, remain payload types.
Payload unions are preserved as a single success branch rather than split into a union of successes.
Always narrow on `ok` before reading `value` or `diagnostics`.
Failure results have diagnostics and no partial value.

The following declarations distinguish successful validation from a successful lookup that found no value:

```typescript
import type { Result } from "api-analyzer";

const validated: Result = { ok: true };
// A lookup can succeed without finding a value; the payload property still exists.
const lookup: Result<string | undefined> = { ok: true, value: undefined };
```

Internal validation helpers and baseline comparisons use the value-less form.
Reference lookups retain explicit `undefined` payloads where absence is part of a successful lookup result.
The internal `reportFailure` helper returns the failure branch directly so either kind of operation can propagate it.
Result types do not themselves guarantee immutability; each operation documents whether it freezes its results.

### Retained analysis facts

Declaration and signature identities are provisional. Tests cover separate aliases, namespaces, merged declarations, overload reordering, and checkout relocation.
They do not establish a complete identity scheme for multiple installed versions of the same package or every anonymous and computed declaration.
Member facts preserve effective type text, optional and readonly state, and declaration locations.
Incomplete member expansion produces `partial` and diagnostics while preserving the original declaration text.
Signature documentation contains only the closest compiler-attached TSDoc comment, including delimiters, or `undefined` when absent.
Ordinary comments do not count as TSDoc. Explicit empty TSDoc comments remain present.
The enclosing declaration fact retains full source declaration text separately; signature `text` retains the printed function type.
JSON serialization omits `undefined` documentation fields. Reading an omitted field returns `undefined`, while explicit empty comment strings remain intact.
These comments are not parsed or resolved documentation models.
Declared constructors and index signatures retain detached syntax and original documentation records.
The fact format still does not represent every type-reference form.

### Suite configuration and models

`suite.packages` selects installed dependencies by exact package names or Node.js glob patterns.
Discovery follows direct, transitive, and peer dependencies.
`suite.modelFile` identifies the model artifact relative to each selected package root.
Absolute paths and parent traversal are rejected.
Every selector must match an installed dependency.
Every selected model must exist and validate, even if no API uses it.
Multiple selected installations with the same package name are rejected as ambiguous.
External model identities must resolve to the selected suite.

The following configuration enables dependency documentation and independent reference policies.
The repository-specific `@legacy` rule is ordinary configuration, not built-in behavior.

```typescript
import { analyzeAPIs, ReleaseLevel } from "api-analyzer";

const levels = [ReleaseLevel.Public, ReleaseLevel.Beta, ReleaseLevel.Alpha, ReleaseLevel.Internal];
const result = await analyzeAPIs({
	packageName: "example-consumer",
	project: "tsconfig.api.json",
	entrypoints: [{ name: ".", path: "lib/index.d.ts" }],
	customModifierTags: ["@legacy"],
	// Selected dependency packages must generate this artifact before consumer analysis.
	suite: { packages: ["@example/*"], modelFile: "api-model.json" },
	referencePolicies: {
		releaseCompatibility: true,
		entrypointExposure: true,
		inheritanceVisibility: true,
		directional: [{
			name: "no-current-to-legacy",
			// The reverse relationship remains permitted unless another rule rejects it.
			source: { releaseLevels: levels, excludeTags: ["@legacy"] },
			target: { releaseLevels: levels, requireTags: ["@legacy"] },
		}],
	},
});
if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
// Callers choose whether and where to write the artifact.
const modelText = result.value.generateModel();
```

The artifact identifies format `api-analyzer-documentation`, version `1`, identity version `1`, and compiler version `7.0.2`.
It retains original metadata, resolved documentation, link and section origins, callable parameter facts, exported paths in overload order, external identities, and hashes of analyzed package files.
The optional `packageDocumentation` record retains the package's own comment and source location independently of API records and export paths.
Decoding validates its syntax, supported tag usage, package ownership, and recorded input file.
The codec validates schema, package identity, uniqueness, target integrity, resolved TSDoc syntax, and stored link occurrences.
Export records distinguish static and instance members and can reference a shorter enclosing namespace path.
These back-references allow paths such as `Group.self.self.run` without serializing an infinite export tree.
The decoder checks that each back-reference points to an enclosing canonical record with the same target identities.
Imported dependency overload references use compiler declaration order, not the identity-sorted API array.
Regenerate experimental dependency models to obtain the retained member-side, recursive-path, and declaration-kind data.
API records require a nonempty, deduplicated `declarationKinds` array that includes their primary `kind`; compound declarations retain every contributing kind.
Records also retain original labels, and exported member paths retain unique-symbol key identities separately from printed names.
Regenerate experimental models after these schema changes; resolved section records can contain multiple sources for one combined section.
Dependency comments are parsed for structural validation and content copying, but their targets and inheritance chains are not resolved again.
The `graph` retains all collected declaration shapes, including referenced suite declarations, entrypoints, namespaces, aliases, and original source locations.
Effective members preserve generic substitutions, optionality, readonly state, original declaring containers, and ordered callable overloads.
Signatures retain original source plus effective, reduced, and normalized text.
Declaration and member references store resolved targets; consumers must not infer identity from printed type text.
Container records retain constructors, statics, accessors, enum values, and special signatures separately from effective members; source locations identify overlapping representations.
Direct instantiated heritage views and target links preserve ancestry; receiving member views already contain transitive substitutions.
Partial views retain their original type text and limitations and must not be presented as complete.
The graph is not a TypeScript type algebra, a restored analysis, or a declaration rollup.
The loader rejects missing or changed analyzed package files by comparing their SHA-256 hashes before consumer analysis.
The model also records canonical content fingerprints of every selected dependency model used during analysis.
Suite loading compares those fingerprints before accepting stored inherited content, including when the consuming package does not reference it.
After a dependency model changes, regenerate downstream models in dependency order.
JSON whitespace and object-key order do not affect model fingerprints; array order remains significant.
During initial development, `version` and `identityVersion` remain 1 even when the schema or identity rules change.
There are no backward compatibility requirements during this period; matching version markers do not imply compatibility between development artifacts.
Regenerate experimental artifacts in dependency order after schema or identity changes; readers still validate the current required structure and reference integrity.
Identity rules remain tied to compiler version 7.0.2 and the analyzed inputs.
Identifiers are opaque and stable for equivalent inputs, not guaranteed across source edits or compiler upgrades.

### Source-free model readers

Import `decodeDependencyModel` and `decodeDependencyModels` from `api-analyzer/model` to avoid loading compiler-backed analysis.
The same functions and the `DependencyModel` type are also available from the main entrypoint.
The single-model reader validates shape, documentation syntax, and internal identity integrity.
It derives exported paths from the portable graph and rejects missing or inconsistent nested paths, member sides, aliases, and ordered targets.
The model-set reader additionally rejects duplicate packages or API identities, missing recorded dependencies, stale dependency fingerprints, and inconsistent cross-package targets.
Both return frozen data and perform no filesystem access or semantic reference resolution.
Installed-suite loading reuses these checks and additionally verifies declaration input files on disk.
Publication and retention of maintained historical documentation artifacts remain Stage 5 integration work; this experimental reader does not replace the existing published-artifact readers.

The following example reads caller-supplied artifact content and lists exported names without a source checkout:

```typescript
import { decodeDependencyModels } from "api-analyzer/model";

function listExports(inputs: readonly { packageName: string; text: string }[]): string[] {
	const result = decodeDependencyModels(inputs);
	if (!result.ok) {
		throw new Error(result.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
	}
	// All recorded dependencies must be supplied, including those unused by a selected page.
	return result.value.flatMap((model) =>
		model.graph.surfaces.flatMap((surface) =>
			surface.exports.map((binding) => `${model.packageName}:${surface.name}:${binding.name}`),
		),
	);
}
```

Join a graph item's `documentationId` to local `apis` or the owning model identified by `external`.
Use `graph.declarations` for types and members, `exports` for documented paths and overload selectors, and stored link targets for page links.
Traverse namespace exports with an identity-based visited set because aliases can form cycles.
The [suite tests](src/test/suite.test.ts) consume models in a fresh process with compiler imports blocked after the declaration input is deleted.
The [native tests](src/test/nativeCapabilities.test.ts) verify portable inheritance, intersections, utility types, and round trips with both supported input compilers.
The checked-in [dependency](src/test/snapshots/dependency.api.json) and [consumer](src/test/snapshots/consumer.api.json) snapshots preserve complete sample artifacts as format references.
Tests compare them byte-for-byte and consume the pair without compiler imports.
See the [fixture guide](src/test/fixtures/suite/README.md#portable-model-snapshots) for their coverage and update procedure.

### Structured code excerpts

Models retain producer-resolved reference tokens for linked code display.
The representation takes inspiration from API Extractor's [excerpt tokens and token ranges](https://github.com/microsoft/rushstack/blob/main/libraries/api-extractor-model/src/mixins/Excerpt.ts) and [AST-based excerpt builder](https://github.com/microsoft/rushstack/blob/main/apps/api-extractor/src/generators/ExcerptBuilder.ts).
Our implementation uses readonly data and functions, not mutable excerpt classes or long-lived builders.

Each excerpt has `tokens` and a `tokenRange` with inclusive `startIndex` and exclusive `endIndex`.
`Content` tokens carry ordinary text; `Reference` tokens also carry a resolved declaration `target` in `graph.declarations`.
Token boundaries are presentation boundaries, not TypeScript lexical tokens.
Readers concatenate the tokens in the range and use stored targets for links without resolving names or reading source files.
Local type parameters, compiler-library references, and references outside the selected suite remain content rather than invented API links.

`ModelSource.excerpt` preserves original source text, including comments, for declarations and separately stored constructors, accessors, static members, and special signatures.
Each signature view supplies `callSignatureExcerpt` and `functionTypeExcerpt`, whose text exactly matches that view's existing strings.
Effective, reduced, and normalized views retain their own tokens; reducing an alias to a primitive removes the alias reference from that view only.
`ModelMember.typeExcerpt` supplies complete compiler-printed type syntax, which can have different whitespace from the compact `type` string.
Use the excerpt tokens as the authoritative linked display rather than applying source offsets to a different text view.

The [compiler excerpt module](src/analysis/compilerExcerpt.ts) performs lookup and printing through explicitly supplied compiler services.
The adapter supplies the suite-membership and declaration-identity policy; the excerpt module has no dependency on adapter state or compiler lifetime management.
Original excerpts use compiler-bound source spans.
Generated views use scoped compiler name lookup with explicit type-parameter binders and compiler-produced import names for substituted types.
Printing a transformed AST with temporary reference markers identifies token boundaries; exact reconstruction checks ensure that markers do not change the original output.
Pure functions assemble token data, and the model layer validates ranges, reconstructed signature/source text, and declaration targets without semantic re-resolution.
The [compiler excerpt boundary tests](src/analysis/test/compilerExcerpt.test.ts) verify aliases, imports, local binders, nested substitutions, reference exclusion, deterministic output, and unchanged input nodes.

The native test `captures exact excerpt targets across aliases, binders, and substituted scopes` checks both input compilers and renders links in a fresh process with compiler and analysis imports blocked.
It covers repeated and qualified names, imported aliases and import types, type/value namespace shadowing, nested and mapped binders, conditional inference, generic substitution, and declaration members.
Decoder regressions reject missing excerpts, invalid ranges, text mismatches, and dangling targets.
Format and identity versions remain 1 during this development change; regenerate older development artifacts.

### Reference policies

Reference facts retain original syntax occurrences and additional named targets discovered in effective property, variable, and callable types.
Native compiler traversal covers anonymous object types, instantiated arguments, tuples, index signatures, callbacks, unions, intersections, indexed access, and conditional types without parsing printed types.
Traversal stops at named declarations and outside-suite boundaries; named declarations within the suite retain their own independently validated references.
The suite consists of the analyzed package and resolved selected dependency packages.
Compiler-library and outside-suite types retain their original report syntax and an explicitly incomplete member view instead of classifying external members as package APIs.
Local overrides and suite-owned type arguments remain subject to validation.
Inherited member views retain effective types and original metadata for reports and models, but do not undergo repeated reference-policy validation on each receiving container.
Validation checks the original declarations and the receiver's own relationships, including heritage clauses and local overrides.

`referencePolicies.releaseCompatibility` rejects locally declared references from a more-public API to a less-public target.
`entrypointExposure` checks same-package declaration targets without requiring dependency types to be re-exported by a consumer.
`inheritanceVisibility` rejects explicit inheritance from internal targets when the receiver is non-internal.
These three switches default to disabled and are independent of report selection.
Directional rules use the ordinary release and custom-tag selectors on both source and target metadata.
Each directional rule defaults to enabled and can be disabled with `enabled: false`.
Inherited `referencePolicies` and `suite` objects are replaced as complete values by local configuration.
API links retain their separate non-internal-to-internal restriction; public-to-beta links remain valid.
Invalid configuration or reference relationships produce diagnostics without partial analysis.

### Verification scope

Native fixtures built with TS6 and TS7 verify detached member reports, namespace filtering, type-only aliases, and built-in-shadow exclusion.
Suite tests verify direct, peer, and transitive model resolution, original scope through re-exports, and missing or malformed unused models.
Separate Node/browser TypeScript projects verify real conditional-export parity without baseline writes.
The repository pilot reads built core-utils comparison declarations and applies a configured legacy rule without changing production build integration.
The self-artifact regressions use the package's emitted entrypoints, compare the complete report and portable model without writing, and check every named export against the TypeScript AST.
They also check resolved model references, generation from another working directory, independent artifact selection, and read-only failures for stale or missing baselines.

## Package API report

The checked-in [complete API report](api-report/api-analyzer.api.md) is generated by this package's own analyzer, not API Extractor.
The shared [artifact script](src/generateApiArtifacts.ts) analyzes compiled declarations from [src/index.ts](src/index.ts) and [src/model.ts](src/model.ts), using [tsconfig.api-reports.json](tsconfig.api-reports.json).
The report uses every release level and no custom-tag filters, so it covers the complete named export surface of the root entrypoint.
Public API declarations carry explicit release tags; members inherit their declaring container's tag.

Generate and review an intentional API-report update with this command:

```sh
pnpm build:tsc
pnpm build:api-reports
```

Check that the existing report is current without modifying it:

```sh
pnpm build:tsc
pnpm check:api-reports
```

The artifact commands require compiled declarations; they do not compile the package themselves.
They fail when analysis or report generation fails.
Check mode also fails for a missing or stale report.
`pnpm build` compiles the package and runs `pnpm build:api-artifacts`, which generates both the report and the portable model from one analysis.
`pnpm build:tsc` compiles without updating either artifact.
When checking existing baselines, run compilation and check commands before any artifact-generating build.
Tests do not update the report; the [pilot regression](src/test/pilot.test.ts) uses check mode.
The report is a review artifact, not a declaration rollup: references to private support types can remain without their definitions.
Portable documentation graphs retain these relationships; self-contained consumable declaration output remains a Stage 4 requirement.

## Package API model

This library intentionally checks in its [portable API model](api-model/api-analyzer.api.json) so model-format and content changes can be reviewed over time.
This is an exception for the analyzer's own development and Stage 3 evaluation, not a requirement to check in generated models for other packages.
It does not establish Stage 3 acceptance or replace the Stage 5 publication and historical-artifact work.

The model includes the root and `./model` entrypoints, supporting declarations, resolved documentation, structured excerpts, and input fingerprints.
It preserves the encoder's exact JSON output, including identities and source locations.
Source edits can therefore change identities, locations, and fingerprints even when the schema does not change.
The effective member and signature views can repeat source content, so the artifact is larger than the API report.
Do not edit or reformat it by hand, and review generated changes before accepting a new baseline.
Format and identity versions remain 1 during initial development; this baseline does not add backward compatibility guarantees.

Generate only the model after compiling the package:

```sh
pnpm build:tsc
pnpm build:api-models
```

Check the existing model without modifying it or creating a missing file:

```sh
pnpm build:tsc
pnpm check:api-models
```

The model check fails when the baseline is missing or differs from the generated content.
Normal tests compare the checked-in model without updating it.
Tests that exercise write mode use temporary package copies, not the checked-in baselines.

## Commands

Run these commands from this package directory to install pinned dependencies and execute the investigation:

```sh
pnpm install
pnpm lint
pnpm build
pnpm test
pnpm check:api-reports
pnpm check:api-models
pnpm check:format
```

The package has an independent workspace and lockfile so it does not change the client release group's compiler.
The test build uses TS7.
TS6 supplies the conventional compiler API required by ESLint and also builds fixtures and checks declaration consumers.
It is not an analysis fallback.
Run `pnpm build` before testing and after changing TypeScript sources or tests.
`pnpm test` runs the compiled tests without building, including native capability and declaration-consumer checks.
[.mocharc.cjs](.mocharc.cjs) uses CommonJS, discovers every compiled `lib/**/test/**/*.test.js` file, and sets a 20-second timeout.
New test modules are included automatically; do not maintain suite-name allowlists in package scripts.
`pnpm exec mocha` runs the compiled suite without building first.
There is one test script and one configuration; no separate contract or investigation runner is required.
Test names describe behavior. Applicable design identifiers appear in comments above tests.
The two retained-program declaration-emission probes and the native asynchronous crash probe use `it.skip`.
Mocha reports them as pending, not passing.
Each has a TODO that identifies the development stage, blocker, and condition for re-enabling or replacing the probe.
Remove `.skip` when investigating the capability and restore it if the documented blocker remains unresolved.
Skipping a probe does not waive its delivery requirement or establish that the capability works.
Keep discovery, timeout, and other shared Mocha options in the configuration file rather than package scripts.

For a focused check after building, bypass automatic discovery and supply the desired file explicitly.
The following command runs only the report tests:

```sh
pnpm exec mocha --no-config lib/report-generation/test/reviewReport.test.js --timeout 20000
```

Mocha otherwise adds the configured `spec` glob to command-line file arguments.
Layer tests live under each implemented layer's `test` directory.
Cross-layer compiler and public API tests remain in `src/test`, with shared test helpers, fixtures, and snapshots.
After moving or deleting modules, remove their stale generated files before rebuilding; TypeScript does not remove old output files automatically.

### Linting

[eslint.config.mts](eslint.config.mts) uses the `strict` preset from the in-repo `@fluidframework/eslint-config-fluid` package.
`pnpm lint` checks the package with zero warnings allowed.
It also runs `pnpm check:fences` to enforce directory dependencies.
Use `pnpm lint:fix` to apply automatic fixes, then rerun the build and contract tests.
Some fixes require manual review, especially changes to imports or test assertions.
Biome remains the formatter; run `pnpm check:format` after lint fixes.

The package enables ESLint's `curly` rule with `all` and ESLint Stylistic's `lines-around-comment` rule.
Use braces for control-flow bodies and a blank line before standalone comments that follow code.
Opening block and type boundaries need no extra blank line, and consecutive comment lines remain grouped.
Put explanations before multiline expressions instead of between boolean operands so both tools preserve the same layout.
No custom lint rules are used for these checks.

Use `assert(value !== undefined)` or `assertDefined` for presence checks, and `assert(condition)` for boolean invariants.
Use `assert.ok` only when truthiness itself is the intended condition.

The ESLint configuration documents shared allowances for Node.js built-ins and official TypeScript subpath imports.
A test-wide rule exception permits JSON round-trip tests instead of in-memory cloning.
File-local ESLint directives explain exceptions for compiler symbol bit masks and intentional `null` states.
Generated output and [compiler fixture inputs](src/test/fixtures/README.md) are excluded from ESLint.
Biome formatting, linting, and assists are disabled for compiler fixtures so tests can retain intentional syntax and layout.
The compiler tests validate those inputs in temporary projects; normal tests never reformat the checked-in fixtures.

[pnpm-workspace.yaml](pnpm-workspace.yaml) gives the shared lint configuration its own TypeScript 6 dependency.
This keeps the lint plugins compatible without replacing the analyzer's native TypeScript 7 dependency.
Comments explain the compatibility overrides, reviewed trust exceptions, and allowed dependency build scripts.
The package retains strict peer dependency checks and supply-chain policies.

### Dependency boundaries

Per-directory `fence.json` files define permitted imports and exported modules.
Analysis and reporting can import shared contracts and utilities but cannot import one another or the root API.
Shared contracts cannot import compiler or parser implementations.
Test helpers are accessible only to tagged tests, not production modules.
The boundary regression uses temporary import probes with the real fence files, including `.js` specifiers, type-only imports, and re-exports.

`good-fences` 0.10.0 is pinned as an MIT-licensed development dependency.
The JavaScript project is no longer maintained upstream; changes to its version require the boundary regression to pass.
Version 1.2.0 was blocked by a Git-hosted transitive dependency under the current supply-chain policy.
Version 1.1.0 requires native `nodegit` even for a full check; 0.10.0 avoids that dependency and runs without additional build permissions.
No supply-chain policy exceptions or compiler-version overrides were added for this tool.
Its own TypeScript dependency inspects imports only; the analyzer continues to use the pinned native TS7 engine for semantics.
ESLint permits local source paths because good-fences owns layer rules, while external subpath restrictions remain in ESLint.

## Stage 0 results

Verified on 2026-09-15 in the Linux codespace after restarting the interrupted session.
The package build and `pnpm check:format` pass.
At the end of Stage 0, `pnpm test` reported **19 passing tests and 3 failing tests** and exited unsuccessfully.
The capability gaps remain unresolved. Their probes now use `it.skip` with stage-specific TODOs.
A passing test run with these pending probes does not establish readiness for production integration.

The analysis engine is TS7 7.0.2. Input builds use TS6 6.0.3 and TS7 7.0.2.
The package remains private with an independent lockfile; this does not resolve the publication decision.

### Verified capabilities

The [native capability tests](src/test/nativeCapabilities.test.ts) run the same assertions against declarations built with both compiler versions.
They verify:

- Declaration inputs have no syntactic, semantic, or program diagnostics for the small fixture.
- Public aliases retain their names and share the expected target identity. Export syntax distinguishes type-only paths.
- Generic class and interface members specialize to the expected consumer type.
- Ordinary intersections and the tested combinations of `Pick`, `Omit`, and `Readonly` expose the expected members.
- Public type-node conversion exposes effective readonly and optional modifiers.
- Two callable overloads retain their separate comments and release tags after declaration emit.
- Printing the existing complete declaration files produces output that compiles with both consumer compilers. This covers all four input-build and consumer-compiler combinations.
- A repeated export lookup returns the same cached result with zero recorded compiler requests. Several semantic queries use the same retained snapshot and project.

The [lifecycle tests](src/test/lifecycle.test.ts) and [worker](src/test/lifecycleWorker.ts) also verify synchronous and asynchronous normal disposal in bounded Linux worker processes.
The synchronous client passes a source-based semantic query, cached lookup, snapshot-disposal checks, and a native-process termination probe.
The harness terminates the worker process group during cleanup, including after a failed test.

### Blockers and limits

| Finding | Evidence | Consequence |
| --- | --- | --- |
| No retained-program declaration emission in the tested API | The `retained Program exposes declaration emission` test fails for each input compiler because the program exposes neither `emit` nor `getDeclarationEmit`. Its comment identifies it as a temporary W5 capability probe. | Review the generation strategy before production implementation. This is a missing capability in the tested approach, not proof that W5 is impossible through every public API. |
| Async request does not settle after native termination | The async crash worker exits with code 13 and an unsettled top-level await at `assert.rejects(api.getTimingInfo())`. | Do not select the async client without resolving or containing this failure through an approved design. The test does not establish the behavior of every operation or failure mode. |
| Reuse evidence is narrow | A cached export query records zero requests; related queries retain their snapshot. | This does not measure compiler-wide recomputation or prove reuse across implemented reports, validation, models, and declarations. Those tasks do not exist yet. |
| Generation evidence is narrow | Existing declaration source files are printed and consumed successfully. Fixture declaration builds invoke the compiler CLI separately. | Neither operation proves trimmed rollups, dependency inclusion, import cleanup, or generation from retained semantic analysis. |
| Lifecycle evidence is platform-specific | Process checks use Linux `/proc` and process groups. | Windows and macOS lifecycle behavior is unverified. Test cleanup is not a production lifecycle implementation. |

At the end of Stage 0, the full semantic fixture suite used the async client and the synchronous client had only the smaller comparison described above.
Stage 1 reran the full fixture suite through the synchronous client before using it for the experimental session.
The async crash reproduction remains separate and unresolved.

No full W/F/B requirement is closed by this investigation.
Cross-package documentation resolution, custom policy, release filtering, stable artifact identities, invalidation, cancellation, and representative repository packages remain untested.
No production analyzer API, custom compiler bridge, compiler patch, or migration was added.

### Review decisions

1. **Declaration generation:** Decide whether to evaluate a newer published TS7 API or an existing compatible generation component. Preserve the shared-analysis requirement. Do not assume development-only emit APIs are released or silently use TS6 analysis.
2. **Client selection:** Consider the synchronous client for the next stage, then run the full semantic suite through it and document blocking, cancellation, and crash behavior before approval.
3. **Capability gate handling:** Keep the reproductions visible. Decide how to separate investigation gates from a future required production test suite without representing unresolved capabilities as passing.
4. **Upstream follow-up:** Confirm current upstream coverage for both findings and record exact issue links before filing a new report. This resumed verification has not established those links or filed issues.

Stage 0 has produced a scaffold and reproducible capability evidence, including failed gates.
The declaration-generation strategy and upstream reproductions remain open follow-ups. Stage 1 proceeds independently of those generation gates.

## Stage 1 results

Verified on 2026-09-15: all 29 tests selected by the former `pnpm test:stage1` command passed as part of `pnpm test:contracts`.
The build and formatter pass.
The earlier full `pnpm test` run reported 34 passing tests and the same 3 unresolved Stage 0 failures.
That full-suite count predates the additional configuration and extraction-helper tests.
The full suite was not rerun for the helper extraction refactor or the test-name changes.

The [configuration tests](src/test/configuration.test.ts), [one-shot analysis tests](src/test/session.test.ts), [native capability tests](src/test/nativeCapabilities.test.ts), and [lifecycle tests](src/test/lifecycle.test.ts) now cover the revised contracts.
They verify ordered configuration inheritance, immutable effective settings, fresh analysis after input changes, and cleanup on success and failure.
The analyzer processes declarations built with TS6 6.0.3 and TS7 7.0.2 through TS7 7.0.2.
The full synchronous semantic suite also passes the original semantic and printing checks; the missing emit-method gates still fail.

Additional tests verify chained type-only exports, namespace and merged declaration facts, effective members, separate overload identities, and explicit incomplete expansion.
Node and browser dependency fixtures retain their distinct types and package origins.
Tests verify changed-input results and identical facts after checkout relocation.
Report tests instrument parser and compiler calls to verify reuse after analysis, including after input files are removed.
Linux worker tests verify disposal before one-shot completion and retain separate native compiler crash probes.

The adapter's extraction helpers are module-level functions with explicit dependencies.
They are exported from the internal adapter module for tests, not from the package entrypoint.
Each extraction owns its package-location cache and declaration tracking state.
Compiler-dependent helper tests use the existing real-compiler fixtures instead of compiler mocks.
Direct tests cover package locations, aliases, type-only exports, members, signatures, and declaration collection.
They also check cache separation, repeated collection, and the active-identifier guard.

The implementation uses pure configuration and immutable data, with native communication, filesystem access, and local extraction caches isolated inside the analysis invocation and adapter.
It does not close the full W/F/B requirements or resolve the Stage 0 declaration-generation limitation.

## Initial Stage 2 results

Verified on 2026-09-15: `pnpm test:contracts` passes 45 tests.
This includes 29 analysis and configuration contracts, 12 [classification and selection tests](src/analysis/test/classification.test.ts), and four real-compiler integration cases.
Tests distinguish absent, ordinary, explicit empty, and tagged comments through source analysis and TS6/TS7 declaration emit.
They preserve that distinction after session closure and JSON serialization, and verify that documentation excludes declaration text.
Tests fix the numeric release-level ordering and verify that selections remain explicit sets rather than thresholds.
The new contract tests first failed against implementation stubs, then passed after implementation.
The integration cases classify and select detached callable overload facts after the analysis session closes, using declarations built with TS6 and TS7.
They check that the untagged implementation signature is absent, the public selection excludes the internal overload, and the original facts remain unchanged.

The classifier uses pinned `@microsoft/tsdoc` 0.16.0 from the Microsoft TSDoc project, under the MIT license.
The dependency is installed only in this package's independent workspace.
Classification and selection return frozen metadata without compiler objects. They do not construct review artifacts or alter declaration text.
The subsequent baseline-handling increment implements comparison and explicit updates as described below.
Structured reference facts, cross-package validation, review generation, and the repository pilot remain open Stage 2 work.
The full compiler investigation suite was not rerun for this increment. Its recorded failures remain unresolved, and no full W/F/B entry is closed.

### Baseline handling increment

Verified on 2026-09-15: `pnpm test:contracts` passes 48 tests. The build, formatting, and whitespace checks pass.
The [baseline tests](src/report-generation/test/reviewBaseline.test.ts) add three acceptance cases to `test:contracts`.
They check exact comparison, absent versus empty baselines, read-only checks, explicit creation and replacement,
relative-path diagnostics, and propagation of unexpected filesystem errors.
The tests first failed because the public baseline APIs were absent, then passed after implementation.
This increment does not generate reports or validate declaration references. It establishes the independent baseline boundary for report-generation work.

### Function report increment

Verified on 2026-09-15: `pnpm test:contracts` passes 54 tests. The build, formatting, and whitespace checks pass.
The revised API Extractor-like layout adds configurable tag display and undocumented annotations, with configured and alias-only snapshots.
The [report tests](src/test/reviewReport.test.ts) compare complete generated output with checked-in
[public](src/test/snapshots/functions.public.md), [complete](src/test/snapshots/functions.complete.md), and [empty](src/test/snapshots/functions.empty.md) snapshots.
Tests also check deterministic export ordering, significant overload ordering, metadata and signature changes, input ownership, and diagnostic versus exception behavior.
The [real-compiler tests](src/test/nativeCapabilities.test.ts) build the same function fixture with TS6 and TS7.
They classify once and render public and complete reports after closing the session, with one analysis and unchanged original facts.
Normal tests only read snapshot files. When intentionally changing output, update the affected snapshot and review its full diff; never accept a new snapshot merely to make a test pass.
This remains a function-only report implementation. General declarations, semantic reference validation, actual conditional-entrypoint parity, and the repository pilot remain open Stage 2 work.

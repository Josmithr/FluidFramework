# api-analyzer

This private ECMAScript module (ESM) package provides an experimental, reusable analysis session.
It uses the official native TypeScript 7 API and includes the Stage 0 compiler capability tests.
Its API is not stable. It does not generate production artifacts or replace API Extractor.
Publication remains a separate decision.

## Development contract

Follow the [implementation plan](../plans/api-extractor-replacement-implementation-plan.md), including documentation-driven development, test-driven development, and functional architecture.
Write behavior contracts before implementation and run focused failing tests before adding or fixing behavior.
Write documentation in Simplified Technical English and follow the [repository documentation guidelines](../../docs/content/Guidelines/Documentation-Guidelines.md).
Keep compiler communication and process lifecycle separate from pure transformations.
Do not add a custom type checker, use compiler-private APIs, or switch backends to make a capability test pass.

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

Stage 1 implements an experimental synchronous analysis session, not a stable public package API.
Run the full declaration-input capability suite through the synchronous TS7 client before relying on it.
Retain the separate async crash reproduction and declaration-emission investigation gates.

Resolve programmatic configuration with ordered base configurations and explicit overrides.
Use `@eslint/object-schema` to validate property types and merge the ordered layers.
Use the last supplied scalar value, replace supplied arrays, and merge rule settings by rule name.
Treat `null` and `undefined` property values as omitted.
Reject inheritance cycles, missing required settings, and duplicate entrypoint names with structured diagnostics.
Return readonly effective configuration without mutating the supplied configuration objects.
Resolve relative paths from the working directory supplied by the caller, not from the process working directory.

An analysis session owns its compiler connection and cached API facts.
These facts are detached: they contain no compiler objects and remain usable after the compiler snapshot is disposed.
Repeated requests for unchanged inputs reuse the same facts.
Task order and changes to rule settings do not affect reuse.
Explicit invalidation discards cached facts and compiler state before the next request.
Callers must invalidate after relevant changes to inputs or module resolution settings.
Automatic file watching and persistent caching are not part of this stage.
Repeated close calls have no effect. Requests after close fail with a diagnostic that explains how to recover.
An unexpected adapter failure clears owned state and closes the session.
The original error is rethrown. If cleanup also fails, an `AggregateError` retains both errors.
Later requests must not return cached success. Create a new session to recover.
Synchronous calls run one at a time and block the calling Node.js thread.
An active call cannot be canceled.
The session extracts facts and disposes of the corresponding snapshot.
It retains the compiler connection for other configurations and the facts for repeated tasks.
Cached requests do not contact the compiler and cannot detect a compiler-process failure.

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
The adapter reads attached compiler AST comments; it does not recover documentation by parsing printed declaration text.
An unavailable declaration node supplies no comment. JSON serialization omits absent documentation properties.

Both `DeclarationFact.declarations` and `MemberFact.declarations` retain source records with locations, syntax kinds, source text, and original comments.
The member records replace the former location-only `origins` array. Read locations from `declarations`.
Records follow compiler declaration order. Overloads and merged declarations retain separate comments; extraction does not select or combine them.
An effective inherited member retains its original source records, even when generic substitution changes its effective type.
A local override retains only its own declaration comments. An absent or empty override comment does not receive ancestor content during extraction.
These records remain frozen and usable after session closure. They describe original declarations, not resolved documentation.

Compiler tests cover classes, interfaces, inherited generic members, local overrides, overloads, and merged declarations for both supported input compilers.
This is a prerequisite for broader classification and reporting. It does not define merged-comment precedence or implement automatic inheritance.
Class and interface report rendering remains unsupported.

### Effective member identities and signatures

`MemberFact.id` identifies a member on its containing declaration. It combines the declaration identifier with the compiler-printed member name.
An inherited member has different identifiers on different containing declarations, even when its source records are the same.
These identifiers are provisional. They do not identify an ancestor or establish an override relationship.

`MemberFact.signatures` retains effective call signatures in compiler order, with generic substitutions and separate original comments for overloads.
The adapter removes null and undefined from the member type before requesting call signatures. This includes optional methods.
Non-callable members have an empty signature array. Callable properties retain comments from their signature declarations, not copied property comments.
Signature identifiers use the effective member as their owner and retain the limitations documented on `SignatureFact.id`.
Callers can pass these signatures to classification and selection independently. This does not define classification rules for a whole class or interface.

Both input compilers verify overload selection, inherited generic signatures, optional methods, callable properties, and frozen facts after session closure and JSON serialization.
Construct signatures, member documentation lookup contexts, ancestor matching, and class/interface reports remain unsupported.

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
Documentation inheritance is a separate, planned operation: a class member with no local TSDoc can receive content from a compatible implemented interface member.
Any local TSDoc, including an empty or tag-only comment, suppresses automatic inheritance. Explicit inheritance remains a resolution request.
Conflicting interface sources require a diagnostic rather than an arbitrary choice.
Instantiated contract context, member and overload matching, and precedence between class and interface sources remain required before this behavior can be implemented.
Current extraction does not copy interface documentation or change release classification.

## Explicit documentation inheritance contract

`resolveDocumentation(items, bindings, options)` copies documentation for explicit inheritance requests within the same package.
A binding associates a request with its target declaration or signature.
The internal `bindDocumentationReferences(facts, options)` operation produces bindings from supported compiler lookup facts.
It is not exported from the package entrypoint.
Function report construction runs binding and content resolution before applying report selection.

Both operations accept the optional `customModifierTags` array defined by `TsdocOptions`.
The content resolver uses `DocumentationResolutionOptions`, which also accepts API link validation inputs.
The internal binder requires an options argument; pass `{}` for standard TSDoc tags only.
The content resolver permits omitted options, which register only standard TSDoc tags.
Pass the same custom modifier vocabulary to `classifyApiItems`, `bindDocumentationReferences`, and `resolveDocumentation`.
For example, `{ customModifierTags: ["@partner"] }` registers `@partner` as a modifier for each operation.
Register tags used by all supplied comments, including inheritance targets that are not selected for a report.
Each operation creates its own parser configuration and does not change or freeze the caller's options.
Invalid names, duplicate names, and redefinitions of standard tags produce configuration diagnostics.
Unknown tags and malformed comments still fail binding and resolution, even when classification disables its own syntax diagnostics.
Custom modifiers remain local metadata and are not copied from inheritance targets.

Each input supplies an item identifier, the original comment's package name, and its local TSDoc comment or `undefined`.
Each binding supplies a source identifier, the declaration reference printed by TSDoc's `emitAsTsdoc()` method, and a target identifier.
If you construct bindings manually, resolve each target in the original comment's declaration scope.
Verify that the source and target signatures have compatible parameters and type parameters.
The content resolver checks that each request matches one binding, that the identified items exist, and that they belong to the same package.
It also checks for inheritance cycles.
It does not repeat target lookup or parameter compatibility checks.

The following example resolves an explicitly bound function comment without compiler access:

```typescript
import { resolveDocumentation } from "api-analyzer";

const result = resolveDocumentation(
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
These copying rules are fixed. Evaluating configurable rules is a [future follow-up](../plans/api-extractor-replacement-follow-ups.md#configurable-documentation-inheritance-rules).

Use the original inputs for release classification.
Do not classify the resolved comment as a new API item.
An absent or empty target comment supplies no inherited descriptive content.
A target comment that contains only metadata tags also supplies no descriptive content.
The output retains the distinction between absent and present local comments.
This output format can change.
It does not yet contain structured content or the source information for each section that a complete portable documentation model requires.

Invalid syntax, missing or ambiguous bindings, stale bindings, and inheritance cycles return typed diagnostics without a partial success value.
Unexpected processing errors propagate as exceptions.
The resolver does not change inputs, and each call owns its caches.
It does not support automatic inheritance, parameter renaming, custom block or inline tags, or inheritance from other packages.
Requests for inheritance from other packages and requests without explicit targets produce diagnostics.
API links require validated original bindings and classification as described below.
Links to URLs remain unchanged, and the resolver does not access their destinations.
The current resolver does not treat an absent comment as a request for automatic inheritance.
It does not accept ancestor facts as inputs yet.

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
Broader declaration support, automatic inheritance, and suite resolution remain required before Stage 2 is complete.

### Compiler-backed function bindings

`bindDocumentationReferences(facts, options)` uses analysis facts that contain no compiler objects.
It returns deeply frozen bindings sorted by source signature identifier.
During analysis, the official compiler resolves unqualified names, such as `base`, in each function declaration's original scope.
This lookup includes imported aliases.
If the compiler finds no symbol in that scope, the adapter checks the source module's exports for an export alias.
The original declaration scope takes precedence over export aliases.
A re-exporting entrypoint does not change the lookup scope.
The adapter collects inheritance targets even when they are not exported.
A target must still exist in the declaration inputs because TypeScript emission can remove unused private declarations.

`SignatureFact.documentationContext` retains the original location, parameter names, optional parameter flags, rest parameter flags, and type-parameter names.
It also retains the lookup result for an inheritance request.
The analyzer supplies this field for supported standalone function declarations.
Other declaration forms omit it.
An inheritance request without the required context produces a diagnostic.
The binder does not guess a target from its name.
These facts remain usable after the session closes or after JSON serialization.
Their format can change, and they do not represent all declaration references.

The target must be a standalone function in the same package with exactly one callable signature.
Source and target parameter names, order, and count must match.
Optional parameter flags, rest parameter flags, and type-parameter names must also match.
Use local documentation when parameters use destructuring, parameter names differ, or the target has multiple overloads.
These checks protect parameter documentation but do not establish TypeScript assignability.
They do not compare parameter types, return types, generic constraints, or generic defaults.
Qualified references, TSDoc selectors, targets in other packages, and other declaration forms produce diagnostics.
TSDoc selectors identify a specific declaration, such as an overload, within a reference.
Classification, binding, and content resolution share custom modifier configuration through `TsdocOptions`.
Custom block and inline tag configuration and configuration-file loading remain pending.

Compiler fixture tests cover direct references, imported and exported aliases, original scope through re-exports, non-exported targets, missing names, ambiguous overloads, incompatible parameter shapes, and unsupported forms.
Custom modifier fixtures verify binding and resolution after session closure for both compiler inputs.
They also verify that original release classification and metadata selection do not change.
Pass bindings to `resolveDocumentation` with the signature comments and their original package names.
Use the original comments for classification.
Function reports use these bindings and resolved comments to determine documentation presence.

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

`DocumentationReferenceLookup` is a discriminated union with three `status` values.
A `ResolvedDocumentationReference` has `status: "resolved"` and a required `target` declaration identifier.
A `MissingDocumentationReference` has `status: "not-found"` and no target field.
An `UnsupportedDocumentationReference` has `status: "unsupported"` and no target field.
Qualified references, selectors, and target-less inheritance requests currently produce the unsupported outcome.
All outcomes retain the printed `reference` text, including an empty string for a target-less inheritance request.
Narrow on `status` before accessing `target`.
Lookup does not validate the target's package scope, release level, or suitability for documentation links.
The separate link binder validates the supported function subset described below.
The content resolver consumes validated bindings and preserves their original context through inheritance.

Compiler fixture tests cover these lookup cases using both supported declaration-build compilers.
They verify detached access after session closure, frozen lookup results, and JSON round-tripping of the documentation context.
Lookup alone does not establish API-link validity. Function reports also run the link binder and content resolver.

### Same-package API link binding

The internal `bindDocumentationLinks(facts, classification, options)` operation in [documentation.ts](src/documentation.ts) validates local API links without compiler access.
It is not exported from the package entrypoint.
Supply original classification from the same analysis, including targets excluded from report selections.
The binder does not recompute classification or validate that supplied metadata came from the current comments.
Use the same custom modifier options for classification and binding.

Sources must have standalone function documentation contexts.
Targets must be standalone functions with exactly one callable signature and a documentation context.
The source and target must belong to the same original package, which can differ from the package that re-exports them.
Aliases and retained unexported targets are supported.
Parameter names and types do not need to match because links do not copy parameter documentation.
Overload targets, other declaration forms, qualified references, selectors, and cross-package links produce unsupported-feature diagnostics.
These limits are provisional until declaration-level classification and broader target semantics are available.

Public, beta, and alpha APIs can link to each other, independently of report selection.
They cannot link to internal APIs.
Internal APIs can link to any release level.
Missing source or target metadata, including an unspecified release level, produces a configuration diagnostic.
The binder does not treat missing metadata as public or infer it from a report selection.

Each result retains the source signature identifier, API link index, reference text, target declaration and signature identifiers, and original comment location.
Indices follow TSDoc tree traversal order and exclude URL links.
Repeated links remain separate occurrences.
Results are deeply frozen and sorted by source identifier and link index.
URL destinations are not accessed or validated.
The binder checks TSDoc syntax and verifies that lookup reference text and occurrence order match the comment.
Missing names and stale lookups produce reference diagnostics; non-internal-to-internal links produce `documentation-link-policy`.
Failures contain no partial bindings.
Duplicate fact or metadata identifiers and missing retained target declarations are internal invariant failures and throw exceptions.

Pure tests cover all release-level combinations, selection independence, stale and missing lookups, unsupported scopes, custom modifiers, and immutable results.
Compiler tests verify aliases, unexported targets, repeated links, self-links, mutual links, and original scope through re-exports after session closure.
They use declarations built with TypeScript 6 and TypeScript 7 and verify binding after JSON serialization.
This operation validates links in original local comments.

### Inherited API links

Pass its bindings and the original classification through `resolveDocumentation`'s `linkValidation` option to resolve comments that contain API links.
Omit this option only for comments without API links, including inherited content.
Each binding identifies both the target declaration and its single callable signature for release-policy checks.
The resolver requires exactly one binding per original API-link occurrence and rejects missing, duplicate, stale, or unused bindings.
Manual bindings must satisfy the same target and scope checks as the compiler-backed binder.
The target signature must have an input in the resolver request, even when it is not an inheritance target.
The resolver does not verify the declaration-to-signature association or recompute the supplied classification.

The following call uses original inputs, inheritance bindings, API link bindings, and classification from the same analysis:

```typescript
const resolved = resolveDocumentation(inputs, inheritanceBindings, {
	...tsdocOptions,
	linkValidation: {
		bindings: linkBindings,
		classification,
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
Pure tests cover chains, identical reference text with different original targets, rejected bindings, and receiving release-policy failures.
Both compiler inputs verify resolution through aliases after JSON serialization and session closure, using the same inherited-comment snapshot.
Function reports validate local and inherited API links before constructing a successful report, including links in unselected signatures.
Effective content determines `ReviewSignature.documented`; original classification and local tags determine report annotations.
This function-only integration does not complete Stage 2.

## Release classification and selection contract

The first Stage 2 increment classifies identified documentation inputs and selects metadata views.
It does not generate reports, validate semantic references, or trim declaration text.
`classifyApiItems` accepts items with `id` and `documentation` fields, including callable signature facts.
The required `documentation` property has type `string | undefined`.
Supply only the associated TSDoc comment, including delimiters, or `undefined` when no comment exists.
An explicit empty comment such as `/** */` is present documentation. An empty string is invalid comment text, not an absent comment.
Do not supply declaration text in this field.
This distinction supports the future inheritance rule: absence permits automatic inheritance, while any local TSDoc comment suppresses it.
Classification does not implement inheritance and does not preserve raw comments in its metadata output; retain the original facts for that work.
Each item is classified independently. Callers supply callable overloads, not implementation signatures.
The result contains each item's identifier, release level, and modifier tags, sorted by identifier.
Duplicate identifiers fail with `classification-duplicate-id`; this API does not resolve provisional identity collisions.

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
Absent documentation bypasses comment parsing. An explicit empty TSDoc comment parses successfully.
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
Classification options are explicit inputs to this API, not values read from the analysis session's rule map.
Reuse a successful classification for several selections. The classifier does not cache or automatically repeat this work for each selection.

The following example classifies two overloads and selects the public partner metadata without including the internal overload:

```typescript
import { classifyApiItems, ReleaseLevel, selectApiItems } from "api-analyzer";

const classified = classifyApiItems(
	[
		{ id: "convert:text", documentation: "/** @public @partner */" },
		{ id: "convert:number", documentation: "/** @internal @partner */" },
	],
	{ customModifierTags: ["@partner"] },
);
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
The initial declaration renderer supports function-only entrypoints. Its report syntax is experimental.
Raw declaration text is not a substitute for correctly selected declarations, and metadata-only output is not a complete API report.

`createReviewReport(facts, entrypoint, selection, options)` joins a named metadata selection to detached callable signature facts.
The required `ReviewReportOptions` supplies full original `classification` and the same `customModifierTags` used to classify the inputs.
Report construction binds inheritance and API links, then resolves all supplied signature comments before applying report selection.
Unselected ancestors and link targets remain available, and invalid documentation fails the request even for an empty selection.
Documentation diagnostics propagate without a partial report.
The `documented` flag measures descriptive content after resolution; an inheritance request alone does not count.
Empty inherited content remains undocumented. Original release metadata and local block tags still control report annotations.
The report identity uses the package name and selection name, not the physical entrypoint name.
This lets two resolution contexts render under the same review identity for parity comparison.
Exports are sorted by exported name. Aliases remain separate exports, and type-only export paths remain visible.
Selected overloads retain compiler order because overload order can affect resolution.
An export with no selected overloads is omitted. An empty selected surface is an explicit empty report.
Unknown entrypoints, unknown selected identifiers, and blank report names return `report-configuration` diagnostics.
All selected identifiers must refer to signature facts from the supplied analysis, but may belong to other entrypoints in that analysis.
The caller must use classification and selection from the same facts; the report builder does not reclassify comments.
Duplicate fact identities and unresolved export targets violate internal invariants and assert.
The initial builder throws for non-function exports or function/namespace merges, even when no overload is selected.
These are unsupported library capabilities, not user-input diagnostics. No partial report is returned.

`renderReviewReport(report, options?)` produces API Extractor-like Markdown: a package heading, generated-file notice,
surface identity, and one `ts` block containing function declarations and explicit export statements.
Each function is declared once, with per-overload comments. Alias and type-only exports refer to that declaration.
A declaration used only through aliases is not accidentally exported under its implementation name.
Call-signature declaration text is printed by the compiler during analysis; the renderer does not rewrite arrow-function type strings.
The report retains declaration identities internally to group aliases, but never prints those identities.

`ReviewPresentationOptions.includeReleaseTags` defaults to `true`. Release tags appear first in each annotation.
`additionalTags` defaults to an empty list. Use it to display recognized tags such as `@sealed`, `@input`, `@legacy`, or `@deprecated`.
Additional names match report metadata exactly. Unknown or absent names display nothing; this option does not register custom TSDoc tags.
Release tags are controlled only by `includeReleaseTags`, not `additionalTags`. Permitted untagged items have no release annotation.
The report builder preserves recognized modifier metadata and parsed block-tag presence for presentation.
It uses the official TSDoc parser for effective-content detection without repeating semantic classification.

`includeUndocumentedNotice` defaults to `true`. Absent, empty, and tag-only comments receive `(undocumented)` annotations.
Descriptive text in an effective summary or block, code, and validated API or URL links count as documentation.
An explicit inheritance request counts only through its successfully resolved content.
Missing targets, cycles, ambiguous overload targets, invalid TSDoc, and invalid API links prevent successful report construction.
Inherited links retain their original targets and must also satisfy the receiving API's original release policy.
This status measures content presence, not documentation quality or completeness.

Same-package explicit function inheritance and API links are implemented.
The [Stage 2 documentation-resolution plan](../plans/api-extractor-replacement-implementation-plan.md#resolve-documentation-before-report-construction) still requires broader declaration support, automatic member inheritance, and cross-package suite resolution.
The planned automatic inheritance rule treats any local TSDoc comment, including an empty or tag-only comment, as an override.
Dependency-model loading and compatibility support remain in Stage 2. Complete portable-model serialization and downstream-consumer verification remain in Stage 3.
Disabling the annotation does not disable documentation validation or change selected APIs.
Display settings never remove metadata from the report model and do not alter semantic policy.

The following options retain release tags, display Fluid-specific metadata, and suppress undocumented annotations:

```typescript
const presentation = {
	additionalTags: ["@sealed", "@input", "@legacy"],
	includeUndocumentedNotice: false,
};
```

Package-level `@packageDocumentation` handling remains a [required follow-up](../plans/api-extractor-replacement-follow-ups.md#required-package-documentation-support).
No missing-package-documentation annotation is emitted before that analysis exists.
General report-format customization is a separate follow-up after rough API Extractor parity.
The text uses LF line endings and one final newline. It excludes source comments, implementation bodies,
source locations, provisional IDs, and compiler versions. It is review text, not a declaration rollup.
Both operations perform no compiler queries or filesystem writes and do not mutate their inputs.
Full-report tests compare generated output with checked-in snapshot files.
Documentation, report, and compiler-backed snapshot tests use `assertSnapshot` from [the shared snapshot utilities](src/test/snapshotUtils.ts).
The utility compares exact UTF-8 text, including whitespace and line endings, and returns the expected text for additional assertions.
Tests use explicit file names so that multiple tests can check the same baseline.
Missing files and unequal text fail the test.
Normal tests never create or update snapshots.
Review snapshot diffs explicitly when intentionally changing the report format or fixture API.

The initial baseline API accepts generated report text without interpreting its syntax.
`compareReviewBaseline(actual, expected)` performs a pure, exact string comparison.
An `undefined` expected value means that no accepted baseline exists; an empty string is an existing empty baseline.
Missing and stale baselines return `baseline-missing` and `baseline-stale` diagnostics respectively.
Neither case contains a partial success value or accepts the generated text.
Line endings, whitespace, and the final newline are significant. Deterministic report generation must normalize its own output.

`checkReviewBaseline(actual, baselinePath)` reads a UTF-8 baseline and performs the same comparison without writing.
Only a missing file is converted to a missing-baseline diagnostic. Other filesystem errors propagate as exceptions.
`updateReviewBaseline(actual, baselinePath)` explicitly writes the supplied text as UTF-8, creating or replacing the file.
The caller must provide an absolute path and an existing parent directory. Invalid relative paths return a configuration diagnostic.
Update errors propagate as exceptions. Updates are single-file writes, not transactions across multiple artifacts.
Call update only after generation and all required validation and parity checks succeed.
The library does not implicitly create directories or accept a baseline when checking it.

Compare two generated surface texts directly to check parity without writing either text to an accepted baseline.
The caller must use the same review identity and rendering options for both surfaces.
This increment establishes baseline handling only; it does not satisfy the Stage 2 review-output or parity gates.

## Experimental API

The following example resolves configuration and reuses one analysis result for several consumers.
The configured project must include the declaration entrypoint and its dependencies.
All relative configuration paths use the supplied working directory, including paths inherited from base configurations.

```typescript
import { createAnalysisSession, resolveConfiguration } from "api-analyzer";

const resolved = resolveConfiguration(
	{
		packageName: "example-package",
		project: "tsconfig.api.json",
		entrypoints: [{ name: ".", path: "lib/index.d.ts" }],
		rules: { documentation: false },
	},
	process.cwd(),
);

if (!resolved.ok) {
	throw new Error(JSON.stringify(resolved.diagnostics));
}

const session = createAnalysisSession();
try {
	const first = session.analyze(resolved.value);
	if (!first.ok) {
		throw new Error(JSON.stringify(first.diagnostics));
	}

	// Consumers share frozen facts without retaining compiler handles.
	console.log(first.value.surfaces);
	console.log(first.value.declarations);
	const repeated = session.analyze(resolved.value);
	console.log(repeated.ok && repeated.value === first.value);

	// Call this after a relevant file, dependency, or configuration change.
	session.invalidate();
} finally {
	session.close();
}
```

`resolveConfiguration` returns structured diagnostics for missing settings, invalid entrypoints, duplicate names, and inheritance cycles.
`packageRoot` defaults to the supplied working directory.
Supplied arrays replace inherited arrays. Rule maps merge by key.
An explicit `false` rule value overrides an inherited `true`.
You can inspect rule settings at this stage, but the analyzer does not execute the rules.
Compiler options and module resolution conditions come from the selected TypeScript project.
Use separate project configurations for different conditions.

`analyze` returns deeply frozen facts or diagnostics. Compiler diagnostic failures do not produce partial success.
Entrypoint order and changes to rule settings do not invalidate facts.
Changing the configured set of entrypoints creates a separate cache entry.
`invalidate` discards all cached facts and closes the current compiler connection.
The next request creates a new compiler connection.
Repeated `close` calls have no effect. Later analysis requests return `session-closed`.
`getStatistics` returns the counts of adapter analysis calls, cache hits, and invalidation calls made while the session was open.
Analysis calls that fail still contribute to the analysis count.
The counters do not measure compiler-internal work and are not reset by invalidation or close.

Declaration and signature identities are provisional. Tests cover separate aliases, namespaces, merged declarations, overload reordering, and checkout relocation.
They do not establish a complete identity scheme for multiple installed versions of the same package or every anonymous and computed declaration.
Member facts preserve effective type text, optional and readonly state, and declaration locations.
Incomplete member expansion produces `partial` and diagnostics while preserving the original declaration text.
Signature documentation contains only the closest compiler-attached TSDoc comment, including delimiters, or `undefined` when absent.
Ordinary comments do not count as TSDoc. Explicit empty TSDoc comments remain present.
The enclosing declaration fact retains full source declaration text separately; signature `text` retains the printed function type.
JSON serialization omits `undefined` documentation fields. Reading an omitted field returns `undefined`, while explicit empty comment strings remain intact.
These comments are not parsed or resolved documentation models.
Construct signatures, structured index signatures, and a complete graph of referenced types are not part of this initial fact format.

## Commands

Run these commands from this package directory to install pinned dependencies and execute the investigation:

```sh
pnpm install
pnpm lint
pnpm test:contracts
pnpm check:format
```

The package has an independent workspace and lockfile so it does not change the client release group's compiler.
The test build uses TS7.
TS6 supplies the conventional compiler API required by ESLint and also builds fixtures and checks declaration consumers.
It is not an analysis fallback.
Run `pnpm test` to include all Stage 0 investigation gates as well. That command intentionally remains unsuccessful while the three recorded gates fail.
`test:contracts` runs the analysis and configuration contracts plus release-classification and metadata-selection tests.
`test:stage1` retains its existing command name and selects the `Effective configuration`, `Analysis session`, and `Adapter fact extraction` suites, plus session-lifecycle worker tests.
Test names describe behavior. Applicable design identifiers appear in comments above tests.
Temporary investigation tests have comments that explain their purpose and when to remove or replace them.
The focused command is not a claim that the excluded gates pass.

### Linting

[eslint.config.mts](eslint.config.mts) uses the `strict` preset from the in-repo `@fluidframework/eslint-config-fluid` package.
`pnpm lint` checks the package with zero warnings allowed.
Use `pnpm lint:fix` to apply automatic fixes, then rerun the build and contract tests.
Some fixes require manual review, especially changes to imports or test assertions.
Biome remains the formatter; run `pnpm check:format` after lint fixes.

The ESLint configuration documents shared allowances for Node.js built-ins and official TypeScript subpath imports.
A test-wide rule exception permits JSON round-trip tests instead of in-memory cloning.
File-local ESLint directives explain exceptions for compiler symbol bit masks and intentional `null` states.
Generated output and [compiler fixture inputs](src/test/fixtures/README.md) are excluded from ESLint.
Fixtures are formatted and validated in their temporary compiler projects instead.

[pnpm-workspace.yaml](pnpm-workspace.yaml) gives the shared lint configuration its own TypeScript 6 dependency.
This keeps the lint plugins compatible without replacing the analyzer's native TypeScript 7 dependency.
Comments explain the compatibility overrides, reviewed trust exceptions, and allowed dependency build scripts.
The package retains strict peer dependency checks and supply-chain policies.

## Stage 0 results

Verified on 2026-09-15 in the Linux codespace after restarting the interrupted session.
The package build and `pnpm check:format` pass.
At the end of Stage 0, `pnpm test` reported **19 passing tests and 3 failing tests** and exited unsuccessfully.
The failures remain active capability gates. Do not treat this package as ready for production integration or add its test command to required repository CI without resolving their disposition.

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

Verified on 2026-09-15: all 29 tests selected by `pnpm test:stage1` pass as part of `pnpm test:contracts`.
The build and formatter pass.
The earlier full `pnpm test` run reported 34 passing tests and the same 3 unresolved Stage 0 failures.
That full-suite count predates the additional configuration and extraction-helper tests.
The full suite was not rerun for the helper extraction refactor or the test-name changes.

The [configuration tests](src/test/configuration.test.ts), [session tests](src/test/session.test.ts), [native capability tests](src/test/nativeCapabilities.test.ts), and [lifecycle tests](src/test/lifecycle.test.ts) cover the initial contracts.
They verify ordered configuration inheritance, immutable effective settings, shared frozen facts, explicit invalidation, and failure handling.
The session analyzes declarations built with TS6 6.0.3 and TS7 7.0.2 through TS7 7.0.2.
The full synchronous semantic suite also passes the original semantic and printing checks; the missing emit-method gates still fail.

Additional tests verify chained type-only exports, namespace and merged declaration facts, effective members, separate overload identities, and explicit incomplete expansion.
Node and browser dependency fixtures retain their distinct types and package origins.
Tests verify fresh-session agreement after dependency changes and identical facts after checkout relocation.
Linux worker tests verify session disposal and that the session remains closed after it detects a compiler-process failure.

The adapter's extraction helpers are module-level functions with explicit dependencies.
They are exported from the internal adapter module for tests, not from the package entrypoint.
Each extraction owns its package-location cache and declaration tracking state.
Compiler-dependent helper tests use the existing real-compiler fixtures instead of compiler mocks.
Direct tests cover package locations, aliases, type-only exports, members, signatures, and declaration collection.
They also check cache separation, repeated collection, and the active-identifier guard.

The Stage 1 implementation uses pure configuration and immutable data, with native communication, filesystem access, and caches isolated in the adapter and session.
It does not close the full W/F/B requirements or resolve the Stage 0 declaration-generation limitation.

## Initial Stage 2 results

Verified on 2026-09-15: `pnpm test:contracts` passes 45 tests.
This includes 29 analysis and configuration contracts, 12 [classification and selection tests](src/test/classification.test.ts), and four real-compiler integration cases.
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
The [baseline tests](src/test/reviewBaseline.test.ts) add three acceptance cases to `test:contracts`.
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

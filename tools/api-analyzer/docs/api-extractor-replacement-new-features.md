# API tooling replacement: new capabilities and regression coverage

## Purpose

This document tracks new capabilities and API Extractor defects that the replacement library must handle correctly.
It supplements the [workflow requirements](api-extractor-replacement-requirements.md).
The entries define required outcomes, not implementation techniques or output syntax.
References to `bundledPackages` describe the upstream reproductions; they do not require an equivalent configuration setting.

## Verification status

Stage 2 was accepted on 2026-09-20 with documented follow-ups deferred until the remaining library implementation is complete.
Review and validation evidence is summarized in the [current acceptance audit](api-extractor-replacement-implementation-plan.md#current-acceptance-checklist), including the package's self-generated complete report.
F4 and B1/B2/B6 have report-level and policy regressions; F1/F2/F3 have the analysis and dependency-model coverage needed for effective review documentation.
Complete portable model and declaration-rollup obligations remain open at their assigned stages.
Passing the Stage 2 subset does not close requirements that also cover those later outputs.
No Stage 2 policy question remains open; later-stage acceptance details remain attached to their respective outputs.
The linked issue descriptions were inspected, but their reproductions have not been run as part of this requirements work.
Upstream issue closure does not establish that the replacement handles the case correctly.
Before closing an entry, link its passing regression tests and verify the applicable behavior with both TypeScript 6 and TypeScript 7.
These versions identify the package build and declaration-consumption test configurations. One TypeScript 7 analysis engine using TypeScript 7 semantics may serve both, as permitted by W4; record the analysis engine separately.

The following paragraphs record historical Stage 0 and initial Stage 1/2 checkpoints, not the latest verification status.
The [Stage 0 results](../README.md#stage-0-results) and [native capability tests](../src/test/nativeCapabilities.test.ts) initially provided preliminary compiler evidence for F1, F4, and alias/type-only export facts relevant to B1 and B2.
They do not implement the required artifacts or reproduce the full cross-package regressions. All F1-F4 and B1-B6 entries remain open.
The [Stage 1 session tests](../src/test/session.test.ts) check facts that contain no compiler objects.
They cover aliases, chained type-only exports, inherited members, overload identifiers, and diagnostics for incomplete member expansion.
These tests do not satisfy the requirements for generated artifacts.

The [direct adapter-helper tests](../src/test/nativeCapabilities.test.ts) use real compiler fixtures built with TS6 and TS7.
They check package locations, alias targets, type-only export status, effective members, documented overloads, and declaration collection.
They also verify independent location caches, reuse of completed declarations, and the active-identifier guard.
The focused analysis and configuration suite passes 29 tests, verified on 2026-09-15.
Test names describe behavior; comments above tests retain applicable design identifiers.
This evidence does not close F1-F4 or B1-B6. Artifact-level and full cross-package acceptance tests remain required.

The [classification and selection tests](../src/analysis/test/classification.test.ts) provide initial Stage 2 evidence for independent overload classification and configurable release and modifier-tag filters.
The native capability fixtures also verify selection from detached callable facts after session closure for both input-build compilers.
The combined contract suite passes 45 tests on 2026-09-15, including numeric release-level ordering and explicit-set selection checks.
Extraction tests distinguish absent and explicit empty TSDoc comments in source and TS6/TS7-built declarations, including after JSON serialization.
This preserves inputs needed by F3; it does not implement or verify automatic inheritance.
These tests select metadata, not reports or declarations. F4 remains open until artifact and reference-validation acceptance tests pass.

## New functionality to support

### F1. Include inherited members in API artifacts

Required result: Documentation models and API reports must include inherited members of interfaces and classes, not only members declared directly on the derived API.
A documentation model may expose the complete member view through resolved relationships instead of duplicating an expanded member list for each derived API.
This representation is preferred to reduce artifact size.
Consumers must be able to obtain the complete view without repeating TypeScript analysis.

In this example, artifacts for `Bar` must include both `fooMember` and `barMember`:

```typescript
export interface Foo {
  fooMember: number;
}

export interface Bar extends Foo {
  barMember: number;
}
```

The tool must expose members of ordinary object intersections.
It must also support built-in utility types such as `Pick`, `Omit`, and `Readonly` when their underlying types are supported.
The member view must reflect the resulting member selection, types, and modifiers.
For example, documentation for this intersection must include both members:

```typescript
export type Foo = {
  fooMember: number;
};

export type Bar = Foo & {
  barMember: number;
};
```

Verification check: Generate models and reports for interface and class inheritance, including a generic base whose member types are specialized by the derived API.
Verify that inherited members appear with the types consumers observe.
Verify that a model using resolved relationships supplies the complete view without duplicated member lists or further TypeScript analysis.
Include the intersection example and utility types applied to supported types, including combinations of those utilities.
Verify that `Pick` and `Omit` select the expected members and that `Readonly` preserves their types while making them readonly.

The tool should make a best effort to expose members of more complex composed types.
When complete member expansion is unsupported, it must retain the original type expression and produce an actionable diagnostic rather than silently present a partial member set as complete.
This fallback does not relax the required support for ordinary intersections and utility types over supported underlying types.

Resolved decisions: A complete member view through resolved relationships is sufficient and preferred. Ordinary object intersections and built-in utility types over supported underlying types are required, not best effort.
The limits of more complex type expansion and the representation of member origins remain design details for later investigation.

Related requirements: W1, W4, W7.

### F2. Resolve documentation references before model output

Required result: Consumers must be able to configure a package suite using package names or glob patterns.
A suite is the configured set of packages whose generated documentation models participate in reference resolution.
Suite resolution must support matching direct and transitive dependencies, including peer dependencies.
The tool must use these packages' generated documentation models to resolve documentation references.
The workflow may require suite dependencies to be built and their documentation model artifacts generated before processing a consuming package.
Any missing or incompatible documentation model for a selected suite dependency must fail package-level processing, even when no documentation reference needs that model.
The failure must identify the affected dependency and the model availability or compatibility problem.
Consumers must not need to repeat that semantic resolution when rendering documentation.

The [agreed architecture](Architecture-Proposal.md) assigns documentation resolution to analysis and artifact decoding and validation to the model layer.
Root composition reads selected dependency artifacts and passes validated data to analysis.
All generators consume the completed graph, which preserves resolved content and original metadata without mutable compiler or parser state.
Dependency-model decoding is required here; full analysis restoration for incremental builds remains a separate deferred capability.

The tool must resolve and validate API references in `{@link}` and `{@inheritDoc}` during package processing.
Invalid or nonexistent targets must produce diagnostics at this stage, not only when a downstream documentation tool consumes the model.
Resolved API links must use structured target identities that downstream renderers can map to URLs.
Inherited documentation must be resolved before model output.
The requirement is unambiguous, validated documentation data, not a blanket prohibition on retaining tag text in raw source comments.
The output representation remains a design decision, subject to these requirements.

Reference policy:

- URL links are permitted. The tool must not fetch or validate their destinations. TSDoc syntax validation still applies.
- API references must target an API in the same package or the configured suite. References to packages outside the suite must produce errors.
- An API reference without an explicit package uses the package in which its documentation originated. Re-exporting the API must not change this context.
- Documentation model artifacts must retain sufficient target identity and origin context to prevent ambiguity across package boundaries within the suite, including when packages contain APIs with the same name.

Verification checks:

- Resolve links and inherited documentation from matching direct dependencies, peer dependencies, and transitive dependencies using their generated models. Exercise exact-name and glob selection.
- Remove a selected suite dependency's model or provide an incompatible model. Verify that package-level processing fails with an actionable diagnostic in both cases, including when no documentation reference targets that dependency.
- Consume the resulting model without repeating semantic reference resolution. Verify that API links have structured target identities and inherited documentation is already resolved.
- Report invalid and nonexistent API targets during package processing, both within a package and across the suite. Reject explicit API references to packages outside the suite.
- Re-export an API whose documentation references another API in its source package without naming the package. Verify that both link and inherited-documentation targets remain tied to the source package, including when the re-exporting package has a same-name API.
- Preserve URL links without accessing or validating their destinations.
- Confirm that successful resolution does not bypass documentation-reference policy checks such as B3.

Missing or incompatible models for any selected suite dependency fail package-level processing regardless of whether a reference needs them.

Related requirements: W3, W7, W8, W10.

### F3. Inherit member documentation by default

Required result: A derived member without its own TSDoc comment must automatically inherit documentation from its ancestor definition.
Authors must not need an explicit `{@inheritDoc}` tag for this default behavior.
This must also work across package boundaries within the configured suite from F2.

Any local TSDoc comment disables automatic documentation inheritance entirely.
Missing sections must not be filled from ancestors when a local comment exists.
Authors can therefore suppress automatic inheritance by supplying a local TSDoc comment.
An explicit `{@inheritDoc}` in that comment remains an intentional resolution request under F2, not automatic inheritance.

Revised Stage 2 decision: if multiple bases provide distinct candidate sources, automatic inheritance leaves the member undocumented rather than choosing one.
An explicit local comment or validated inheritance request can remove the ambiguity.
The tool must not silently select an ancestor by declaration order.

Automatic overload inheritance is deferred to the [follow-up investigation](api-extractor-replacement-follow-ups.md#automatic-overload-documentation-inheritance).
Overloaded receivers or candidate sources do not receive automatic documentation in Stage 2.
Unproven compatibility or parameter adaptation also prevents automatic copying; explicit requests still produce diagnostics when invalid.

In this example, `Bar.fooMember` can inherit documentation from `Foo.fooMember` because the compiler can establish compatibility without adapting the comment:

```typescript
export interface Foo {
  /** fooMember docs */
  fooMember: number;
}

export interface Bar extends Foo {
  // Unless this property is given its own TSDoc comment, it should inherit its documentation from `Foo` automatically.
  fooMember: number;
}
```

Verification checks:

- Cover members inherited unchanged and compiler-proven generic substitutions, both within a package and across the configured suite. Verify that documentation is inherited without replacing the receiving member's signature. Unproven narrower redeclarations remain undocumented.
- Add a local TSDoc comment containing only a summary or a tag. Verify that automatic inheritance stops entirely and no missing documentation sections are filled from ancestors.
- Provide conflicting documentation from multiple bases. Verify that automatic inheritance does not choose a source, then add local documentation and verify that it is retained.
- Reorder base overloads and verify that automatic inheritance remains disabled rather than matching by position.
- Exercise an unproven match or parameter difference that cannot be adapted. Verify that no automatic content is copied and that an explicit local comment remains authoritative.
- Verify that an explicit local `{@inheritDoc}` request still resolves and receives the validation required by F2.

Revised decisions: Any local TSDoc comment disables all automatic inheritance. Conflicting or unproven automatic sources are skipped. Automatic overload matching is deferred; explicit numeric inheritance remains supported. These decisions supersede the original requirements for automatic-overload errors and inferred signature matching.

Related requirements: W3, W7.

### F4. Function overloads with different release levels should be supported

Required result: Standalone function overloads must be able to declare different release levels.
Surface selection and validation must respect each callable overload's release level.
The implementation signature must not require a release tag because consumers cannot call it directly.

In this example, the public surface exposes the string overload, while the beta surface also exposes the number overload:

```typescript
/** @public */
export function foo(value: string): void;

/** @beta */
export function foo(value: number): void;

// Note: the implementation should not need a release tag, as it is not directly callable.
export function foo(value: string | number): void {
  return;
}
```

Verification check: Generate public and beta reports and declarations from this overload set.
Verify that each surface contains the selected overloads, that the implementation signature is not exposed, and that its missing release tag produces no diagnostic.
Check API references against the release level of the overload that contains them.
Add an internal overload and generate complete, public, and beta outputs.
Verify that the complete output includes the internal overload, that public and beta outputs exclude it, and that the non-internal overloads retain their own release levels and remain available in the selected surfaces.
Mixing internal and non-internal standalone function overloads must not itself produce a validation error unless an explicitly configured repository policy prohibits the combination.
This requirement does not depend on whether API Extractor currently supports the case.

Resolved decision: Mixed `@internal` and non-internal standalone function overloads must be supported. Each callable overload is classified and filtered independently. Repository-specific restrictions on combinations may be enforced through configurable validation, not a built-in prohibition.
Scope clarification agreed on 2026-09-18: independent selection applies to standalone functions, not members of an atomic container.
V1 requires every selected class, interface, enum, or namespace to retain its members, including static members and constructors.
Contained overloads remain supported but must satisfy the container's release-level rules and must not be trimmed independently by release-level or custom-tag filters.
See the [atomic-container decision](api-extractor-replacement-implementation-plan.md#3-atomic-compound-functionnamespace-apis) and the [merged-declaration investigation](../TODOs.md#merged-declarations).
All F4 questions listed during this requirements discussion are resolved.

Related requirements: W1, W2, W4, W5, W7.

## Required regression coverage

### B1. Preserve dependency export aliases

Source: [Rushstack #5920: Export aliases lost with `bundledPackages`](https://github.com/microsoft/rushstack/issues/5920).

Reported defect: Analysis follows a dependency's exported alias to its source declaration, then uses the source name in reports, models, and declaration roll-ups.
This also produces a false forgotten-export diagnostic when the consumer references the alias without re-exporting it.

Required result: Preserve the dependency's exported name and reference identity without requiring an unnecessary consumer re-export.

Regression check: Export a dependency type under an alias and reference it from a consuming API while including the dependency in analysis.
Verify correct names and references in reports, models, and generated declarations, with no false forgotten-export diagnostic.
Cover consumers with and without an explicit re-export of the alias.

Related requirements: W1, W2, W4, W5, W7.

### B2. Distinguish type-only exports in review output

Source: [Rushstack #4771: API report does not indicate if a class was type exported](https://github.com/microsoft/rushstack/issues/4771).

Reported defect: Changing a class export to a type-only export does not change its API report, despite removing consumer access to the class value.

Required result: Review output must distinguish type-only exports from exports that expose a value.
The distinction must follow the export path, not only the underlying declaration kind.

Regression check: Compare ordinary and type-only re-exports of the same class.
Verify that switching between them produces a review difference and that each entrypoint retains its own export semantics.
Include other declarations for which type-only export changes consumer access, such as enums, functions, and constants.

Related requirements: W1, W4.

### B3. Diagnose documentation references to internal APIs

Source: [Rushstack #5172: TSDoc references from non-internal API exports to internal exports do not error](https://github.com/microsoft/rushstack/issues/5172).

Reported defect: A non-internal API can link to or inherit documentation from an internal API without a diagnostic, although API Extractor omits the target from its documentation model.

Required result: Under the configured repository policy, diagnose both `@link` and `@inheritDoc` references from non-internal APIs to internal APIs.
Resolving a target during analysis must not bypass the policy check.
The replacement need not reproduce API Extractor's unconditional exclusion of internal APIs from documentation models.

Regression check: Exercise both reference forms and verify that diagnostics identify the referring API, target, and violated policy.
Also verify that a permitted public-to-beta documentation reference resolves in the documentation scope, even when the public review surface omits its target.

Related requirements: W3, W7, W10.

### B4. Remove imports used only by excluded APIs

Source: [Rushstack #4861: Imports are not correctly trimmed in roll-ups or report variants](https://github.com/microsoft/rushstack/issues/4861).

Reported defect: Filtered reports and declaration roll-ups retain imports used only by excluded declarations.
Changes to those imports cause unrelated review differences.

Required result: Generated declarations must omit imports needed only by excluded APIs while retaining imports needed by the selected declarations.
Review output must not change solely because an import used only by an excluded API changes.
This does not require reports to contain import statements or to omit all import information.

Regression check: Use distinct imported types in public and beta APIs, then generate complete and public-only outputs.
Change an import used only by the beta API and verify that the public report remains unchanged.
Verify that the public declarations omit that unused import and still compile, including when an import is shared by retained and excluded APIs.

Related requirements: W1, W4, W5.

### B5. Preserve re-exported module namespaces

Source: [Rushstack #4807: Re-exported import namespaces produce malformed declaration roll-ups with `bundledPackages`](https://github.com/microsoft/rushstack/issues/4807).

Reported defect: Re-exporting a dependency's module namespace while including its declarations produces malformed namespace syntax and missing member declarations or references.

Required result: Generated declarations must preserve valid namespace exports and their members across package boundaries.
Namespace members must retain their type and value meanings.

Regression check: Export a module namespace containing a class, interface, and constant, then re-export it from a consuming package.
Generate declarations with the dependency included and with it retained as an external reference.
Verify that both outputs compile and that consumer code can access the intended namespace members.
Include a dependency declaration input with an export list inside a namespace, as in the reported generated output.

Related requirements: W4, W5.

### B6. Filter exports that shadow built-ins correctly

Source: [Rushstack #4762: Exports which shadow built-ins are included in incorrect report variants](https://github.com/microsoft/rushstack/issues/4762).

Reported defect: An export alias introduced to avoid a built-in name collision remains in report variants that exclude its declaration.
The issue's follow-up reproduction reports this defect in reports, not trimmed declaration roll-ups.

Required result: Surface selection must apply to the exported API even when output generation renames its declaration to avoid a collision.
An excluded API must not leave an alias export in the selected report.

Regression check: Export an internal API named `performance` and generate complete and public-only reports.
Verify that the complete report preserves the intended export name and that the public report contains neither the internal declaration nor an alias exporting it.
Repeat with an included release level to verify that collision handling does not remove a valid export.

Related requirements: W1, W4.

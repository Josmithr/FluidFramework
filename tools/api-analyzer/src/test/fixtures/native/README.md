# Native compiler inputs

[nativeCapabilities.test.ts](../../nativeCapabilities.test.ts) copies these files and the shared inputs into the same temporary `src` directory.
TypeScript 6.0.3 and TypeScript 7.0.2 each emit declarations from that project.
TypeScript 7.0.2 analyzes both sets of declarations.
The ambient-module declaration-file input is type-checked by both producers and copied unchanged beside emitted declarations.
Generated declarations stay in the temporary project and are removed after the suite.

## Inheritance boundaries

Each `binding-*.ts` module contains a `derived` function with an explicit inheritance request.
The test's `documentationBindingCases` table records the expected binding or diagnostic.

| Fixture | Condition |
| --- | --- |
| [binding-imported.ts](binding-imported.ts) | Resolve an imported alias in the original module. |
| [binding-alias.ts](binding-alias.ts) | Fall back to an export alias that is not a local name. |
| [binding-missing.ts](binding-missing.ts) | Report a missing target for supported syntax. |
| [binding-overload.ts](binding-overload.ts) | Reject ambiguous overload selection. |
| [binding-renamed.ts](binding-renamed.ts) | Reject parameter names that do not match. |
| [binding-optional.ts](binding-optional.ts) | Reject optional parameter flags that do not match. |
| [binding-rest.ts](binding-rest.ts) | Reject rest parameter flags that do not match; both parameter types are arrays. |
| [binding-generic.ts](binding-generic.ts) | Reject type parameter lists that do not match. |
| [binding-pattern.ts](binding-pattern.ts) | Reject a destructured target parameter. |
| [binding-qualified.ts](binding-qualified.ts) | Reject unsupported package-qualified syntax. |
| [binding-selector.ts](binding-selector.ts) | Select second function and method overloads, preserve inherited links through method chains, and reject static/instance path ambiguity. |
| [binding-nonfunction.ts](binding-nonfunction.ts) | Reject a resolved target that is not a standalone function. |

The TODOs beside the case table describe how to extend these expectations as support is added.
Do not treat current unsupported outcomes as permanent limitations.

## Structured excerpts

[excerpt-references.ts](excerpt-references.ts) and [excerpt-base.ts](excerpt-base.ts) exercise aliases, qualified and same-named types, explicit and generated import types, type/value namespace shadowing, local generic and mapped binders, conditional inference, and cross-file generic substitution.
They also cover linked type-alias syntax, variable declarations, constructors, accessors, static methods, and index signatures.
Both TS6- and TS7-built declarations must produce excerpts that reconstruct the printed views and reference the intended declaration identities.
The native test also decodes and renders those tokens in a fresh process that blocks TypeScript and analysis imports.
[signature-views.ts](signature-views.ts) checks that normalized aliases retain reference tokens while reduced primitive types do not.
The [compiler excerpt boundary tests](../../../analysis/test/compilerExcerpt.test.ts) also consume these fixtures directly without importing the native adapter.
Generic names such as `Value` intentionally match package declarations in the shadowing cases; renaming those binders would change the test scenario.

## Documentation context

- [inheritance.ts](inheritance.ts) supplies direct same-package inheritance and the shared resolved-comment snapshot.
- [inheritance-reexport.ts](inheritance-reexport.ts) checks that a same-named declaration in the re-exporting module does not change lookup scope.
- [inheritance-hidden.ts](inheritance-hidden.ts) checks collection of a target that is not exported.
- [inheritance-custom.ts](inheritance-custom.ts) uses `@sourceOnly` and `@localOnly` to check shared custom modifier configuration without copying target metadata.
- [inheritance-links.ts](inheritance-links.ts) supplies a linked comment and an inheritance chain with an original beta target.
- [inheritance-links-reexport.ts](inheritance-links-reexport.ts) checks inherited-link resolution through aliases despite a same-named internal target in the receiving module.
- [documentation-links.ts](documentation-links.ts) covers aliases, hidden targets, overloads, missing and unsupported references, repeated links, URL exclusion, self-links, and collection cycles.
- [documentation-links-reexport.ts](documentation-links-reexport.ts) checks original-scope API link lookup through a re-export.
- [self-references.ts](self-references.ts) uses [reference-selectors.ts](reference-selectors.ts) as a configured subpath and re-export source. Qualified names use exported aliases, not private lexical shadows. Temporary mutations test scoped package names, missing surfaces, numeric selectors, and member-side and release-policy failures.
- [documentation-link-policy.ts](documentation-link-policy.ts) supplies valid public-to-beta links, aliases, an unexported target, repeated links, self-links, and mutual links for detached policy validation.
- [documentation-link-policy-reexport.ts](documentation-link-policy-reexport.ts) checks that a same-named internal declaration at the entrypoint does not replace the original beta target.
- [comments.ts](comments.ts) distinguishes absent, empty, ordinary, and closest attached documentation comments.
- [member-documentation.ts](member-documentation.ts) preserves original class, interface, and member comments, including separate overloads and merged declarations. Inherited generic members retain their source records, while local overrides do not receive ancestor comments. It also covers effective member identities, substituted call signatures, overload selection, optional methods, and callable property comment ownership. Direct base links retain hidden ancestors and a shared diamond root without changing exports. Separate implements links retain hidden contracts and type alias targets without copying members or documentation; a derived class does not repeat its base class's implements clauses.
- [member-references.ts](member-references.ts) checks original namespace lookup for inherited effective method and property links and explicit method inheritance after generic substitution. A same-named internal function in the receiving scope must not replace the original beta link target. An untagged automatic receiver checks that inherited links still require original release metadata. A property implementation verifies automatic copying and suppression by empty and tag-only local comments.
- [report-inheritance.ts](report-inheritance.ts) supplies descriptive inheritance from an unexported internal ancestor without copying its deprecated annotation into a public report.
- [report-inheritance-empty.ts](report-inheritance-empty.ts) supplies an empty inherited result that remains undocumented in a public report.
- [report-members.ts](report-members.ts) verifies container headers, complete member overload sets, callable-property syntax, declared constructors and statics, complete enum and namespace contents, type-only aliases, and built-in-shadow exclusion in the checked-in declaration report.
- The same report fixture covers matching merged interface headers, repeated property comments, atomic member selection, and local namespace/method/property link targets.
- [type-only-values.ts](type-only-values.ts) and [type-only-forward.ts](type-only-forward.ts) expose the report fixture's enum and constant through value aliases, same-name type-only exports, ordinary forwarding, and type-only star exports. They also retain recursive interface and class type references without unnecessary local renaming. Both consumer compilers check the emitted inputs and isolated report code blocks with [typeOnlyValues.ts](../consumer/typeOnlyValues.ts).
- [container-members.ts](container-members.ts) verifies declaring-container release inheritance, nested namespace selection, inherited public members in a beta receiver, constructor overloads, accessor pairs, and call/construct/index signatures. Temporary mutations add mismatched member tags to verify unconditional rejection without modifying the checked-in fixture.
- [merged-scope.ts](merged-scope.ts) and [merged-scope-augmentation.ts](merged-scope-augmentation.ts) contribute identical interface comments from different lexical scopes. Identical content keeps the first occurrence's link target. Temporary test mutations supply distinct descriptions to verify that both original targets are retained and validated.
- [merged-inheritance.ts](merged-inheritance.ts) supplies generic merged interfaces and repeated properties for explicit inheritance. Tests deduplicate original requests, resolve retained sources, and combine their content and provenance without copying target-only tags. They cover local contributions, multi-source chains, model round trips, missing targets, wrong kinds, incompatible parameters, policy failures, and cycles.
- [declaration-inheritance.ts](declaration-inheritance.ts) checks same-kind class, type-alias, variable, enum, and namespace inheritance without changing receiver declarations, including generic documentation and opaque compiler-library aliases.
- [compound-merges.ts](compound-merges.ts) combines interface/constants, callable namespaces, callable and constructable generic class/interface augmentation, enum/namespace and repeated enums, merged interface heritage/defaults/signatures, type-only aliases, and sibling namespace cycles. Original and report-rendered declarations are checked by both consumer compilers with [compoundMerges.ts](../consumer/compoundMerges.ts).
- [ambient-modules.d.ts](ambient-modules.d.ts) declares repeated string-literal modules; [ambient-entry.ts](ambient-entry.ts) exposes their merged APIs through namespace aliases and direct exports. Tests check original-scope links, combined documentation, dependency-model inheritance, release conflicts, and [consumer compatibility](../consumer/ambientModules.ts).
- [effective-references.ts](effective-references.ts) verifies named targets introduced by generic substitution in properties, returns, tuples, dictionaries, callbacks, and conditional types after compiler disposal.
- [merged-namespace.ts](merged-namespace.ts) contributes named and nested namespace parts with distinct documentation, a recursive alias, and custom-tagged members. Reports and models retain complete exports; temporary mutations verify release conflicts and unsupported compound merges.
- [type-references.ts](type-references.ts) retains separate parameter and return reference occurrences to an unexported beta and legacy target for independent release, directional, and entrypoint-exposure policies.
- [signature-views.ts](signature-views.ts) distinguishes original declarations, effective signature text, reduced types, and selectively normalized output. It covers compiler utilities, named and branded aliases, utility-name shadowing, explicit receivers, optional and rest parameters, and predicate or assertion returns.

The member-documentation fixture also verifies direct instantiated heritage views and reproduces the native generic-overload comparison boundary.
Its generic overload contract and implementation use different overload orders so position cannot substitute for semantic matching.

The `KeepHidden` type queries keep hidden targets in emitted declarations.
Do not remove them: documentation references alone do not make the TypeScript emitter retain those declarations.
The lookup-only fixtures do not establish API link policy validity.
The policy fixtures also run the link binder using original classification metadata, independently of public report selection.
The inherited-link fixtures also run content resolution after JSON serialization and session closure.
The imported inheritance alias is re-exported so declaration emission retains it for documentation lookup.
The report-inheritance fixtures use parameter type queries to retain their unexported ancestors.
Their detached reports match the pure report snapshots after session closure and JSON serialization for both input compilers.

## Verification

[reference-selectors.ts](reference-selectors.ts) checks static/instance disambiguation, numeric and label selectors, constructors, named declaration kinds, quoted names, enum members, and unique-symbol keys, including `Symbol.iterator`.
Local and model-only tests reject wrong keys, missing or duplicate labels, and ambiguous constructors.
The documented unnamed-selector form is a recorded parser capability limit, not an approved unsupported feature.
The suite tests also use it as a dependency producer for model-only reference resolution.

Run `pnpm build`, then `pnpm test` from the package directory for adapter, documentation, and declaration-consumer checks.
Known failing capability probes remain pending through `it.skip` and have stage-specific TODO comments.
After `pnpm build`, run `pnpm exec mocha --no-config lib/test/nativeCapabilities.test.js --grep "printed complete declarations" --timeout 20000` to run only the declaration-consumer check.
Use `--grep "retains original and resolved signature views"` to check both signature alternatives and their consumers without updating report snapshots.

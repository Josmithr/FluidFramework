# Native compiler inputs

[nativeCapabilities.test.ts](../../nativeCapabilities.test.ts) copies these files and the shared inputs into the same temporary `src` directory.
TypeScript 6.0.3 and TypeScript 7.0.2 each emit declarations from that project.
TypeScript 7.0.2 analyzes both sets of declarations.
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
| [binding-selector.ts](binding-selector.ts) | Reject an unsupported selector even when the named target exists. |
| [binding-nonfunction.ts](binding-nonfunction.ts) | Reject a resolved target that is not a standalone function. |

The TODOs beside the case table describe how to extend these expectations as support is added.
Do not treat current unsupported outcomes as permanent limitations.

## Documentation context

- [inheritance.ts](inheritance.ts) supplies direct same-package inheritance and the shared resolved-comment snapshot.
- [inheritance-reexport.ts](inheritance-reexport.ts) checks that a same-named declaration in the re-exporting module does not change lookup scope.
- [inheritance-hidden.ts](inheritance-hidden.ts) checks collection of a target that is not exported.
- [inheritance-custom.ts](inheritance-custom.ts) uses `@sourceOnly` and `@localOnly` to check shared custom modifier configuration without copying target metadata.
- [inheritance-links.ts](inheritance-links.ts) supplies a linked comment and an inheritance chain with an original beta target.
- [inheritance-links-reexport.ts](inheritance-links-reexport.ts) checks inherited-link resolution through aliases despite a same-named internal target in the receiving module.
- [documentation-links.ts](documentation-links.ts) covers aliases, hidden targets, overloads, missing and unsupported references, repeated links, URL exclusion, self-links, and collection cycles.
- [documentation-links-reexport.ts](documentation-links-reexport.ts) checks original-scope API link lookup through a re-export.
- [documentation-link-policy.ts](documentation-link-policy.ts) supplies valid public-to-beta links, aliases, an unexported target, repeated links, self-links, and mutual links for detached policy validation.
- [documentation-link-policy-reexport.ts](documentation-link-policy-reexport.ts) checks that a same-named internal declaration at the entrypoint does not replace the original beta target.
- [comments.ts](comments.ts) distinguishes absent, empty, ordinary, and closest attached documentation comments.
- [member-documentation.ts](member-documentation.ts) preserves original class, interface, and member comments, including separate overloads and merged declarations. Inherited generic members retain their source records, while local overrides do not receive ancestor comments. It also covers effective member identities, substituted call signatures, overload selection, optional methods, and callable property comment ownership. Direct base links retain hidden ancestors and a shared diamond root without changing exports. Separate implements links retain hidden contracts and type alias targets without copying members or documentation; a derived class does not repeat its base class's implements clauses.
- [report-inheritance.ts](report-inheritance.ts) supplies descriptive inheritance from an unexported internal ancestor without copying its deprecated annotation into a public report.
- [report-inheritance-empty.ts](report-inheritance-empty.ts) supplies an empty inherited result that remains undocumented in a public report.

The `KeepHidden` type queries keep hidden targets in emitted declarations.
Do not remove them: documentation references alone do not make the TypeScript emitter retain those declarations.
The lookup-only fixtures do not establish API link policy validity.
The policy fixtures also run the link binder using original classification metadata, independently of public report selection.
The inherited-link fixtures also run content resolution after JSON serialization and session closure.
The imported inheritance alias is re-exported so declaration emission retains it for documentation lookup.
The report-inheritance fixtures use parameter type queries to retain their unexported ancestors.
Their detached reports match the pure report snapshots after session closure and JSON serialization for both input compilers.

## Verification

Run `pnpm test:contracts` from the package directory for adapter and documentation contracts.
After `pnpm build`, run `pnpm exec mocha lib/test/nativeCapabilities.test.js --grep "printed complete declarations" --timeout 20000` for the separate declaration-consumer check.

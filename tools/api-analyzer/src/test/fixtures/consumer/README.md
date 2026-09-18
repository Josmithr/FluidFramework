# Declaration consumer

[consumer.ts](consumer.ts) checks the complete declarations printed by the native compiler emitter.
The native-capability test copies it beside the generated `api.d.ts` and `index.d.ts` files in a temporary project.
Its imports intentionally resolve to those generated files, not to checked-in modules in this directory.

TypeScript 6.0.3 and TypeScript 7.0.2 both type-check this consumer for each declaration-build compiler.
The positive checks exercise an exported class alias, an inherited property, and an overload call.
The `@ts-expect-error` checks require readonly assignment and value use of a type-only alias to remain errors.

Keep generated declaration files as runtime outputs.
Checking them in as inputs would bypass the emitter behavior that this test verifies.
See the [native fixture guide](../native/README.md) for the verification command.

## Signature views

[signatureViews.ts](signatureViews.ts) compares the original declarations with modules generated from `SignatureFact.reduced` and `SignatureFact.normalized`.
The test copies this consumer beside those generated modules in the temporary project.
Its original imports resolve to the declaration-build output under `declarations`.
Both supported compilers check assignability in both directions and require invalid calls to remain errors.
Predicate and assertion checks verify narrowing, not just that generated declarations are syntactically valid.
These checks validate callable fragments with their required named types in scope; they do not establish a complete declaration-rollup implementation.

## Type-only values

[typeOnlyValues.ts](typeOnlyValues.ts) checks enum and constant aliases from [type-only-values.ts](../native/type-only-values.ts) and [type-only-forward.ts](../native/type-only-forward.ts).
Both supported input compilers emit the declarations, and both consumer compilers check each emitted and report-rendered version.
Positive checks use enum types and constant type queries.
Negative checks require value use of type-only aliases to remain an error through direct exports, ordinary forwarding, and type-only star exports.
The report-rendered modules are isolated, self-contained test cases, not general declaration rollups.

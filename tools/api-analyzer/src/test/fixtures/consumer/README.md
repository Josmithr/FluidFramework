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

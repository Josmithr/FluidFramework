# Dependency re-export facade

`@scenario/facade` depends on [core](../core/README.md) and declares no APIs of its own.
Its [source entrypoint](src/index.ts) combines a star re-export with a renamed function and type-only bindings.

## Expected behavior

- `export *` exposes core's ordinary exports with their original targets.
- `renamedSource` points to the same documentation record as core's `source`.
- `ContractType` and `SourceType` preserve their type-only flags.
- The type-only `SourceType` binding does not become an ordinary value export.
- Facade export paths reference core-owned documentation records instead of duplicating them as facade-owned records.
- Reports preserve aliases and release selections; the model and source-free index retain the complete analyzed export paths.

The accepted [model](../../../../../snapshots/repository/reexports/facade.api.json), [public report](../../../../../snapshots/repository/reexports/facade.root.public.md), and [workspace index](../../../../../snapshots/repository/reexports/index.json) are shared by both producer compilers.
Compiler-consumer checks for these relationships in trimmed rollups remain Stage 4 work.
Module namespace re-exports have successful coverage in the [primary scenario](../../../primary/packages/primary/README.md) and the dependency suite tests.

See the [fixture guide](../../../README.md) for shared execution and baseline rules.

# Detached declaration fixtures

These declaration inputs test rollup generation after the original package files are removed.
They are not compiled as a standalone workspace.

- `index.d.ts` supplies public and beta APIs, independent overloads, private support types, package documentation, and private remarks.
- `second.d.ts` supplies aliases and a namespace target shared with the root entrypoint.
- `left.d.ts` and `right.d.ts` supply same-named types that must remain distinct after relocation.
- `foreign.d.ts` is installed as an external dependency; its exports remain package references.
- `consumer.ts` checks selected APIs, hidden exports, type-only paths, generic binding, and nominal identity with TS6 and TS7.
- `suite-overloads.d.ts` and `suite-reexport.d.ts` test model-backed partial overload redeclarations and unchanged complete or foreign exports.
- `suite-types.d.ts` and `suite-consumer.ts` verify generic nominal identity, aliases, type-only exports, and excluded calls with both consumer compilers.
- `suite-private-overloads.d.ts` requires a diagnostic for an inaccessible nominal type rather than a copied class declaration.
- `aliases.d.ts`, `aliases-local.d.ts`, and `aliases-external.d.ts` test namespace aliases, module type queries, nested import types, quoted external names, and global augmentations.
- `aliases-consumer.ts` checks public names and class identity against original and generated declarations with TypeScript 6 and TypeScript 7.

The [rollup tests](../../rollup.test.ts) compare reviewed artifact snapshots and compile this consumer.
The same tests extend the repository fixture matrix with complete and public declaration outputs from both producer compilers.

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
- The aliases fixtures also check top-level import-equals aliases, references through those aliases, and collisions with a type parameter.
- `effects.d.ts` and `effects-consumer.ts` check external imports without bindings, module augmentations, private supporting types, and empty export selections through a package entrypoint.
- `effects-external.d.ts` provides an imported global type; `effects-foreign.d.ts` provides the interface extended by the augmentation.
- `relative-augmentation/` supplies local targets, two augmentation modules, a separate same-named interface, root and subpath entrypoints, and a package consumer.
	These fixtures verify generic and namespace merges, nominal identity, module queries, supporting types, private remarks, and relocation after the original declarations are removed.
	Its package manifest and TypeScript configuration define the temporary project's exports and analysis inputs.
- `dependency-alias/` supplies an installed dependency with a privately branded class exported only as `Published`, plus consumer-package entrypoints with and without a second alias, `Forwarded`.
	The tests generate the dependency model before analyzing the consumer package and remove the consumer package's original declarations before generating its public rollup.
	Both compiler versions check parameter and return identity, bidirectional re-export assignment, rejected structural substitutes, and absent unintended exports through package exports.
	The dependency declarations remain installed because the generated consumer must reference that package instead of copying its class.
- `import-selection/` supplies a shared nominal dependency type and a separate beta-only import.
	The test changes only the beta import target in a temporary copy, keeping its local binding and API signatures fixed.
	Original, complete, and public package consumers compile with both supported TypeScript versions after each change.
	Generated output is checked after the original package declarations are removed; public consumers also compile after the beta-only dependency file is removed.
	The complete report must change, while the public report and rollup must remain identical.
- `namespace-reexports/` supplies named namespaces and module namespace re-exports, each tested inside and outside the dependency suite.
	Both compiler versions check classes, interfaces, constants, nested export-list aliases, and nominal identity through original and generated package exports.
	Suite tests generate and install the dependency model before analyzing the consumer package.
	After analysis, the tests remove the consumer package's original declaration file but keep dependency declarations installed.
	Complete output retains the beta namespace; public and empty selections exclude it only when the dependency belongs to the suite.
	Foreign namespaces remain available for all three selections, and generated output must not copy dependency classes or interfaces.

The [rollup tests](../../rollup.test.ts) compare reviewed artifact snapshots and compile this consumer.
The same tests extend the repository fixture matrix with complete and public declaration outputs from both producer compilers.

## Test lifecycle

The rollup test file defines shared helpers for temporary projects, fixture copying, consumer compilation, and generated artifact writes.
The standalone tests use `withRollupProject` to remove their temporary project after success or failure.
`copyRollupFixtures` copies only the requested inputs and preserves each explicit destination path.
Tests remove original declarations after analysis so unchanged imports cannot hide a generation error.
They then use `writeRollupArtifacts` to install generated output and `compileRollupFiles` to check it with both supported TypeScript compilers.
Compiler checks use explicit file paths and options because the analysis configuration can refer to declarations that were removed.
File-removal choices, analysis settings, and assertions remain in each test.

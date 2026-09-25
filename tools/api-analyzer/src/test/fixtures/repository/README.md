# Repository workflow fixtures

These are complete checked-in workspace inputs for [repository.test.ts](../../repository.test.ts) and [repositoryFailures.test.ts](../../repositoryFailures.test.ts).
Each workspace contains source files, package manifests and export maps, compiler projects, analyzer configuration, and a `repository.json` file listing packages in dependency-first order.
The tests do not synthesize package code or configuration.
[repositoryUtils.ts](../../repositoryUtils.ts) copies the workspace to a temporary directory and creates local package links under `node_modules/@scenario`.
It then compiles with the pinned producer, analyzes through the public API, and writes generated artifacts only inside that temporary workspace.
No network installation is required.

The fixture scope is ESM package inputs, matching the library's [module-support policy](../../../../README.md#module-support).
CommonJS packages and TypeScript `export =` declarations are not supported and are not future acceptance cases.

## Scenarios

| Workspace | Purpose |
| --- | --- |
| [empty](empty/repository.json) | Configured empty external module, including empty reports and model exports. |
| [overview](overview/repository.json) | Package documentation without exported APIs. |
| [primary](primary/repository.json) | Main API-kind inventory, release and custom-tag selections, default and renamed exports, same-package star and module namespace exports, supporting types, and populated/empty sub-paths. |
| [independent](independent/repository.json) | Two packages in one repository without dependency edges or invented suite references. |
| [dual](dual/repository.json) | Dependency type use, generic implementation, and inherited documentation without re-exported bindings. |
| [reexports](reexports/repository.json) | Named, renamed, star, and type-only dependency re-exports with origin identities. |
| [complex](complex/repository.json) | Five-package chain and diamond plus a sixth selected-but-unused package. Includes a peer dependency, transitive aliases, inherited documentation, local-name shadowing, and explicit/glob selector equivalence. |

Each analyzed package has a README describing its role and expected results:

| Workspace | Package guides |
| --- | --- |
| Empty | [empty](empty/packages/empty/README.md) |
| Overview | [overview](overview/packages/overview/README.md) |
| Primary | [primary](primary/packages/primary/README.md) |
| Independent | [empty](independent/packages/empty/README.md), [overview](independent/packages/overview/README.md) |
| Dual | [core](dual/packages/core/README.md), [consumer](dual/packages/consumer/README.md) |
| Re-exports | [core](reexports/packages/core/README.md), [facade](reexports/packages/facade/README.md) |
| Complex | [core](complex/packages/core/README.md), [domain](complex/packages/domain/README.md), [adapter](complex/packages/adapter/README.md), [service](complex/packages/service/README.md), [facade](complex/packages/facade/README.md), [unused](complex/packages/unused/README.md) |

The complex workspace has these dependencies:

```text
facade -> service -> domain  -> core
                 -> adapter -> core (peer)
                 -> unused
```

The three copies of the small core package are deliberately checked in with their workspaces.
Each repository can be inspected as a complete input without a runtime composition language or shared source injection.
The independent workspace likewise contains its own empty and overview packages.
Keep copies aligned when changing the shared relationship example intentionally.

## Primary inventory

[repositoryScenarios.ts](../../repositoryScenarios.ts) lists the expected root exports independently of the generated output.
[repositoryAssertions.ts](../../repositoryAssertions.ts) checks the inventory, syntax kinds, supporting-type retention, aliases, merged members, generic substitution, selections, and package relationships before snapshot comparison.

| API family | Fixture source | Evidence |
| --- | --- | --- |
| Functions and callable values | [functions.ts](primary/packages/primary/src/functions.ts) | Generics, overloads, optional/rest parameters, predicate/assertion signatures, callable variables, release levels, and a custom tag. |
| Interfaces and classes | [containers.ts](primary/packages/primary/src/containers.ts) | Generic inheritance, call/construct/index signatures, constructors, accessors, static members, abstract classes, and protected/private state. |
| Aliases and supporting declarations | [types.ts](primary/packages/primary/src/types.ts) | Literal unions, intersections, mapped/conditional/indexed types, utility composition, and an unexported supporting interface. Inline object members carry explicit release tags under the current classification contract. |
| Values and enums | [values.ts](primary/packages/primary/src/values.ts) | Mutable and constant values, unique-symbol keys, ordinary enums, and const enums. |
| Namespaces and merges | [merges.ts](primary/packages/primary/src/merges.ts) | Repeated interfaces/namespaces, nested namespaces, callable class augmentation, class/function/enum namespaces. The enum namespace constant has an explicit type to avoid invalid inferred declaration emission. |
| Export forms | [index.ts](primary/packages/primary/src/index.ts) | Same-package star, renamed, and type-only exports; named and anonymous default declarations; a default expression. |

The documented [module namespace entrypoint](primary/packages/primary/src/namespaceExport.ts) is part of the primary scenario's regular analysis configuration.
The scenario loop checks complete/public reports, full model and documentation-index snapshots, and detached reuse for both declaration producers, including the [TS6 namespace report](../../snapshots/repository/primary/typescript6/primary.namespace.public.md) and [TS7 namespace report](../../snapshots/repository/primary/typescript/primary.namespace.public.md).
Cross-package aliases, type-only paths, defaults, documentation links, and release validation are covered by the [suite tests](../../suite.test.ts).

The [inherited-member entrypoint](primary/packages/primary/src/privateInheritance.ts) also participates in the primary scenario.
Its public and complete reports preserve protected visibility and inherited getter/setter syntax without redeclaring base-private state.
The model and source-free index retain the original accessor documentation identities.
Generic and mapped accessor consumer checks, including heritage fallbacks, are covered by the [suite fixtures](../suite/README.md).
Trimmed declaration rollups and their TS6/TS7 consumer matrix remain Stage 4 work.

## Artifacts and isolation

The [repository snapshot directory](../../snapshots/repository) contains exact model JSON, complete/public report Markdown, and a test-owned documentation index for every successful workspace.
The index is generated by the checked-in [reader process](../../repositoryReader.ts), which receives only serialized models on standard input.
The tests remove fixture source and declaration directories before invoking it.
The reader rejects compiler and analysis imports, validates model-set input-order independence, and follows stored documentation identities and links.
Its index distinguishes the package storing an API record from the original source package of an inherited effective member.
It is not a production documenter or a website URL policy.

Both producer compilers use the same snapshots except for the primary example.
TS6 emits the default string expression with a literal type annotation; TS7 emits a literal initializer.
The primary model and reports retain that difference in separate `typescript6` and `typescript` directories.
Do not normalize source text, identities, offsets, hashes, or JSON formatting to make snapshots agree.
Generation in different temporary workspaces must reproduce the accepted bytes.

Normal tests never update snapshots.
For an intentional update, generate each package through the public API in the order listed in its fixture, review the semantic assertions, and compare both producer outputs before replacing the accepted files.
Regenerate downstream models after their dependencies, because dependency fingerprints are part of the format.
Failures use checked-in replacement source files under workspace `variants` directories; JSON corruption and file deletion operate only on temporary artifacts.
The tests distinguish source-file freshness during installed-suite analysis from model-content freshness during source-free decoding.

Run the repository suites after building the package:

```sh
pnpm build
pnpm exec mocha --no-config lib/test/repository.test.js lib/test/repositoryFailures.test.js --timeout 20000
```

The normal `pnpm test` command also discovers both suites.

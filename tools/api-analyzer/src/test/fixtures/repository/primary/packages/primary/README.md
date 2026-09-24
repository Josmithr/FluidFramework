# Primary API-kind example

`@scenario/primary` is the main single-package example for API-kind and export-form coverage.
It has no dependencies or selected dependency models.
The other workspaces use smaller APIs to isolate package relationships.

## API inventory

| Source | Scenarios |
| --- | --- |
| [functions.ts](src/functions.ts) | Generic functions, mixed-release overloads, optional and rest parameters, type predicates, assertion signatures, callable values, all four release levels, and a custom modifier tag. |
| [containers.ts](src/containers.ts) | Properties and methods, optional and readonly members, generic inheritance, call/construct/index signatures, constructors, accessors, static members, abstract classes, and original private/protected state. |
| [types.ts](src/types.ts) | Primitive and literal aliases, intersections, mapped/conditional/indexed types, utility composition, and an unexported supporting interface. |
| [values.ts](src/values.ts) | Constants, mutable exports, unique-symbol keys, ordinary enums, and const enums. |
| [merges.ts](src/merges.ts) | Repeated interfaces and namespaces, nested namespaces, callable class augmentation, and class/function/enum namespace merges. |
| [namespaceExport.ts](src/namespaceExport.ts) | A documented public module namespace whose members retain their original declarations and identities. |
| [index.ts](src/index.ts) | Package documentation, same-package star exports, renamed exports, type-only exports, named and anonymous default declarations, and a default expression. |

The [package manifest](package.json) and [analyzer configuration](analyzer.json) expose the root, populated `./values` and `./namespace` subpaths, and an empty `./empty` subpath.
The package documentation belongs to the package, not to an individual subpath.

## Expected behavior

- The root exports match the independent inventory in [repositoryScenarios.ts](../../../../../repositoryScenarios.ts).
- Renamed exports retain their original declaration identity, and `StoreType` remains type-only.
- The `./namespace` surface exports the public `Values` namespace with its own documentation; its members share the targets exported directly through `./values`.
- The model retains the unexported `Support` interface without making it a package export.
- Generic member substitution and merged-interface members appear in the model.
- Public reports exclude alpha and internal functions; complete reports retain them.
- Custom-tag selection includes the tagged function, and an unmatched selection produces an empty report.
- Report selection does not filter the model or change subsequent output generation.
- All successful surfaces can be consumed from serialized models after fixture sources and declarations are removed.

[Semantic assertions](../../../../../repositoryAssertions.ts) complement the full report, model, and documentation-index snapshots.
This coverage does not establish every combination of TypeScript syntax or trimmed-rollup support.

## Known report limitations

The separate [variant configuration](analyzer.variants.json) exposes only [privateInheritance.ts](src/privateInheritance.ts), which derives from a class with private and protected state and still fails report generation.
The tests require that rejection without skipping it; it records unsupported behavior, not successful support.
The successful inventory instead keeps non-public members on their original class and uses a public abstract base for its derived-class example.
Inline object-type members in the successful alias example have explicit release tags under the current classification contract.

## Baselines

The [TS6 snapshots](../../../../../snapshots/repository/primary/typescript6) and [TS7 snapshots](../../../../../snapshots/repository/primary/typescript) are separate because [expressionDefault.ts](src/expressionDefault.ts) emits different declaration text.
TS6 uses a literal type annotation for the default string expression; TS7 uses a literal initializer.
The snapshots preserve that difference without normalization.

See the [fixture guide](../../../README.md) for setup, test commands, and baseline review rules.

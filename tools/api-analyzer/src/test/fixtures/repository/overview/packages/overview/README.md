# Package documentation without exports

`@scenario/overview` validates package-owned documentation independently of exported APIs.
It has no dependencies.
The [source entrypoint](src/index.ts) combines a `@packageDocumentation` comment with `export {}`.

## Expected behavior

- The root entrypoint has no exports and the model has no API documentation records.
- The package overview remains in the model's package documentation, not in a synthetic declaration record.
- Reports retain the overview even when no APIs are selected.
- The source-free reader includes the package documentation and empty surface using only the serialized model.

Compare this package with the [empty package](../../../empty/packages/empty/README.md), which has no package documentation.
The accepted [model](../../../../../snapshots/repository/overview/overview.api.json), [public report](../../../../../snapshots/repository/overview/overview.root.public.md), and [documentation index](../../../../../snapshots/repository/overview/index.json) capture the difference.
Both producer compilers use the same snapshots.

See the [fixture guide](../../../README.md) for shared execution and baseline rules.

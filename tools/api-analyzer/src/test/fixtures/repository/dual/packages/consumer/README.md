# Dependency use without re-exports

`@scenario/consumer` depends directly on [core](../core/README.md) but re-exports none of its bindings.
Its [source entrypoint](src/index.ts) exports only `consumer` and `Implementation`.
The [analyzer configuration](analyzer.json) selects the dependency's model through the scoped suite pattern.

## Expected behavior

- `consumer` inherits the description from core's `source` function, including its link to core's beta `target`.
- `Implementation` implements `Contract<string>` and retains the effective `(value: string): string` member signature.
- The implementation's member documentation inherits the original contract description.
- The consumer's own documentation links can target core APIs without requiring their re-export.
- Reports expose consumer bindings, not additional exports for dependency types.
- The model records core's content fingerprint and retains original documentation provenance.
- The source-free reader follows inherited link IDs to core using only the two models.

The accepted [model](../../../../../snapshots/repository/dual/consumer.api.json), [public report](../../../../../snapshots/repository/dual/consumer.root.public.md), and [workspace index](../../../../../snapshots/repository/dual/index.json) are shared by both producer compilers.
Required external imports in declaration rollups remain a future Stage 4 check.

See the [fixture guide](../../../README.md) for shared execution and baseline rules.

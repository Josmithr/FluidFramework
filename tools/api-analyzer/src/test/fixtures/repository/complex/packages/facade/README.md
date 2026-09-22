# Transitive facade and original-scope links

`@scenario/facade` is the final consumer in the complex workspace.
Its [manifest](package.json) declares only [service](../service/README.md) directly.
The other selected packages are discovered through transitive and peer relationships.

## Expected behavior

- The [source entrypoint](src/index.ts) renames `serviceAlias` to `facadeAlias`, which still targets core's original `source` API.
- `operation` retains the service-owned API record and its core-origin inherited documentation.
- The type-only `Contract` export refers to service's `Service` interface without adding a value export.
- A local internal `target` does not capture the inherited link to core's beta `target`.
- Public reports omit the local internal function, while complete reports and the model retain it.
- [Glob selection](analyzer.json) and [explicit selection](analyzer.explicit.json) produce identical models.
- The model records all selected dependencies, including the unused package, and rejects missing or stale required models.

The source-free reader must follow these export and documentation IDs across the complete model set without fixture sources or compiler imports.
The accepted [model](../../../../../snapshots/repository/complex/facade.api.json), [public report](../../../../../snapshots/repository/complex/facade.root.public.md), and [workspace index](../../../../../snapshots/repository/complex/index.json) are shared by both producer compilers.

See the [fixture guide](../../../README.md) for the full graph and baseline rules.

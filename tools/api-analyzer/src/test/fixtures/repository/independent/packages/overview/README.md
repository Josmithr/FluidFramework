# Independent documented package

`@scenario/overview` is the documented package in a workspace containing two unrelated packages.
It has no dependency edge to its [empty sibling](../empty/README.md).
The [source entrypoint](src/index.ts) contains package documentation but exports no APIs.

## Expected behavior

- The model and reports retain this package's overview without adding API exports.
- The overview is not copied into the sibling package.
- Neither model records dependency fingerprints or external API references to the other package.
- Decoding the two models together preserves separate package identities and documentation.

This is a checked-in copy of the [single overview package](../../../overview/packages/overview/README.md).
Its role here is to distinguish shared repository membership from dependency relationships.
The accepted [model](../../../../../snapshots/repository/independent/overview.api.json) and [workspace index](../../../../../snapshots/repository/independent/index.json) are shared by both producer compilers.

See the [fixture guide](../../../README.md) for shared execution and baseline rules.

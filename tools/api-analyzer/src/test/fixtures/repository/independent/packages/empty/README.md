# Independent empty package

`@scenario/empty` is one of two unrelated packages in the independent workspace.
Neither this package nor its [overview sibling](../overview/README.md) declares a dependency on the other.
The [source entrypoint](src/index.ts) exports no APIs and has no package documentation.

## Expected behavior

- The model retains an empty root surface and no API documentation records.
- Reports contain no selected exports.
- Both packages can be decoded together without creating dependency fingerprints or external API references.
- Sharing a repository does not make the packages depend on each other in an analysis suite.
- The source-free documentation index lists both packages independently.

This is a checked-in copy of the [single empty package](../../../empty/packages/empty/README.md), used to validate repository independence rather than additional API kinds.
The accepted [model](../../../../../snapshots/repository/independent/empty.api.json) and [workspace index](../../../../../snapshots/repository/independent/index.json) are shared by both producer compilers.

See the [fixture guide](../../../README.md) for shared execution and baseline rules.

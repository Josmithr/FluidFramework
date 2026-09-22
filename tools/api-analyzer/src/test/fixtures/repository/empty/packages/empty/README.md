# Empty package

`@scenario/empty` validates a configured package with no exported APIs and no package documentation.
It has no dependencies.
The [source entrypoint](src/index.ts) contains `export {}` so it remains an external module.

## Expected behavior

- Analysis retains the configured root entrypoint with an empty export list.
- Complete and public-only reports contain no selected exports.
- The model has no API documentation records or package documentation, but retains package identity and input fingerprints.
- Output generation still works after the copied source and declaration files are removed.
- The source-free reader reports the package and its empty surface without inventing APIs.

The accepted [model](../../../../../snapshots/repository/empty/empty.api.json), [public report](../../../../../snapshots/repository/empty/empty.root.public.md), and [documentation index](../../../../../snapshots/repository/empty/index.json) record these outcomes.
Both producer compilers use the same snapshots.
An empty declaration rollup is a future Stage 4 check, not implemented coverage.

See the [fixture guide](../../../README.md) for the copy-only setup, test commands, and baseline update rules.

# Selected dependency without API references

`@scenario/unused` is an empty package declared as a dependency of [service](../service/README.md).
Its [source entrypoint](src/index.ts) contains only `export {}`.
It has no dependencies and no API targets for other packages to reference.

## Expected behavior

- Suite selection still requires this package's model.
- Downstream dependency fingerprints include it even when external API-reference tables do not.
- Removing its model must fail installed-suite analysis of the final facade.
- Omitting it from the complete source-free model set must also fail validation.
- Restoring its unchanged model permits the workflow to continue.
- Its own reports and model retain an empty root surface without invented exports.

This sixth package adds selected-but-unused coverage without changing the five-package chain and diamond.
The accepted [model](../../../../../snapshots/repository/complex/unused.api.json), [public report](../../../../../snapshots/repository/complex/unused.root.public.md), and [workspace index](../../../../../snapshots/repository/complex/index.json) are shared by both producer compilers.

See the [fixture guide](../../../README.md) for the full graph and baseline rules.

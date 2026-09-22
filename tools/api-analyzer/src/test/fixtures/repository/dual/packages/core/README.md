# Dependency API origin

`@scenario/core` supplies types and documentation to the [consumer package](../consumer/README.md).
It has no dependencies and is analyzed before the consumer.
The consumer uses its APIs without re-exporting them.

## Scenarios

The [source entrypoint](src/index.ts) declares three APIs:

- Public `source` has documentation linking to beta `target`, exercising a permitted public-to-beta documentation link.
- Beta `target` provides an identifiable destination for the inherited link.
- Public `Contract<TValue>` supplies generic member syntax and documentation for the consumer's implementation.

The core model owns these original documentation records.
The consumer model records its fingerprint and references core-owned IDs where needed.
Consumer-local names and export paths must not change those targets.

## Failure variant

The checked-in [invalid-link replacement](../../variants/core-invalid-link.ts) makes `target` internal and `source` beta.
Analysis must reject the non-internal-to-internal documentation link even though a public-only report would exclude the beta function.
The failure test replaces source only inside a temporary workspace.

The accepted [model](../../../../../snapshots/repository/dual/core.api.json), [public report](../../../../../snapshots/repository/dual/core.root.public.md), and [workspace index](../../../../../snapshots/repository/dual/index.json) capture the successful case with both producer compilers.
See the [fixture guide](../../../README.md) for shared execution and baseline rules.

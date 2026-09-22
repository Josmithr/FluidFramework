# Peer-dependency branch

`@scenario/adapter` is the second branch of the complex workspace's diamond.
Its [manifest](package.json) declares [core](../core/README.md) as a peer dependency rather than an ordinary dependency.
[Service](../service/README.md) consumes both this package and domain.

## Expected behavior

- The [source entrypoint](src/index.ts) declares `Adapter extends Contract<string>` without re-exporting core bindings.
- Suite discovery finds the selected peer's model through the installed workspace layout.
- Adapter and domain use the same core contract identity, despite reaching it through different dependency relationships.
- Effective inherited members retain substituted types and original core provenance.
- The adapter model records core's content fingerprint and must be regenerated after core changes.

The accepted [model](../../../../../snapshots/repository/complex/adapter.api.json), [public report](../../../../../snapshots/repository/complex/adapter.root.public.md), and [workspace index](../../../../../snapshots/repository/complex/index.json) are shared by both producer compilers.
This package validates a declared interface relationship, not a runtime adapter implementation.

See the [fixture guide](../../../README.md) for the full graph and baseline rules.

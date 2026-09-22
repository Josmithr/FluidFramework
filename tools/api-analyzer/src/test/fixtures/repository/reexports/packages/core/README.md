# Re-export origin package

`@scenario/core` owns the APIs exposed again by the [facade package](../facade/README.md).
It has no dependencies and is analyzed first.
Its [source entrypoint](src/index.ts) is the same small contract and documentation example used by the [dual-package core](../../../dual/packages/core/README.md).

## Expected behavior

- Public `source`, beta `target`, and generic `Contract<TValue>` retain their original identities when exported through the facade.
- The documentation link from `source` resolves to core's `target` before model generation.
- Renamed and type-only facade paths do not create new core declarations or change documentation ownership.
- The facade records the fingerprint of this package's model.
- Complete and public-only core reports remain independent of the facade's export spelling.

The accepted [model](../../../../../snapshots/repository/reexports/core.api.json), [public report](../../../../../snapshots/repository/reexports/core.root.public.md), and [workspace index](../../../../../snapshots/repository/reexports/index.json) are shared by both producer compilers.
Keep the copied core source aligned with the other relationship examples when making intentional changes.

See the [fixture guide](../../../README.md) for shared execution and baseline rules.

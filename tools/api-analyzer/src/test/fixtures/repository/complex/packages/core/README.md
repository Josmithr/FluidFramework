# Shared transitive API origin

`@scenario/core` is the shared dependency at the base of the complex workspace's chain and diamond.
[Domain](../domain/README.md) uses it as a dependency, while [adapter](../adapter/README.md) uses it as a peer dependency.
Core has no dependencies and is analyzed first.

## Expected behavior

- The [source entrypoint](src/index.ts) supplies public `source`, beta `target`, and generic `Contract<TValue>`.
- Both branches refer to the same original contract identity.
- Documentation inherited through intermediate packages retains the core description, section provenance, and link target.
- Renamed exports through domain, service, and facade still identify core's `source`.
- The facade's same-named local `target` must not capture the inherited documentation link.

## Freshness and recovery

The [updated-core variant](../../variants/core-updated.ts) changes the source description without changing exported API names.
After recompilation, the old model must fail installed-suite input-fingerprint validation.
After only the core model is regenerated, stale downstream models must still fail dependency-content validation.
Regenerating models in dependency order must restore successful analysis and expose the updated inherited description in the source-free index.

The accepted [model](../../../../../snapshots/repository/complex/core.api.json) and [workspace index](../../../../../snapshots/repository/complex/index.json) capture the original successful case with both producer compilers.
See the [fixture guide](../../../README.md) for the full graph and baseline rules.

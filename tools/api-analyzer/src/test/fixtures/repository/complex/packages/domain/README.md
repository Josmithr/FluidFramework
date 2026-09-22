# Generic inheritance and intermediate documentation

`@scenario/domain` is one branch between [core](../core/README.md) and [service](../service/README.md).
Its [manifest](package.json) declares core as a dependency.

## Expected behavior

The [source entrypoint](src/index.ts) combines three relationships:

- `Domain extends Contract<string>` retains the core base identity and substitutes `string` in effective members.
- `domainAlias` renames core's `source` without changing the original target.
- `inherited` has its own API identity but inherits documentation from core's `source`.

Service inherits from `inherited`, so this package makes documentation provenance and freshness transitive rather than merely direct.
The inherited description's link remains attached to core's `target`.
Receiver-specific member records can be stored in this model while their source provenance remains in core.
Rebuilding core alone must leave this model stale until domain is regenerated.

The accepted [model](../../../../../snapshots/repository/complex/domain.api.json), [public report](../../../../../snapshots/repository/complex/domain.root.public.md), and [workspace index](../../../../../snapshots/repository/complex/index.json) are shared by both producer compilers.
See the [fixture guide](../../../README.md) for the full graph and baseline rules.

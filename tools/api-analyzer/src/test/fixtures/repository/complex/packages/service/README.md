# Diamond composition and documentation propagation

`@scenario/service` joins the [domain](../domain/README.md) and [adapter](../adapter/README.md) branches and declares [unused](../unused/README.md) as an additional dependency.
The [facade](../facade/README.md) depends directly on service, making core and the other packages transitive dependencies of the final consumer.

## Expected behavior

- The [source entrypoint](src/index.ts) declares `Service extends Domain, Adapter` and retains the effective string conversion signature.
- Both branches still refer to the original core contract identity.
- `serviceAlias` renames the domain alias while preserving its core target.
- `operation` inherits documentation through domain's `inherited` function, including the core-origin section and link.
- The selected unused package contributes a required model fingerprint despite having no retained API references.
- Stale dependency models prevent successful analysis; dependency-first regeneration updates the inherited content.

The accepted [model](../../../../../snapshots/repository/complex/service.api.json), [public report](../../../../../snapshots/repository/complex/service.root.public.md), and [workspace index](../../../../../snapshots/repository/complex/index.json) are shared by both producer compilers.
Shared nominal class identity in generated declaration rollups remains future coverage; this diamond currently uses interfaces.

See the [fixture guide](../../../README.md) for the full graph and baseline rules.

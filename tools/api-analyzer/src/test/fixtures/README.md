# Test fixtures

Keep static TypeScript compiler inputs in this directory instead of constructing source strings in tests.
Tests copy only the required fixture groups into temporary projects.
Do not compile this directory as one project: some files require shared inputs or generated declarations, and some files represent replacement versions of the same module.

| Group | Purpose |
| --- | --- |
| [Shared inputs](shared/README.md) | Common API shapes for compiler, session, report, and lifecycle tests. |
| [Native compiler inputs](native/README.md) | Documentation lookup, inheritance boundaries, and comment retention through declaration emit. |
| [Declaration consumer](consumer/README.md) | Type-check printed declarations with both consumer compilers. |
| [Session inputs](session/README.md) | Export chains, cache invalidation, and conditional dependency resolution. |

Preserve each test's temporary project paths when moving fixtures.
Those paths affect declaration locations and provisional identifiers.
Keep expected outcomes in test assertions and complete generated outputs in the existing snapshot directory.
Normal tests must not update checked-in fixtures or snapshots.

Runtime writes remain appropriate for compiler output, project configuration, package metadata changes, and intentional transformations of existing source.
The overload-reordering test changes the order of declarations in a copied input instead of maintaining a duplicate of the entire API fixture.
Small TSDoc strings used directly by parser or resolver unit tests are not compiler source files and remain next to their assertions.

Run the contract tests from the package directory with `pnpm test:contracts`.
The native fixture guide also lists the separate declaration-consumer check.

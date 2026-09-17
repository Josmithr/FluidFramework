# Test fixtures

Keep static TypeScript compiler inputs in this directory instead of constructing source strings in tests.
Tests copy only the required fixture groups into temporary projects.
Do not compile this directory as one project: some files require shared inputs or generated declarations, and some files represent replacement versions of the same module.

| Group | Purpose |
| --- | --- |
| [Shared inputs](shared/README.md) | Common API shapes for compiler, session, report, and lifecycle tests. |
| [Native compiler inputs](native/README.md) | Documentation lookup, inheritance boundaries, and comment retention through declaration emit. |
| [Declaration consumer](consumer/README.md) | Type-check printed declarations with both consumer compilers. |
| [Analysis inputs](session/README.md) | Export chains, changed inputs, and conditional dependency resolution. |

Preserve each test's temporary project paths when moving fixtures.
Those paths affect declaration locations and provisional identifiers.
Keep expected outcomes in test assertions and complete generated outputs in the existing snapshot directory.
Normal tests must not update checked-in fixtures or snapshots.

Runtime writes remain appropriate for compiler output, project configuration, package metadata changes, and intentional transformations of existing source.
The overload-reordering test changes the order of declarations in a copied input instead of maintaining a duplicate of the entire API fixture.
Small TSDoc strings used directly by parser or resolver unit tests are not compiler source files and remain next to their assertions.

## Fixture comments

Apply these rules when adding or changing any TypeScript fixture, including `.d.ts` inputs.

- Start each module with an ordinary `/* ... */` overview that states what it validates and identifies required companion inputs or intentional limitations.
- Add ordinary `//` comments beside APIs whose validation role is not obvious, including members, aliases, re-exports, and consumer statements.
- Explain the expected distinction or constraint, such as hidden-target retention, original lookup scope, overload selection, or local-comment suppression.
- Use short, direct sentences in Simplified Technical English. Do not repeat the module overview beside an API whose role is already clear.
- Keep explanatory comments separate from tested TSDoc. Do not add descriptive TSDoc to an API whose absent, empty, malformed, or tag-only comment is the test input.
- Place explanatory comments after the complete tested TSDoc block or group and before its declaration. The pinned TS7 API includes preceding line comments in extracted TSDoc text, even across blank lines.
- Keep adjacent TSDoc comments and compiler directives attached to the same declarations or statements. If a test replaces an exact source block, put explanations outside that block.
- Verify that comment-only edits preserve code tokens, attached TSDoc, and expected fixture outcomes. Check tests that depend on source offsets or exact source replacements, and never update snapshots just to accept the edits.

Review the overview and API-level explanations as part of each fixture change.
Required explanatory comments describe the test, not additional product documentation to inherit or classify.

Run the contract tests from the package directory with `pnpm test:contracts`.
The native fixture guide also lists the separate declaration-consumer check.

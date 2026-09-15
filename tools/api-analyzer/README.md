# api-analyzer

This private ESM package contains the Stage 0 investigation for an API analysis tool built on the official native TypeScript 7 API.
It does not yet expose a supported analyzer API, generate production artifacts, or replace API Extractor.
Publication remains a separate decision.

## Development contract

Follow the [implementation plan](../plans/api-extractor-replacement-implementation-plan.md), including documentation-driven development, test-driven development, and functional architecture.
Write behavior contracts before implementation and run focused failing tests before adding or fixing behavior.
Write documentation in Simplified Technical English and follow the [repository documentation guidelines](../../docs/content/Guidelines/Documentation-Guidelines.md).
Keep compiler communication and process lifecycle separate from pure transformations.
Do not add a custom type checker, use compiler-private APIs, or switch backends to make a capability test pass.

## Stage 0 contract

Pin the analysis engine to TypeScript 7.0.2.
Build the same fixture with TypeScript 6.0.3 and 7.0.2, then analyze both sets of untrimmed declarations with TS7.
Use the official client and the installed native executable.
Keep generated fixture files in temporary directories and remove them after each test.

The capability tests must check:

- Exported aliases retain their public names and target identities; type-only paths remain distinguishable.
- Generic inherited members use their effective types. Ordinary intersections and `Pick`, `Omit`, and `Readonly` preserve member selection and modifiers.
- Documentation and callable overload information remain available after declaration emit.
- A retained connection and snapshot support repeated output-like queries without a new analysis setup. Record the limits of any reuse evidence.
- Normal disposal and native-process failure terminate promptly and do not leave owned processes running.
- Public APIs needed for complete and release-filtered declarations are available and produce consumable output, or an explicit capability failure is recorded.

Compiler capability failures are investigation results, not permissions to lower requirements.
Do not close F1-F4 or B1-B6 based only on these small fixtures.
Full artifact, cross-package, and migration tests belong to later stages.

## Commands

Run these commands from this package directory to install pinned dependencies and execute the investigation:

```sh
pnpm install
pnpm test
pnpm check:format
```

The package has an independent workspace and lockfile so it does not change the client release group's compiler.
The test build uses TS7. TS6 is a fixture-build and consumer-check dependency only, not an analysis fallback.

## Stage 0 results

Verified on 2026-09-15 in the Linux codespace after restarting the interrupted session.
The package build and `pnpm check:format` pass.
`pnpm test` reports **19 passing tests and 3 failing tests** and exits unsuccessfully.
The failures remain active capability gates. Do not treat this package as ready for production integration or add its test command to required repository CI without resolving their disposition.

The analysis engine is TS7 7.0.2. Input builds use TS6 6.0.3 and TS7 7.0.2.
The package remains private with an independent lockfile; this does not resolve the publication decision.

### Verified capabilities

The [native capability tests](src/test/nativeCapabilities.test.ts) run the same assertions against declarations built with both compiler versions.
They verify:

- Declaration inputs have no syntactic, semantic, or program diagnostics for the small fixture.
- Public aliases retain their names and share the expected target identity. Export syntax distinguishes type-only paths.
- Generic class and interface members specialize to the expected consumer type.
- Ordinary intersections and the tested combinations of `Pick`, `Omit`, and `Readonly` expose the expected members.
- Public type-node conversion exposes effective readonly and optional modifiers.
- Two callable overloads retain their separate comments and release tags after declaration emit.
- Printing the existing complete declaration files produces output that compiles with both consumer compilers. This covers all four input-build and consumer-compiler combinations.
- A repeated export lookup returns the same cached result with zero recorded compiler requests. Several semantic queries use the same retained snapshot and project.

The [lifecycle tests](src/test/lifecycle.test.ts) and [worker](src/test/lifecycleWorker.ts) also verify synchronous and asynchronous normal disposal in bounded Linux worker processes.
The synchronous client passes a source-based semantic query, cached lookup, snapshot-disposal checks, and a native-process termination probe.
The harness terminates the worker process group during cleanup, including after a failed test.

### Blockers and limits

| Finding | Evidence | Consequence |
| --- | --- | --- |
| No retained-program declaration emission in the tested API | Both `GATE W5` tests fail because the program exposes neither `emit` nor `getDeclarationEmit`. | Review the generation strategy before production implementation. This is a missing capability in the tested approach, not proof that W5 is impossible through every public API. |
| Async request does not settle after native termination | The async crash worker exits with code 13 and an unsettled top-level await at `assert.rejects(api.getTimingInfo())`. | Do not select the async client without resolving or containing this failure through an approved design. The test does not establish the behavior of every operation or failure mode. |
| Reuse evidence is narrow | A cached export query records zero requests; related queries retain their snapshot. | This does not measure compiler-wide recomputation or prove reuse across implemented reports, validation, models, and declarations. Those tasks do not exist yet. |
| Generation evidence is narrow | Existing declaration source files are printed and consumed successfully. Fixture declaration builds invoke the compiler CLI separately. | Neither operation proves trimmed rollups, dependency inclusion, import cleanup, or generation from retained semantic analysis. |
| Lifecycle evidence is platform-specific | Process checks use Linux `/proc` and process groups. | Windows and macOS lifecycle behavior is unverified. Test cleanup is not a production lifecycle implementation. |

The full semantic fixture suite currently uses the async client.
The synchronous client has only the smaller semantic and lifecycle comparison described above.
Its passing crash probe makes it a reasonable next candidate, not a fully validated replacement for the async path.
Synchronous calls also block the calling Node.js thread; assess that trade-off before selecting the public session design.

No full W/F/B requirement is closed by this investigation.
Cross-package documentation resolution, custom policy, release filtering, stable artifact identities, invalidation, cancellation, and representative repository packages remain untested.
No production analyzer API, custom compiler bridge, compiler patch, or migration was added.

### Review decisions

1. **Declaration generation:** Decide whether to evaluate a newer published TS7 API or an existing compatible generation component. Preserve the shared-analysis requirement. Do not assume development-only emit APIs are released or silently use TS6 analysis.
2. **Client selection:** Consider the synchronous client for the next stage, then run the full semantic suite through it and document blocking, cancellation, and crash behavior before approval.
3. **Capability gate handling:** Keep the reproductions visible. Decide how to separate investigation gates from a future required production test suite without representing unresolved capabilities as passing.
4. **Upstream follow-up:** Confirm current upstream coverage for both findings and record exact issue links before filing a new report. This resumed verification has not established those links or filed issues.

Stage 0 has produced a scaffold and reproducible capability evidence, including failed gates.
Production architecture and Stage 1 implementation remain pending review of these findings.

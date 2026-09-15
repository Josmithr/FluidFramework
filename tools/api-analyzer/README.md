# api-analyzer

This private ECMAScript module (ESM) package provides an experimental, reusable analysis session.
It uses the official native TypeScript 7 API and includes the Stage 0 compiler capability tests.
Its API is not stable. It does not generate production artifacts or replace API Extractor.
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

## Stage 1 contract

Stage 1 implements an experimental synchronous analysis session, not a stable public package API.
Run the full declaration-input capability suite through the synchronous TS7 client before relying on it.
Retain the separate async crash reproduction and declaration-emission investigation gates.

Resolve programmatic configuration with ordered base configurations and explicit overrides.
Use `@eslint/object-schema` to validate property types and merge the ordered layers.
Use the last supplied scalar value, replace supplied arrays, and merge rule settings by rule name.
Treat `null` and `undefined` property values as omitted.
Reject inheritance cycles, missing required settings, and duplicate entrypoint names with structured diagnostics.
Return readonly effective configuration without mutating the supplied configuration objects.
Resolve relative paths from the working directory supplied by the caller, not from the process working directory.

An analysis session owns its compiler connection and cached API facts.
These facts are detached: they contain no compiler objects and remain usable after the compiler snapshot is disposed.
Repeated requests for unchanged inputs reuse the same facts.
Task order and changes to rule settings do not affect reuse.
Explicit invalidation discards cached facts and compiler state before the next request.
Callers must invalidate after relevant changes to inputs or module resolution settings.
Automatic file watching and persistent caching are not part of this stage.
Repeated close calls have no effect. Requests after close fail with a diagnostic that explains how to recover.
An unexpected adapter failure clears owned state and closes the session.
Later requests must not return cached success. Create a new session to recover.
Synchronous calls run one at a time and block the calling Node.js thread.
An active call cannot be canceled.
The session extracts facts and disposes of the corresponding snapshot.
It retains the compiler connection for other configurations and the facts for repeated tasks.
Cached requests do not contact the compiler and cannot detect a compiler-process failure.

Facts retain exported names separately from declaration identifiers.
They also retain type-only export paths, namespace exports, merged declarations, effective members, and individual call signatures.
Use portable data without compiler handles. Report limitations when a representation is incomplete.
Identifiers are provisional and must not use compiler handle numbers or traversal order.
The Stage 1 representation is not yet a versioned documentation model or a complete API reference graph.

## Experimental API

The following example resolves configuration and reuses one analysis result for several consumers.
The configured project must include the declaration entrypoint and its dependencies.
All relative configuration paths use the supplied working directory, including paths inherited from base configurations.

```typescript
import { createAnalysisSession, resolveConfiguration } from "api-analyzer";

const resolved = resolveConfiguration(
	{
		packageName: "example-package",
		project: "tsconfig.api.json",
		entrypoints: [{ name: ".", path: "lib/index.d.ts" }],
		rules: { documentation: false },
	},
	process.cwd(),
);

if (!resolved.ok) {
	throw new Error(JSON.stringify(resolved.diagnostics));
}

const session = createAnalysisSession();
try {
	const first = session.analyze(resolved.value);
	if (!first.ok) {
		throw new Error(JSON.stringify(first.diagnostics));
	}

	// Consumers share frozen facts without retaining compiler handles.
	console.log(first.value.surfaces);
	console.log(first.value.declarations);
	const repeated = session.analyze(resolved.value);
	console.log(repeated.ok && repeated.value === first.value);

	// Call this after a relevant file, dependency, or configuration change.
	session.invalidate();
} finally {
	session.close();
}
```

`resolveConfiguration` returns structured diagnostics for missing settings, invalid entrypoints, duplicate names, and inheritance cycles.
`packageRoot` defaults to the supplied working directory.
Supplied arrays replace inherited arrays. Rule maps merge by key.
An explicit `false` rule value overrides an inherited `true`.
You can inspect rule settings at this stage, but the analyzer does not execute the rules.
Compiler options and module resolution conditions come from the selected TypeScript project.
Use separate project configurations for different conditions.

`analyze` returns deeply frozen facts or diagnostics. Compiler diagnostic failures do not produce partial success.
Entrypoint order and changes to rule settings do not invalidate facts.
Changing the configured set of entrypoints creates a separate cache entry.
`invalidate` discards all cached facts and closes the current compiler connection.
The next request creates a new compiler connection.
Repeated `close` calls have no effect. Later analysis requests return `session-closed`.
`getStatistics` returns the counts of adapter analysis calls, cache hits, and invalidation calls made while the session was open.
Analysis calls that fail still contribute to the analysis count.
The counters do not measure compiler-internal work and are not reset by invalidation or close.

Declaration and signature identities are provisional. Tests cover separate aliases, namespaces, merged declarations, overload reordering, and checkout relocation.
They do not establish a complete identity scheme for multiple installed versions of the same package or every anonymous and computed declaration.
Member facts preserve effective type text, optional and readonly state, and declaration locations.
Incomplete member expansion produces `partial` and diagnostics while preserving the original declaration text.
Signature documentation contains raw declaration text, not parsed or resolved TSDoc comments.
Construct signatures, structured index signatures, and a complete graph of referenced types are not part of this initial fact format.

## Commands

Run these commands from this package directory to install pinned dependencies and execute the investigation:

```sh
pnpm install
pnpm test:stage1
pnpm check:format
```

The package has an independent workspace and lockfile so it does not change the client release group's compiler.
The test build uses TS7. TS6 is a fixture-build and consumer-check dependency only, not an analysis fallback.
Run `pnpm test` to include all Stage 0 investigation gates as well. That command intentionally remains unsuccessful while the three recorded gates fail.
`test:stage1` retains its existing command name and selects the `Effective configuration`, `Analysis session`, and `Adapter fact extraction` suites, plus session-lifecycle worker tests.
Test names describe behavior. Applicable design identifiers appear in comments above tests.
Temporary investigation tests have comments that explain their purpose and when to remove or replace them.
The focused command is not a claim that the excluded gates pass.

## Stage 0 results

Verified on 2026-09-15 in the Linux codespace after restarting the interrupted session.
The package build and `pnpm check:format` pass.
At the end of Stage 0, `pnpm test` reported **19 passing tests and 3 failing tests** and exited unsuccessfully.
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
| No retained-program declaration emission in the tested API | The `retained Program exposes declaration emission` test fails for each input compiler because the program exposes neither `emit` nor `getDeclarationEmit`. Its comment identifies it as a temporary W5 capability probe. | Review the generation strategy before production implementation. This is a missing capability in the tested approach, not proof that W5 is impossible through every public API. |
| Async request does not settle after native termination | The async crash worker exits with code 13 and an unsettled top-level await at `assert.rejects(api.getTimingInfo())`. | Do not select the async client without resolving or containing this failure through an approved design. The test does not establish the behavior of every operation or failure mode. |
| Reuse evidence is narrow | A cached export query records zero requests; related queries retain their snapshot. | This does not measure compiler-wide recomputation or prove reuse across implemented reports, validation, models, and declarations. Those tasks do not exist yet. |
| Generation evidence is narrow | Existing declaration source files are printed and consumed successfully. Fixture declaration builds invoke the compiler CLI separately. | Neither operation proves trimmed rollups, dependency inclusion, import cleanup, or generation from retained semantic analysis. |
| Lifecycle evidence is platform-specific | Process checks use Linux `/proc` and process groups. | Windows and macOS lifecycle behavior is unverified. Test cleanup is not a production lifecycle implementation. |

At the end of Stage 0, the full semantic fixture suite used the async client and the synchronous client had only the smaller comparison described above.
Stage 1 reran the full fixture suite through the synchronous client before using it for the experimental session.
The async crash reproduction remains separate and unresolved.

No full W/F/B requirement is closed by this investigation.
Cross-package documentation resolution, custom policy, release filtering, stable artifact identities, invalidation, cancellation, and representative repository packages remain untested.
No production analyzer API, custom compiler bridge, compiler patch, or migration was added.

### Review decisions

1. **Declaration generation:** Decide whether to evaluate a newer published TS7 API or an existing compatible generation component. Preserve the shared-analysis requirement. Do not assume development-only emit APIs are released or silently use TS6 analysis.
2. **Client selection:** Consider the synchronous client for the next stage, then run the full semantic suite through it and document blocking, cancellation, and crash behavior before approval.
3. **Capability gate handling:** Keep the reproductions visible. Decide how to separate investigation gates from a future required production test suite without representing unresolved capabilities as passing.
4. **Upstream follow-up:** Confirm current upstream coverage for both findings and record exact issue links before filing a new report. This resumed verification has not established those links or filed issues.

Stage 0 has produced a scaffold and reproducible capability evidence, including failed gates.
The declaration-generation strategy and upstream reproductions remain open follow-ups. Stage 1 proceeds independently of those generation gates.

## Stage 1 results

Verified on 2026-09-15: `pnpm test:stage1` passes all 28 selected tests.
The build and formatter pass.
The earlier full `pnpm test` run reported 34 passing tests and the same 3 unresolved Stage 0 failures.
That full-suite count predates the additional configuration and extraction-helper tests.
The full suite was not rerun for the helper extraction refactor or the test-name changes.

The [configuration tests](src/test/configuration.test.ts), [session tests](src/test/session.test.ts), [native capability tests](src/test/nativeCapabilities.test.ts), and [lifecycle tests](src/test/lifecycle.test.ts) cover the initial contracts.
They verify ordered configuration inheritance, immutable effective settings, shared frozen facts, explicit invalidation, and failure handling.
The session analyzes declarations built with TS6 6.0.3 and TS7 7.0.2 through TS7 7.0.2.
The full synchronous semantic suite also passes the original semantic and printing checks; the missing emit-method gates still fail.

Additional tests verify chained type-only exports, namespace and merged declaration facts, effective members, separate overload identities, and explicit incomplete expansion.
Node and browser dependency fixtures retain their distinct types and package origins.
Tests verify fresh-session agreement after dependency changes and identical facts after checkout relocation.
Linux worker tests verify session disposal and that the session remains closed after it detects a compiler-process failure.

The adapter's extraction helpers are module-level functions with explicit dependencies.
They are exported from the internal adapter module for tests, not from the package entrypoint.
Each extraction owns its package-location cache and declaration tracking state.
Compiler-dependent helper tests use the existing real-compiler fixtures instead of compiler mocks.
Direct tests cover package locations, aliases, type-only exports, members, signatures, and declaration collection.
They also check cache separation, repeated collection, and the active-identifier guard.

The implementation uses pure configuration and immutable data, with native communication, filesystem access, and caches isolated in the adapter and session.
It does not start Stage 2 policy or report implementation, close the full W/F/B requirements, or resolve the Stage 0 declaration-generation limitation.

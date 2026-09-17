# `api-analyzer` API Proposal

Status: API direction agreed on 2026-09-17; an initial callable-analysis implementation is available.
The [README](README.md#experimental-api) describes the implemented subset and remaining limitations.
The agreed [architecture proposal](Architecture-Proposal.md) defines the completed graph, source layers, and dependency boundaries.
This proposal supersedes the reusable session API direction in the implementation plan.
Keep the functional API as narrow as reasonably possible.
Supporting types can also be exported.

## Proposed flow

The user calls `analyzeAPIs` with ordinary configuration to analyze one package.
The function resolves configuration internally and completes shared analysis before returning a successful result.
Callers do not need to call `resolveConfiguration` separately.
The proposed return type is `Promise<Result<APIAnalysis>>`.

The following example starts analysis and waits for either a completed analysis or expected validation diagnostics.
The configuration identifies the package and the suite of dependency model artifacts to load.

```typescript
// Dependency packages have already generated their API models.
// Successful analysis is available as result.value; expected failures return diagnostics.
const result = await analyzeAPIs(configuration);
```

`APIAnalysis` is the focal point of the functional API.
It represents completed analysis with private, immutable data, not a live compiler session.
It has no `analyze`, `invalidate`, or `close` method.

It should offer the following capabilities:

- Generate declaration rollups for configured entrypoints.
- Generate API model artifacts for dependency analysis and documentation generation.
- Generate API reports.
- Expose API statistics, such as declaration counts and documentation coverage.

Declaration rollup generation remains required functionality.
The initial report method and API counts are documented in the README.
Model and rollup method signatures, artifact schemas, and broader statistics remain to be specified.
API statistics are distinct from analysis timing and cache counters.

## Completion and outputs

Successful analysis includes configuration resolution, suite loading, fact extraction, classification, documentation resolution, and configured semantic validation.
These steps produce a completed, output-independent analysis graph with original metadata, resolved documentation and links, declaration relationships, export identities, and provenance.
Mutable compiler and parser state remains private to analysis and is not part of that graph.
Output methods reuse these results without repeating full analysis or shared validation.
Report, model, and rollup generation are independent consumers of the graph, composed by the package-root API.
Shared semantic selection rules must not be duplicated between generators or placed in generic utilities.
Output-specific option errors can still produce diagnostics during generation.
Raw facts and intermediate pipeline operations remain internal.

Release compiler resources before returning the completed analysis, including on failure.
Collect all data needed for later output generation while compiler resources are available.
Verify that declaration rollups can be generated under this resource contract.
If the compiler cannot support this contract, record a blocker rather than silently retain a live session or remove rollup support.

Initially, output methods return artifact content, such as report text and serializable model data, rather than write files.
Model generation uses an explicit versioned format rather than exposing the current internal object layout through JSON serialization.
Stable identities, graph references, and format compatibility require documented contracts and tests.
The caller controls file writes.
Baseline acceptance remains an explicit action and must not occur as a side effect of generation.

## Failures and execution

Expected configuration and API-validation failures return diagnostics through `Result`.
Internal invariant failures and unexpected operational failures reject the promise.
Cleanup must preserve the original failure, including when cleanup also fails.

The asynchronous entrypoint does not require the native asynchronous compiler client.
The initial implementation can retain the synchronous compiler adapter and must document its event-loop blocking behavior.
Do not adopt the native asynchronous client until its unresolved process-termination failure is resolved or contained through an approved design.

## Dependency models

Dependency packages must generate their API models before this package is analyzed.
The package-root composition reads the artifacts and invokes decoding and validation owned by the model layer.
It passes validated dependency data to analysis, which does not depend on the model implementation.
Validate the identity, format compatibility, and completeness of every selected suite model, including models not referenced by documentation links.
Dependency models do not replace the type declarations used for compiler analysis.

## Build workflow and future caching

Each package runs the tool after `tsc` generates its declaration inputs.
The initial version does not support source invalidation or watch mode.
Changes require a new call to `analyzeAPIs`.
Reusing one completed analysis across multiple outputs remains required.

Persistent reuse across builds is deferred to a future follow-up.
Investigate hashing relevant declarations, configurations, dependency models, and tool versions to detect unchanged inputs.
Do not assume a portable API model contains enough data to restore a complete analysis.
Determine whether restoration can use that model or needs a separate cache artifact, and verify equivalence with fresh analysis for all supported outputs and validation.
This deferral does not defer model decoding and validation required by suite resolution.
Re-running analysis when nothing has changed is acceptable for the initial version.

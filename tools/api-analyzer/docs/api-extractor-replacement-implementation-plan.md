# API tooling replacement: implementation plan

## Status and objective

API direction updated on 2026-09-17: adopt the agreed [one-shot API proposal](API-Proposal.md).
The reusable public session has been removed in favor of `analyzeAPIs(configuration): Promise<Result<APIAnalysis>>`.
The implementation completes supported declaration and member classification, documentation resolution, and configured reference validation before success and closes the compiler connection before returning.
The completed analysis exposes effective configuration, API counts, selected declaration reports, and versioned dependency-model generation.
The Stage 2 review and validation implementation now covers the structural merge gaps and named declaration selectors identified in the acceptance audit.
Both resolution-scope decisions are approved: follow TSDoc reference syntax, and deduplicate, resolve, then merge inherited documentation.
The later 2026-09-20 decision explicitly excludes module-based references for now; named package-qualified APIs remain supported.
Stage 2 is complete as of 2026-09-20 under the user's accepted scope, following the code/documentation audit and package self-report check.
The user explicitly deferred the remaining follow-ups until the rest of the library is implemented, including the [unnamed-selector parser limitation](api-extractor-replacement-follow-ups.md#verify-and-report-the-tsdoc-unnamed-selector-mismatch).
This is an accepted limitation, not an assertion of full TSDoc conformance.
Stage 3 implements portable documentation models and source-free artifact readers; declaration rollups remain Stage 4.
Declaration rollups remain required.
Source invalidation and watch mode are not initial API requirements; persistent reuse across builds is deferred.
Architecture direction agreed on 2026-09-17: follow the [layered architecture proposal](Architecture-Proposal.md).
The initial source-directory migration is implemented for utilities, shared contracts, analysis, and report generation.
Analysis completion owns documentation resolution and returns a frozen graph for the supported declaration and member scope.
Reporting consumes that graph without compiler or parser access.
The model layer owns versioned declaration/documentation encoding, decoding, and single-model and cross-model validation; rollups remain pending.
`good-fences` enforces the implemented boundaries through package lint, with a positive/negative TypeScript ESM import regression.

Historical checkpoint: The initial Stage 1 configuration resolver, compiler adapter, and reusable synchronous session passed 29 focused contract tests on 2026-09-15.
The adapter returns facts that contain no compiler objects.
The first Stage 2 increment implements TSDoc-based release classification and configurable metadata selection, with 45 combined contract tests passing on 2026-09-15.
The subsequent baseline-handling increment adds pure comparison, read-only file checks, and explicit updates, with 48 combined contract tests passing on 2026-09-15.
An initial function-only review report builder and Markdown renderer use checked-in snapshots for full-report tests.
The combined contract suite passes 54 tests, including configurable report presentation and snapshots for TS6- and TS7-built declarations, verified on 2026-09-15.
Those counts describe historical increments, not the current Stage 2 implementation.
Current tests also cover declaration reports, configured reference policies, dependency models, conditional-export parity, and a small repository pilot.
See the [Stage 0 results and review decisions](../README.md#stage-0-results) for reproducible evidence.
The Stage 0 probe recorded 19 passing checks and 3 failures: missing retained-program declaration emission for both input compilers and async request handling after native termination.
The [Stage 1 results and experimental API](../README.md#stage-1-results) describe the new tests and limits.
The full semantic fixture suite now runs through the synchronous client.
Declaration generation and minimal examples for upstream issue reports remain open tasks.
Stage 1 does not depend on an emit method and does not resolve the asynchronous client failure.

Build `api-analyzer`, a standalone, repository-independent API tooling package at `tools/api-analyzer`, using the official native TypeScript 7 tooling.
Replace the repository's API Extractor workflows without reproducing its known defects or requiring complete API analysis to restart for each task.
The package name and location are confirmed. Publication details remain open.

This plan implements the [workflow requirements](api-extractor-replacement-requirements.md) and [new capabilities and regression coverage](api-extractor-replacement-new-features.md).
The [tooling research](api-extractor-replacement-tooling-research.md) records the evidence and limitations behind the technology choice.
The [follow-up tracker](api-extractor-replacement-follow-ups.md) records deferred investigations and improvements separately from delivery-stage work.
Requirements take precedence over proposed implementation details in this plan.
An implementation blocker must produce a documented decision request, not an unapproved requirement reduction or backend substitution.

## Confirmed decisions

- Name the package `api-analyzer` and place it at `tools/api-analyzer`.
- Use the official native TS7 semantic tooling as the planned analysis backend. Do not build a TypeScript parser, type checker, or native compiler bridge.
- One TS7 engine may analyze packages authored or built with TS6 or TS7 using TS7 semantics. Matching the TS6 checker's behavior is not required.
- Compiler child processes are acceptable during analysis. One completed `APIAnalysis` must serve requested outputs without repeating full analysis or shared validation.
- Accept ordinary configuration through `analyzeAPIs`; keep configuration resolution, raw facts, and pipeline operations internal. Supporting types can be exported.
- Release compiler resources before returning success or failure. The returned analysis has no `analyze`, `invalidate`, or `close` method.
- Generate reports, portable models, and declaration rollups as artifact content. Callers control file writes and explicit baseline acceptance.
- Organize implementations into `utilities`, `analysis-types`, `analysis`, `rollup-generation`, `model-generation`, and `report-generation`, with the public composition API at the source root. Introduce directories only when needed.
- Make generators independent consumers of one completed immutable graph. Keep compiler objects and mutable parsing and traversal state private to analysis.
- Let the model layer own encoding, decoding, and artifact validation. The root reads selected models, invokes validation, and passes dependency data to analysis without an analysis-to-model implementation dependency.
- Expose API statistics separately from internal performance instrumentation. Exact output signatures and statistics remain to be specified.
- Expected validation failures return diagnostics; internal and unexpected operational failures reject the promise. An asynchronous entrypoint does not require the native asynchronous compiler client.
- Provide a Node.js-compatible TypeScript API. A CLI is optional, not part of the initial required delivery.
- ESM-only support is acceptable. Preserve Node, browser, and custom resolution conditions for supported entrypoints.
- Keep Fluid tags, package scopes, surface names, and policy meanings outside the generic implementation.
- V1 selects classes, interfaces, enums, and namespaces as whole containers. Neither release-level nor custom-tag selection may trim their members, including constructors and static members. Explicit member release levels must equal the declaring container's effective level; untagged members inherit that level. This rule has no V1 opt-out. Validate local overrides against their declaring container and reuse completed base-member validation. Standalone overload selection remains independent. See the [compound-container decision](#3-atomic-compound-functionnamespace-apis) and [future flexibility investigation](api-extractor-replacement-follow-ups.md#flexible-container-member-selection).
- Follow documentation-driven development, test-driven development, and functional programming principles throughout this project.
- Preserve all W1-W11 requirements, F1-F4 capabilities, and B1-B6 regression obligations. Staged delivery does not make later requirements optional.

The TS7 API is explicitly unstable in the inspected release.
Selecting it is a project direction, not evidence that all necessary capabilities are available or verified.
Pin the compiler package version used by the implementation and record the actual analysis-engine version in test results and artifact provenance.

## Development contract

These rules apply to all future development work on this project, including integrations and migration changes.
Include this plan in development handoffs and change reviews.

### Documentation-driven development

Write documentation in Simplified Technical English (ASD-STE100).
Follow the repository's [Documentation Guidelines](../../../docs/content/Guidelines/Documentation-Guidelines.md) and the applicable guidance linked there, including source-code documentation guidance.
These requirements apply to design documents, API documentation, code examples, and user and migration guides.

When the purpose or importance of code might not be clear to a developer or AI agent reading it for the first time, add inline comments to explain it.
Use Simplified Technical English for these comments.
Apply this rule to implementation code, tests, and configuration.
Explain the reason, constraint, or consequence that the reader needs to understand; do not restate obvious operations.

1. Identify the requirement and acceptance scenarios for the change.
2. Write or update the behavior contract before implementation. Specify inputs, outputs, invariants, diagnostics, failure behavior, and compatibility effects.
3. For public APIs and configuration, document representative usage and observable behavior before committing to a signature or schema.
4. Record significant architecture choices and alternatives in short decision records. Keep provisional choices clearly marked.
5. Keep the contract, tests, and implementation in the same change. Update user-facing documentation and migration guidance when behavior changes.
6. After each code change, complete the documentation validation checklist below. Do not wait for a separate documentation review request.

Reuse the planning documents and the future package's existing documentation where appropriate.
Do not create a separate design document for every small change.
Documentation must describe supported behavior, not promise unverified compiler capabilities.

#### TODO maintenance

Whenever you add or modify code, review the need for TODO comments in the affected code, including tests and configuration.
Add a targeted TODO when a known limitation, deferred requirement, or temporary constraint requires follow-up work.
Place it near the relevant code and state the required action and the reason or condition for that action.
Reference the applicable implementation stage or tracked issue when available.
Do not add speculative TODOs or use a TODO instead of completing work required by the current change.

Review existing TODOs in the affected code during the same change.
Update them when the remaining work, scope, or constraints change.
Remove them when the work is complete or no longer applies.
Keep retained TODOs consistent with the implementation plan and documented limitations.

#### Documentation validation checklist

Complete these checks after each code change, including changes to tests and configuration:

- Review the affected API comments, implementation comments, examples, README content, and plan status against the current code. Correct missing or outdated contracts.
- Check that inline comments explain code whose purpose or importance might not be clear on a first reading.
- Use Simplified Technical English. Keep sentences short, use consistent terms, and define unfamiliar terms and abbreviations. Preserve technical accuracy.
- Use multiline TSDoc for public declarations and their members. Keep the summary concise. Put detailed contracts in `@remarks` and use applicable `@param`, `@returns`, and `@throws` tags.
- Introduce each code example with an English description. Add comments for behavior that is not obvious. Use one sentence per line in Markdown prose.
- State supported behavior and limitations accurately. Keep planned behavior separate from current contracts.
- Review TODOs in the affected code. Add actionable follow-up comments where needed, update changed requirements, and remove completed or obsolete TODOs.
- Run focused formatting and editor checks. When source documentation changes, validate its syntax with the official TSDoc parser. Check Markdown whitespace and any changed links or examples as applicable.
- Review wording manually. Passing syntax and formatting checks does not establish language quality or technical accuracy. Fix documentation issues before declaring the code change complete, and disclose any checks that could not run.

### Test-driven development

1. Translate the documented behavior into the smallest useful test using repository conventions.
2. Run it and confirm that it fails for the intended missing behavior, not a broken test environment.
3. Implement the minimum behavior needed to pass.
4. Run the focused tests, then refactor while they remain passing.
5. Run the relevant integration and compatibility gates before declaring the change complete.

For a defect, add a failing reproduction before the fix.
For a compiler capability investigation, write the expected fixture and assertions first, then run them against the pinned real compiler.
An investigation may report a failed capability rather than produce production code.
Do not accept snapshots solely because they match current output. Review the semantic assertions that justify them.

Every TypeScript test fixture, including `.d.ts` inputs, must start with an ordinary module comment that explains what it validates.
Add ordinary `//` comments beside individual APIs whose validation role is not obvious, including members, aliases, and re-exports.
Explain the expected distinction or constraint in Simplified Technical English, without repeating an already clear module overview.
Keep these explanations separate from tested TSDoc and preserve absent, empty, malformed, and tag-only documentation inputs.
Place explanatory comments after the complete tested TSDoc block or group and before its declaration; the pinned TS7 API includes preceding line comments in extracted TSDoc text even across blank lines.
Keep adjacent TSDoc comments and compiler directives attached to their original declarations or statements, and keep explanations outside exact source blocks replaced by tests.
Review module overviews and API-level comments whenever fixtures are added or changed, following the [fixture comment guide](../src/test/fixtures/README.md#fixture-comments).
For comment-only edits, verify unchanged code tokens and attached TSDoc, then run the affected fixture tests without updating snapshots.

Use semantic test and suite names that describe the behavior under test.
Keep design requirement identifiers in comments above the applicable tests, not in test names.
For a temporary investigation test, add a comment that states its purpose and when to remove or replace it.
When renaming tests or suites, verify that test-selection commands still run the intended coverage.
Use one CommonJS `.mocharc.cjs` configuration file for glob-based test discovery, timeouts, and shared runner settings.
Keep the test script limited to running Mocha; developers must build before running tests.
Do not maintain suite-name allowlists in package scripts; new `.test.ts` modules must join supported validation automatically.
Use `it.skip` for known failing capability probes and add a TODO with the development stage, blocker, and condition for re-enabling or replacing the probe.
Keep those probes visible as pending in the single `pnpm test` run; do not add custom markers, filtering infrastructure, or separate scripts.
A skipped probe does not waive the corresponding capability requirement.

Use checked-in snapshot files for full generated-report expectations rather than inline expected report strings.
Normal test runs must compare snapshots without updating them. Review intentional snapshot changes as API or report-format changes.
Keep focused semantic assertions alongside snapshots for selection, identity, order, and failure behavior.

### Functional architecture

Use a functional core with explicit I/O boundaries:

- Represent API facts, references, policy inputs, selections, and diagnostics as explicit data.
- Prefer pure functions and immutable inputs for transformations. Return new results rather than mutate shared package models.
- Use discriminated unions for states and diagnostic results. Make unsupported or incomplete analysis explicit.
- Pass configuration and dependencies explicitly. Avoid global sessions, hidden filesystem access, and ambient mutable registries.
- Keep filesystem access, compiler communication, process lifecycle, timing, and output publication at the boundary.
- Limit necessary mutation to invocation-owned compiler state, local caches, and private algorithm-local builders. Do not copy large graphs merely to simulate immutability.
- Use basic caching sparingly in performance-critical areas where measurements show costly redundant computation. Prefer small, local caches with explicit ownership, lifetimes, and invalidation rules. Avoid general caching infrastructure unless its benefit justifies the added complexity; cached and uncached results must agree.
- Use focused functions and composition. Do not add a functional programming framework or a large compiler abstraction without a demonstrated need.

Tests must verify that changing task order cannot mutate or corrupt shared analysis.
The dependency rules in the architecture proposal apply to source imports, not only directory names.
Use `good-fences` to enforce those rules as implementations move into layers, following the per-directory fence conventions in `api-markdown-documenter`.
Define layer tags, allowed imports, and exported entrypoints, with explicit root-composition and test boundaries.
The initial migration pins `good-fences` 0.10.0 and integrates `check:fences` into lint; the boundary regression verifies allowed and forbidden imports under the package's TypeScript and ESM conventions.
See the [tooling notes](../README.md#dependency-boundaries) for upstream maintenance and native-dependency limitations.
Keep ESLint for coding conventions rather than duplicating directory dependency rules.
Keep generic utilities free of release policy and graph-specific traversal.
Compute shared semantics in analysis, or place narrowly scoped shared operations beside the graph contract when multiple generators require them.
Do not add a general graph framework, duplicate selection logic, or allow generators to import one another.

### Diagnostics and internal validation

Maintain this invariant throughout development: failure diagnostics describe only user-caused failures, such as invalid inputs, configuration, or caller actions.
Document each supported diagnostic code and its corrective action in the public `DiagnosticCode` definition.

- Use standard assertions for internal-only validation and broken implementation invariants. Do not convert assertion failures into diagnostics.
- Propagate unexpected operational failures, such as compiler-process or file-access failures, as exceptions. These failures are not necessarily caused by the user.
- Convert exceptions to failure diagnostics only when the boundary identifies an expected user-input validation failure. A broad catch must not hide library defects.
- Release owned resources and discard invalid cached state before propagating an exception. Preserve the original error; if cleanup also fails, retain both errors.
- Keep capability limitations on successful facts distinct from failure diagnostics. A limitation does not imply invalid user input or complete analysis.
- Test both paths: invalid user inputs return diagnostics, while internal assertions and unexpected operational failures remain exceptions.

## Agreed architecture

The [architecture proposal](Architecture-Proposal.md#source-organization) specifies the agreed source directories and allowed dependencies within this package.
The following components refine those ownership boundaries; they do not require separate packages or one directory per row.
Do not create empty directories for unimplemented generators.

| Component | Responsibility | Boundary |
| --- | --- | --- |
| Configuration resolution | Resolve defaults, inheritance, overrides, suite selection, and required surface coverage. Expose the effective configuration. | Load files at the boundary; merge and validate explicit data in pure functions. |
| Root composition API | Resolve ordinary configuration, read selected suite artifacts, invoke model decoding and validation, run analysis, and expose output operations. | Explicit I/O boundary; release resources before returning success or failure. |
| Analysis | Extract compiler facts, classify original metadata, resolve documentation and references, and complete shared validation. | Own compiler access and mutable working state; return the completed graph. |
| Completed analysis graph | Represent original metadata, resolved documentation and links, declarations, relationships, export identities, and provenance. | Immutable, output-independent data; no compiler handles or mutable TSDoc nodes. |
| TS7 adapter | Query official compiler semantics, exports, aliases, effective types, signatures, and declaration origins. | Only this component depends directly on unstable TS7 interfaces. |
| Documentation processing | Parse TSDoc; resolve suite references and inherited content against facts and validated dependency data. | Internal to analysis; retain resolved results for all generators. |
| Policy and selection | Apply release-level rules, custom directional rules, per-rule opt-outs, and surface selections. | Shared validation belongs in analysis; reusable graph operations belong beside the graph contract. |
| Rollup generation | Construct complete and trimmed entrypoint declarations from the completed graph. | No live compiler access, full reanalysis, or imports from another generator. |
| Model generation | Encode the explicit versioned artifact format; decode and validate models for dependency consumers. | No file I/O, compiler access, or dependency on another generator. |
| Report generation | Prepare report-specific records and render Markdown from the completed graph. | No classification or documentation resolution; no dependency on analysis implementation. |
| Output and build integration | Compare baselines, write requested artifacts, report diagnostics, track dependencies, and publish completion metadata. | Effectful; does not reconstruct API semantics. |

The initial processing flow is:

1. Resolve configuration and discover package entrypoints, resolution contexts, dependencies, and selected suite models.
2. Read every selected suite model at the root boundary, decode and validate it through the model layer, and pass validated data to analysis.
3. Analyze declarations in the applicable compiler contexts and extract facts while preserving complete validation scope, including excluded targets.
4. Classify original metadata, then resolve documentation and references in the correct originating context without changing original classification.
5. Apply enabled policies and derive selected surface views without discarding the complete facts.
6. Complete the output-independent graph, release compiler resources and mutable working state, and return the public analysis object or failure diagnostics.
7. Construct requested artifact content from the completed analysis without repeating shared validation.
8. Let build integration write artifacts and perform explicit baseline checks or acceptance.

Validation-only requests must not produce artifacts.
Documentation requests must not implicitly accept report changes.
Invalid selected suite dependencies must fail package processing under F2 even when no link uses the missing model.
Task prerequisites must reflect these contracts rather than force every optional output to run.

### Analysis reuse and lifecycle

Use one completed analysis per package invocation, following the [agreed API contract](API-Proposal.md).
Complete configuration resolution, suite loading, extraction, classification, documentation resolution, and configured semantic validation before success.
Distinct conditions or compiler options may require distinct internal contexts.
Output format or release-level filtering alone must not cause a complete reanalysis.

Output methods reuse private immutable results, including when called sequentially or in a different order.
Output-specific option validation remains separate from shared semantic validation.
Do not expose source invalidation, reanalysis, or watch behavior on the completed analysis.
Changed inputs require a new invocation; unchanged inputs may also be analyzed again in the initial version.
Persistent reuse across builds is tracked as a [deferred follow-up](api-extractor-replacement-follow-ups.md#persistent-analysis-reuse-across-builds).

Keep compiler resources inside `analyzeAPIs` and dispose of them before returning success or failure.
Verify that retained data supports declaration rollups without later compiler access.
Treat a failure of that capability as a blocker, not permission to remove rollups or add an undisclosed live session.
Internal and unexpected operational failures reject the promise after cleanup; preserve both the original failure and any cleanup failure.
The initial implementation may use the synchronous compiler adapter behind the asynchronous entrypoint, with documented event-loop blocking.
The native asynchronous client's process-termination failure remains unresolved and does not become acceptable through this API change.

Instrument analysis creation and fact extraction so tests can detect task-triggered full reruns.
A single child process alone is not proof of reuse.
Task-specific queries and different semantic contexts are legitimate work and must be distinguished from repeated whole-package analysis.

### Semantic and artifact representation

The graph consumed by generators represents completed semantic analysis, not the current raw extraction schema.
Define its data and ownership contract before moving implementation files.
Keep mutable TSDoc nodes, compiler handles, traversal sets, and construction indexes private to analysis.
The graph and its shared operations must not depend on analysis or generator implementation types.
Do not introduce multiple large model hierarchies solely to represent the completion boundary.

Reuse TypeScript terminology and AST structure wherever practical when naming and organizing facts, APIs, and documentation.
Preserve distinctions that TypeScript makes, such as call-signature declarations versus function types, rather than naming semantic data after one renderer's use of it.
For example, `SignatureFact.callSignatureText` contains a printed call-signature declaration; `SignatureFact.functionTypeText` contains a printed function type.
Use the official compiler APIs for parsing, semantic queries, and printing. Do not reconstruct TypeScript syntax by parsing or rewriting printed type strings.
Reflect relevant AST relationships in detached data where useful, but do not copy the entire AST or expose compiler-owned nodes and handles in portable facts.
Document intentional departures from TypeScript's terminology or structure when portability, resolved semantics, or a supported workflow requires them.

Do not design a second TypeScript type system.
Use compiler results for type semantics and retain accurate type expressions when no supported complete expansion is available.
Required ordinary intersections and utility types cannot be downgraded to best effort.

Keep declaration identity separate from export identity.
Preserve each exported name, type-only or value-bearing path, containing declaration, package origin, and reference target.
Model callable overloads individually; do not include implementation signatures as callable APIs.
Represent inherited effective members through resolved relationships where possible, including consumer-observed types and modifiers.

Design artifact identities against collisions, merged declarations, overload reordering, aliases, package versions, and re-exports.
Do not use process-local handles, absolute checkout paths, or traversal order as persistent identities.
The exact identity scheme and serialization format require documented examples and tests before stabilization.

Portable documentation models must contain resolved API-link targets, inherited content, custom metadata, and sufficient type/member data for downstream rendering without compiler access.
Dependency documentation models do not replace dependency type declarations.
Add explicit format-version and compatibility checks; reject incompatible or incomplete selected inputs.
The model layer owns an explicit JSON encoding, decoding, and validation contract, not generic serialization of internal objects.
Use stable identifiers for graph references and validate reference integrity when decoding.
Model round-trip tests establish portable-model fidelity; they do not establish complete analysis restoration or cache validity.
Full restoration remains in the persistent-reuse follow-up, while dependency-model decoding is required for Stage 2 suite resolution.

### Input and declaration generation

Proposed initial input: untrimmed, comment-preserving declaration files built by the package's supported compiler.
Validate this choice against overload documentation, generic specialization, source locations, aliases, and original package context.
Keep source input as an option if declaration inputs cannot preserve required information; do not commit to two input implementations without evidence.

Declaration generation is an early feasibility gate, not a final formatting task.
The inspected TS7 release exposes printing and semantic queries but does not establish all required emit capabilities.
Test complete and trimmed outputs, import closure, namespace exports, nominal identity, and consumer compilation early.
Prove these outputs can be generated from the completed graph after compiler disposal.
Printed type strings alone are insufficient evidence; missing data must not cause a generator to reopen compiler analysis.
Evaluate supported compiler capabilities and compatible existing generation tools before owning custom declaration transformations.
Any new dependency needs maintenance and license review. Do not silently introduce TS6 analysis as a fallback.

## Delivery stages

Each stage starts with its documented contracts and failing tests.
Proceed to production implementation only when the relevant capability gates pass.

### Stage 0. Establish the project and capability evidence

- Inspect neighboring package, test, build, and lint conventions before scaffolding.
- Create the minimum ESM package structure at `tools/api-analyzer`, with a package overview, development contract, and test harness.
- Pin the chosen published TS7 API version and use its official client. Select synchronous or asynchronous integration from lifecycle and query tests, not assumptions.
- Create small fixtures built with both TS6 and TS7. Analyze both with TS7 and record the engine and build versions separately.
- Test exports and alias paths, effective generic members, intersections and utility modifiers, documentation access, and required declaration generation capabilities.
- Prove a retained session can serve several output-like queries without restarting complete analysis. Test shutdown and process failure.

Exit: link concrete passing or failing capability results to the research and regression documents.
Record missing public APIs and upstream issues. Stop the affected implementation path for a decision if required functionality needs private APIs, a custom semantic engine, or a backend change.
Do not scaffold the full architecture around an unverified capability.

### Stage 1. Implement reusable analysis and configuration

- Document the one-shot analysis lifecycle, dependency inputs, effective configuration, and diagnostic contracts.
- Implement minimal configuration inheritance and explicit analysis contexts.
- Build the TS7 adapter and reusable API facts from real compiler fixtures.
- Cover export aliases, type-only paths, namespaces, merged declarations, effective members, and callable overload identity.
- Verify deterministic facts, task-order independence, fresh analysis after changed inputs, and no leaked compiler handles.

Exit: reusable analysis and effective configuration pass focused contract tests for W4, W6, W11, F1, B1, and B2.
Tests at this stage need not claim final artifact behavior that has not yet been implemented.

Implementation history: the initial session required callers to invalidate cached facts after input changes.
Its `analyze` method returned completion status or diagnostics, not analysis facts.
This lifecycle was removed under the 2026-09-17 proposal, with no compatibility API.
The internal compiler adapter can still return facts to internal consumers and tests.
`analyzeAPIs` now runs existing classification and documentation validation eagerly, and `APIAnalysis.generateReport` reuses prepared data without compiler calls or reparsing comments.
One invocation-owned context indexes facts, retains parsed comments from extraction, and builds original classification and its lookup index once.
Binding validates reference semantics before the resolver updates private TSDoc nodes in one pass.
The resolver trusts validated binding identities and occurrence data instead of repeating those checks.
Report preparation copies complete immutable records and validates fixed export data once; report calls validate only new selection requests.
Tests verify parse counts, captured-node reuse, original metadata preservation, independent contexts, and prepared-report independence.
Configuration resolution, rendering, and baseline comparison are no longer package-level functional exports.
Baseline file-reading and writing wrappers have been removed; callers own I/O and explicit acceptance.
Facts are frozen and contain no compiler objects before the snapshot is disposed.
Each invocation uses a fresh compiler connection; no cross-invocation analysis cache remains.
The data format remains provisional. Stable versioned identifiers, complete reference graphs, and the remaining documentation model fields require later contracts and tests.
See the package's Stage 1 results for the tested subset. Stage 1 does not satisfy all W/F/B requirements.

The verified baseline contains 29 focused tests, including direct adapter-helper tests with declarations built by TS6 and TS7.
The build, formatting, whitespace, and editor checks pass.
The full investigation suite was not rerun for the helper extraction and test-name changes; its recorded capability failures remain unresolved.
Configuration resolution uses `@eslint/object-schema` for property validation and ordered layer merging.
The adapter helpers are module-level functions with explicit compiler and location dependencies.
They are exported from the internal adapter module for tests, not from the package entrypoint.
Each extraction owns its package-location cache and declaration collection state. Neither is global or reused after input changes.
Direct tests check helper behavior, independent caches, repeated collection, and the active-identifier guard.

### Stage 2. Deliver a review and validation workflow

Historical implementation progress through 2026-09-18:

These bullets describe individual increments, not the current remaining work.
Use the acceptance audit below for current status.

- Validation-only operations now use `Result` without a payload type and return `{ ok: true }`. Explicit payload types retain a required `value`, including undefined and union payloads. Type-level and runtime tests verify narrowing, failure propagation, and baseline result shapes.
- A package-wide function-name audit replaced noun-style implementation and test helpers with verb phrases through semantic renames. Compiler fixture API names remain unchanged because they are test inputs.
- Member/container policy is implemented for supported analysis and report forms: original declaring-container identities drive release inheritance and unconditional mismatch validation, including namespace aliases. Reports retain all contents of selected classes, interfaces, enums, and namespaces regardless of member tags. Pure and native TS6/TS7 tests cover nested containers, local overrides, inherited views, special signatures, and model metadata. Private constructor overloads retain separate source-sensitive identities after parameter erasure. Empty automatically inherited documentation now round-trips as valid empty TSDoc. Earlier increments below describe independent member selection as historical progress, not the V1 contract. Declaration rollups and the remaining Stage 2 acceptance gates remain open.
- Signature facts now retain the exact original declaration and location, effective identity text, compiler-reduced alternatives, and alias-preserving normalized alternatives. Reports consume normalized callable text. Compiler utilities are identified through default-library metadata; user aliases, parameter shape, predicates, and assertions are preserved. Both supported input and consumer compilers verify the fixture, and the dependency-alias regression and unchanged inherited-report snapshots now pass together. This does not establish complete recursive type normalization or declaration rollups.
- Agreed merged-release policy: distinct explicit release tags on parts of the same merged non-overloaded API produce `classification-release-conflict`; developers must make the tags agree. Standalone callable overloads retain independent release levels.
- Agreed documentation policy: match TypeScript IntelliSense behavior where possible, with tag deduplication and release-conflict validation. Supported interface/property merges combine distinct descriptions in compiler order, retain the first identical contribution, and combine custom modifiers. Absent or tag-only parts do not suppress another part's description. This supersedes the earlier conservative rejection of distinct descriptions.
- Merged contexts preserve each surviving reference's original lookup result and location. Native TS6/TS7 tests cover first-copy link scope, distinct links from different scopes, absent comments, repeated properties, tag selection, and model round trips. Pure tests cover block and parameter deduplication, stable link traversal, and unchanged originals. Interface headers must still match; compound merges remain unsupported.
- Explicit inheritance now supports combined interface and repeated-property documentation locally and through selected dependency models. Compiler contexts and models retain original interface type-parameter names; local and suite binding enforce matching names and declaration categories. Tests cover inherited links and section provenance, receiver metadata, cycles, numeric-selector rejection, wrong kinds, conflicting requests, renamed parameters, and models missing interface parameter facts. Multiple distinct inheritance requests and broader structural merges remain unsupported.
- Local API links and explicit inheritance resolve named namespace paths, unambiguous static members, explicit static/instance selectors, and numeric callable selectors. Static and instance symbols retain distinct identities. Link policy checks the selected overload; a numeric selector without a unique member side does not resolve a side collision.
- Self-package qualified references resolve from all configured root and subpath exports before declaration traversal. Native TS6/TS7 tests cover aliases, private-name collisions, numeric and member-side selectors, recursive namespaces, scoped package names, missing exports, and configuration order. Selected dependency models resolve self-qualified re-exports by their target identities and normalize TSDoc subpaths consistently. Suite tests preserve inherited provenance and reject missing models, internal links, and unknown subpaths.
- Dependency export records retain member sides and finite recursive namespace back-references. Model-only consumers resolve repeated alias paths and side-selected inheritance without compiler lookup. Imported overload ordinals use retained compiler signature order instead of identity-sorted model records. Positive, negative, malformed-model, and reordered-overload regressions cover these paths.
- Dependency artifacts now record canonical content fingerprints of selected model inputs. The three-package suite regression rejects stale intermediate inherited content after a leaf model changes and verifies regeneration recovery and stability under JSON reformatting.
- Effective method and property comments support original-scope lookup, conservative automatic inheritance, explicit method/property chains, and per-section provenance.
- Selected reports include single-declaration classes and interfaces, callable properties, declared constructors and statics, enums, type aliases, variables, and namespaces. TS6- and TS7-built fixtures match checked-in report snapshots.
- Repeated named namespace declarations now share combined documentation contexts and the compiler's complete export set. Native TS6/TS7 and suite tests cover nested merges, recursive aliases, link origins, custom-tag atomicity, inherited member documentation, release conflicts, and rejection of namespace/interface compound merges. String-literal module merges and namespace-level explicit inheritance remain outside this increment.
- B2 enum/constant coverage now checks type-only aliases, ordinary forwarding of type-only bindings, and `export type *` paths in reports and dependency models. TS6 and TS7 consumers accept enum types and constant type queries and reject value use of type-only aliases, against both emitted inputs and isolated report code blocks. This does not close declaration-rollup requirements.
- Package documentation has one package-owned comment, independent of all entrypoints. Extraction scans package-owned compiler inputs, validates uniqueness and placement, and excludes the package comment from item metadata. The optional `requirePackageDocumentation` rule defaults to false. Facts, dependency models, and reports preserve the comment separately; tests cover TS6/TS7 declaration emission, multiple entrypoints with no `.` entrypoint, missing documentation, duplicates, invalid tags, literal tag text, first-API isolation, and dependency ownership/freshness. Package-level API declaration links remain explicitly unsupported pending reference-policy work.
- Structured references retain source occurrences and compiler-resolved unexported targets. Configured release compatibility, directional custom-tag rules, entrypoint exposure, and explicit-inheritance visibility run independently of report selection.
- Versioned dependency codecs validate artifact shape, identity integrity, resolved comment syntax, and link occurrence correspondence. Root composition loads every selected direct, transitive, and peer model, including unused dependencies, and rejects missing or changed analyzed input files.
- Suite resolution consumes stored resolved content while preserving original link and section provenance through qualified references, re-exports, and supported automatic inheritance.
- Real Node/browser compiler contexts verify conditional-export parity without baseline writes. A core-utils pilot uses built comparison declarations and a configured legacy policy.
- New compiler fixtures include ordinary inline explanations beside APIs, members, imports, and aliases. Those comments remain separate from the tested TSDoc.

Latest continuation adds original-scope package API links with model and cross-model integrity validation, compound type/value/namespace reports, same-kind declaration inheritance, and effective compiler-type reference edges.
Compound and type-only report fragments compile with TS6 and TS7 consumers for both producer compilers.
Merged interfaces now combine heritage clauses, type-parameter defaults, and declared call signatures using native AST factories.

Stage 2 acceptance is complete under the 2026-09-20 decisions.
The final audit corrected public API metadata and source comments, removed obsolete Stage 2 TODOs, and retained actionable later-stage work.
The package now generates and checks its own [complete API report](../api-report/api-analyzer.api.md) through `build:api-reports` and `check:api-reports`.
Known limitations remain visible below and in the follow-up tracker; deferral does not mean that the unsupported behavior is implemented.

#### Current acceptance checklist

Acceptance audit updated on 2026-09-20.
The linked tests cover the implemented Stage 2 contracts; later-stage output and migration requirements remain separate.
Closure verification: 261 tests passed with three known compiler probes pending; build, report freshness, ESLint, formatting, architecture boundaries, whitespace, and touched-file editor checks passed.
The documentation audit validated 633 production TSDoc blocks, type-checked 21 source examples, and checked 210 local links and anchors across the package and planning documents.

| Exit obligation | Evidence and checked outcome | Disposition |
| --- | --- | --- |
| W1 review baselines | [Report tests](../src/test/reviewReport.test.ts), [baseline tests](../src/report-generation/test/reviewBaseline.test.ts), and native snapshots cover separate selected surfaces, exact comparison, metadata changes, aliases, and stable output. Analysis and generators return data; callers own baseline writes. | Implemented. |
| Package self-report | The [build script](../src/generateApiArtifacts.ts) analyzes emitted public declarations and produces the complete report. The [pilot test](../src/test/pilot.test.ts) checks freshness, export coverage, and no writes during checks. | Implemented; regenerate and review the report after intentional API changes. |
| W2 local and suite validation | [Native reference tests](../src/test/nativeCapabilities.test.ts) and [suite tests](../src/test/suite.test.ts) cover unexported targets, import types, directional rules, independent opt-outs, and dependency types without consumer re-exports. Inherited views are not revalidated; original declarations and local overrides are. Outside-suite types remain opaque. | Implemented for the approved rules. |
| W10 configurable policy | [Classification tests](../src/analysis/test/classification.test.ts), [configuration tests](../src/test/configuration.test.ts), and the [core-utils pilot](../src/test/pilot.test.ts) exercise custom modifier vocabularies and configured legacy policy without built-in Fluid tags. | Implemented; documentation-reference syntax boundaries are listed below. |
| F4 standalone overloads | Classification, native, and report tests retain independent public/beta/internal overload selection and exclude implementation signatures. Contained and compound callable parts obey the atomic-container decision. | Implemented for review and validation; rollup output remains Stage 4. |
| Effective documentation table | [Pure resolution tests](../src/analysis/test/documentation.test.ts) and native fixtures cover descriptive, absent, empty, tag-only, successfully inherited empty/nonempty, invalid, and cyclic outcomes. Uncertain and overloaded automatic matches remain undocumented. | Implemented within the approved conservative matching contract. |
| Implements and original provenance | Native member fixtures and suite consumers cover compatible generic non-overloaded implementations, local-comment suppression, competing sources, original lookup scope, and unchanged receiver metadata. | Implemented; no guessed automatic source selection. |
| Suite model prerequisites | Suite tests cover direct/transitive/peer selectors, unused missing models, shape and reference corruption, dependency fingerprints, stale inputs, resolved links, and retained section origins. | Implemented; Stage 3 now adds portable declaration shapes and source-free model-set validation. |
| Local and qualified references | [Selector inputs](../src/test/fixtures/native/reference-selectors.ts), [model-only consumers](../src/test/fixtures/suite/selectors-consumer.d.ts), and self-package fixtures cover named and quoted paths, numeric and label selectors, constructors, static/instance sides, declaration kinds, symbol and enum members, recursive aliases, subpaths, ambiguity, visibility, and invocation stability. | Implemented for these forms; full TSDoc conformance remains required, with the limits listed below. |
| Structural merges | [Compound inputs](../src/test/fixtures/native/compound-merges.ts) and [consumer](../src/test/fixtures/consumer/compoundMerges.ts) cover type/value/namespace facets, repeated enums, generic interface headers, and callable/constructable class-instance augmentation. [Ambient modules](../src/test/fixtures/native/ambient-modules.d.ts) cover repeated quoted module declarations, direct and namespace exports, original-scope links, model inheritance, and release conflicts. | Implemented; original and isolated report declarations compile with both TS6 and TS7 consumers for both producer compilers. |
| B1 dependency aliases | Suite alias tests preserve names and identities with and without explicit consumer re-exports. | Review and dependency-model coverage implemented; complete declaration output remains Stage 4. |
| B2 type-only exports | Native class/function/enum/constant fixtures and isolated consumer tests distinguish ordinary, type-only, forwarded, and star-export paths and reject forbidden value use. | Implemented review-output coverage. |
| B6 built-in shadows | Native report fixtures include and exclude exported `performance` declarations without leaving excluded alias exports. | Implemented review-output coverage. |
| Parity and repository pilot | Suite tests compare actual Node/browser resolution, including an intentional mismatch, without accepting a baseline. The core-utils pilot uses repository declarations and configured policy. | Implemented initial pilot; broad repository adoption remains later work. |
| Detached reuse and boundaries | [Session tests](../src/test/session.test.ts) generate outputs after removing inputs; [architecture tests](../src/test/architecture.test.ts) and `good-fences` enforce layer boundaries. | Implemented; no compiler lifecycle or automatic cache added to the public API. |

#### Remaining Stage 2 decisions

Both questions were resolved on 2026-09-20.
This heading is retained for existing links; no Stage 2 policy question remains open.

1. **TSDoc conformance is required, with an explicit module-reference exclusion.** References in TSDoc comments follow TSDoc selector syntax. The later 2026-09-20 decision forbids whole-module targets and source-relative import-path references for now. Constructor, declaration-kind, numeric, static/instance, and label selectors remain required. The resolver supports explicit constructors, original `{@label}` targets, quoted member names, enum members, and computed unique-symbol members locally and through dependency models. Well-known symbol keys such as `Symbol.iterator` retain their identity without importing compiler-library documentation. Missing and ambiguous targets fail, including overloaded constructors without a unique selection and duplicate labels.
2. **Deduplicate, resolve, then merge.** Equal normalized original comment contributions retain the first occurrence and its scope. Each retained explicit inheritance request resolves before content is combined in compiler declaration order. Distinct resolved summaries and parameter blocks are combined; equal resolved contributions are deduplicated. Original classification remains unchanged, target-only tags and ancillary blocks are not inherited, and links and section sources retain provenance through local and suite chains. Cycles and invalid retained requests fail the whole analysis. Private contribution identities never enter API models or reports.

Accepted conformance limitation, deferred until the remaining library implementation is complete:

- The official [label examples](https://tsdoc.org/pages/tags/label/) use unnamed references such as `Interface.(:CALL)`. The pinned `@microsoft/tsdoc` 0.16.0 parser rejects this form with `tsdoc-reference-missing-identifier`; an empty quoted identifier is also rejected. The examples mark the notation as provisional. The [upstream-reporting task](api-extractor-replacement-follow-ups.md#verify-and-report-the-tsdoc-unnamed-selector-mismatch) must confirm the specification and file a parser bug if warranted. If the syntax is required, supporting it needs a parser fix and analyzer target coverage. Do not invent an alternative spelling or claim support because the named-selector cases pass.

Module-target and source-relative references are now deliberately forbidden, not unfinished Stage 2 support.
Potential support is tracked in the [module-reference follow-up](api-extractor-replacement-follow-ups.md#consider-module-based-documentation-references).

##### Module targets and relative import paths

The earlier phrase "package-only and import-path-only references" combined two different cases.
TSDoc's [declaration-reference contract](https://github.com/microsoft/tsdoc/blob/main/tsdoc/src/nodes/DocDeclarationReference.ts) permits an empty member path to identify a module.
It also specifies that an import path without a package name resolves relative to the source file containing the comment.
The pinned parser accepts all examples in this table:
The analyzer deliberately rejects the excluded forms even though their TSDoc syntax is valid.

| Reference in a TSDoc comment | Target | Analyzer status |
| --- | --- | --- |
| `{@link my-package#Widget}` | The named `Widget` API exported by the package's root module. | Existing named-target support, subject to configured surfaces, suite membership, and visibility rules. |
| `{@link my-package/widgets#Widget}` | The named `Widget` API exported by a configured package subpath. | Existing named-target support under the same rules. |
| `{@link my-package#}` | The package's root module, not an individual API declaration. | Forbidden by the current policy. |
| `{@link my-package/widgets#}` | The package's `widgets` module, without selecting one of its exports. | Forbidden by the current policy. |
| `{@link ./widgets#Widget}` | The named `Widget` export in a module resolved relative to the original comment's file. | Forbidden by the current policy. |
| `{@link ./widgets#}` | That relative module itself. | Forbidden by the current policy. |

For example, a comment in `src/index.ts` that uses `./widgets#Widget` refers through the neighboring `widgets` module under the project's resolution rules.
Re-exporting the documented API from another file must not change that original relative scope.
This is not a request to select a package subpath relative to the repository root.

The shared reference binder rejects the excluded forms with `documentation-unsupported` and explains how to use a named API reference instead.
The rule applies to `@link`, `@inheritDoc`, package comments, and nested references used as symbol keys.
It does not affect TypeScript imports, ordinary namespace-member paths, or named package-qualified API targets.
The [suite regression](../src/test/suite.test.ts) checks the forbidden forms and preserves both root and subpath named API references.
Any future implementation would need original-scope resolution, module-target identity and model contracts, and missing-target tests.
It must not add per-entrypoint `@packageDocumentation` comments: the approved single package-owned comment remains unchanged.

The official [link examples](https://tsdoc.org/pages/tags/link/) are the reference for constructor, quoted-name, and symbol-member syntax.
The existing selector and merged-inheritance fixtures cover the newly implemented forms, including first-copy scope, multiple sources, cycles, policy failures, and model-only consumers.

The three known compiler capability probes remain pending at their existing stages; they are not new Stage 2 failures.
These decisions do not reopen package-link visibility, inherited-member validation, atomic selection, or the outside-suite boundary approved below.

#### Stage 2 review questions

Questions are collected here at the user's request; they did not pause implementation of independent work.

All four decisions below were approved on 2026-09-19.
The examples are valid TypeScript; some intentionally fail analyzer validation to illustrate a policy choice.
Each example is independent of the others.

##### 1. Package-link visibility

**Decision:** Apply the same non-internal visibility rule to package documentation: links to non-internal APIs are permitted, and links to internal APIs are not.
Do not add a package-specific visibility override.

**Current behavior:** The package has one documentation comment, separate from entrypoints and API-item classification.
It has no release level of its own.
Its API links nevertheless use the non-internal visibility rule: public, beta, and alpha targets are allowed; internal and unclassified targets fail.
This rule applies before report selection, so requesting an internal-only report does not change it.
Package links do not participate as source APIs in custom directional rules.

In this example, the preview link is permitted, but the internal link causes analysis to fail:

```typescript
/**
 * Package overview. See {@link previewFeature} and {@link traceState}.
 *
 * @packageDocumentation
 */
export {};

/**
 * Feature available for preview use.
 * @beta
 */
export declare function previewFeature(): void;

/**
 * Diagnostic operation for maintainers.
 * @internal
 */
export declare function traceState(): void;
```

Removing the `traceState` link makes this example pass the package-link visibility check.
The `previewFeature` link remains valid even when a public report excludes the beta declaration.
An unclassified target also fails link validation, even if `rules.requireReleaseLevel` is disabled: that opt-out does not establish the target's visibility.

**Acceptance consequence:** Retain the local and dependency link checks and model-integrity validation.
The package still has one comment and no synthetic release tag.

##### 2. Metadata for effective inherited references

**Decision:** Do not validate inherited member views again on a receiving container.
Validate the original declarations, the receiving declaration's direct relationships, and any local overrides.
Retain inherited members in generated artifacts with their effective types and original metadata.

**Current behavior:** Inherited members retain their original declaring-container release metadata.
The effective member type can contain new reference targets after the compiler substitutes type arguments.
Those effective facts remain available for artifact generation, but do not introduce extra reference-policy checks on inherited members.
No release-level reassignment or new compatibility rule is needed.
The documentation lookup scope and source location remain original.

In this example, `PreviewBox.value` has effective type `PreviewValue`, even though the original property names only `Value`:

```typescript
/**
 * Generic public container.
 * @public
 */
export interface Box<Value> {
	/**
	 * Stored value.
	 */
	value: Value;
}

/**
 * Preview value contract.
 * @beta
 */
export interface PreviewValue {
	text: string;
}

/**
 * Preview specialization of the public container.
 * @beta
 */
export interface PreviewBox extends Box<PreviewValue> {}
```

`Box.value` inherits `@public` from `Box`.
The inherited view `PreviewBox.value` retains that level under the agreed declaring-container rule.
The beta `PreviewBox` declaration can refer to both the public `Box` and the beta `PreviewValue`, so this example passes with release compatibility enabled.
The analyzer does not validate an additional public-to-beta relationship from the inherited `PreviewBox.value` view.
Reports still include `value: PreviewValue`, and API models must retain the inherited member.
The portable model retains its identity, documentation, metadata, effective type text, and original declaring-container relationship.
The [effective-reference fixture](../src/test/fixtures/native/effective-references.ts) exercises this distinction.

**Acceptance consequence:** Test that inherited views survive report and model generation without repeated release, directional, or exposure checks.
Original declarations and local overrides must still fail when they introduce a prohibited relationship.
For example, changing `Box.value` to directly name the beta `PreviewValue` would still fail a public-to-beta release check.

##### 3. Atomic compound function/namespace APIs

**Decision:** Reject conflicting release tags on a merged function/namespace API, just as for other merged declarations.
Trimming merged parts by release level is future work, not a V1 exception to atomic selection.

**Current behavior:** A function and a namespace with the same compiler symbol form one compound API.
The report retains the callable declarations and namespace exports together.
Explicit release tags across those parts must agree; custom-tag selection cannot trim individual parts.
Numeric documentation selectors can still identify a particular callable overload, but do not make it independently selectable in a report.

This example is valid TypeScript, but its different explicit release tags cause `classification-release-conflict`:

```typescript
/**
 * Converts text.
 * @public
 */
export declare function convert(value: string): string;

/**
 * Converts a preview numeric input.
 * @beta
 */
export declare function convert(value: number): number;

/**
 * Conversion utilities.
 * @public
 */
export declare namespace convert {
	/**
	 * Utility version.
	 */
	export const version: "v1";
}
```

Without the namespace declaration, these are standalone overloads and their different release levels are supported.
With the namespace present, the current implementation treats both overloads and `version` as parts of the same atomic container.
Changing every explicit tag to `@public` makes the release levels consistent; selecting `convert` then retains both overloads and the namespace member.
A type such as `typeof convert` observes both the callable signatures and namespace properties, so trimming either part can change the type consumers see.

This example is also recorded in the [merged-declaration TODO](../TODOs.md#merged-declarations) for future consideration.
Future trimming must specify how selected callable signatures and namespace properties affect `typeof convert`.

**Acceptance consequence:** Retain the existing compound release-conflict and complete-selection regressions in [nativeCapabilities.test.ts](../src/test/nativeCapabilities.test.ts), along with the standalone mixed-overload tests.

##### 4. Compiler-library and outside-suite member expansion

**Decision:** Preserve references to compiler-library types without expanding their member graphs.
Apply the same boundary to types from any package outside the selected suite.
The suite includes the analyzed package and dependency packages selected by the resolved suite configuration.
An installed dependency is not automatically a suite member.

**Current behavior:** An alias whose underlying named type is a compiler-library class or interface retains its original type expression.
Its member view is marked incomplete instead of importing library members into package API classification.
For example, this array alias remains an array alias in the report; the analyzer does not create package-owned records for its library methods:

```typescript
/**
 * Read-only names returned by the package.
 * @public
 */
export type Names = readonly string[];
```

Consumers still get `length`, `map`, iteration, and other array operations from their TypeScript libraries.
Those operations are not removed from the TypeScript type merely because the analyzer does not materialize their members.
Named type arguments remain relevant to reference validation even when the surrounding library declaration is not expanded.

A user-defined interface that extends a library type preserves that relationship and its local members:

```typescript
/**
 * Named collection of read-only labels.
 * @public
 */
export interface NamedLabels extends ReadonlyArray<string> {
	/**
	 * Collection name.
	 */
	name: string;
}
```

The report retains `extends ReadonlyArray<string>` and `name`, without printing inherited library members such as `length` and `map`.
The detached member view records an outside-suite boundary instead of claiming complete expansion.
No release tags or TSDoc compliance are required for library or outside-suite declarations encountered through type references.
The same behavior applies to an interface extending an imported third-party base outside the suite.
Local overrides and suite-owned type arguments remain subject to normal validation.
Explicit documentation links and inheritance still require resolvable documentation targets; opaque type handling does not supply a missing dependency model.

This does not weaken the existing requirement to expand ordinary object intersections and utility types such as `Pick`, `Omit`, and `Readonly` over supported package types.
Those cases remain distinct from expanding the library declarations themselves.

**Acceptance consequence:** Verify library and third-party bases, local overrides, suite-owned type arguments, and explicit incomplete-view reporting.
Selecting a dependency into the suite must enable its supported member expansion and reference validation again.

Callable/constructable class-instance augmentations and repeated string-literal ambient modules now have extraction, documentation, model, report, policy, and consumer coverage.
The supported Stage 2 paths have combined acceptance evidence in the checklist above.
Stage closure records the user's explicit acceptance of the deferred follow-ups rather than inferring full feature completeness from passing tests.
Full portable models and declaration rollups remain Stages 3 and 4; the three known compiler capability probes remain pending at their existing stages.

Merged-metadata decision resolved: combine recognized modifier tags from all parts and deduplicate them.
Keep explicit release-tag conflict validation, and retain the first occurrence of identical descriptive content with its original reference scope.
General rule: match IntelliSense where possible and record any deliberate validation differences or implementation limits.

#### Increment history

The following records preserve earlier implementation checkpoints.
Their future-tense tasks and limitations are historical; the current acceptance checklist above supersedes them.

Current progress: The [initial classification contract and results](../README.md#release-classification-and-selection-contract) cover independent callable-overload release levels, explicit custom modifier configuration, diagnostic opt-outs, and named metadata selections.
`classifyApiItems` and `selectApiItems` are experimental pure APIs over explicit data. Selection reuses classified metadata without repeating compiler analysis.
This is metadata selection, not a complete selected declaration graph or report representation.
Real-compiler tests use detached overload facts after session closure with both supported input-build compilers.
The initial 45-test contract suite does not satisfy the Stage 2 exit criteria below.
Release levels use a numeric enum with increasing permissiveness: `Public = 0`, `Beta = 1`, `Alpha = 2`, and `Internal = 3`.
Numeric comparisons express the linear ordering; configured selections remain explicit sets.
TSDoc tag strings map explicitly to enum values, and classification metadata stores those numeric values.

- Document the initial programmatic API, report format, baseline comparison, and update behavior.
- Extend the implemented eager analysis entrypoint with the remaining shared semantic validation. Preserve detached report reuse and tested cleanup before return.
- Extend the initial completed graph contract and implemented layer boundaries as remaining semantic capabilities are added. Model-reader responsibilities remain assigned to the future model layer; root composition owns reads.
- Make report generation consume completed graph data and new output criteria only. Enforce directory dependencies with `good-fences`, wire its check into package validation, and avoid empty generator scaffolding.
- Use `@microsoft/tsdoc` to parse release levels and custom tags before surface selection. Document tag configuration, missing or conflicting metadata, diagnostics, and rule opt-outs.
- Implement release-level selection per callable overload and generic custom-tag selection.
- Specify and test structured reference facts before implementing reference-validation policies. Preserve reference origins and targets, including non-exported and cross-package targets, independently of selected report surfaces.
- Resolve effective documentation before report construction, using the incremental contract below. Move inheritance resolution and its dependency-model prerequisites forward from Stage 3.
- Implement entrypoint and cross-package validation as distinct policies, including custom directional rules and per-rule opt-outs.
- Generate separate review artifacts from shared facts and check Node/browser parity without overwriting an accepted baseline.
- Add a small repository pilot using configured policy, not built-in Fluid behavior.

Exit: W1, W2, W10, and F4 work together through one completed analysis, with B1, B2, and B6 assertions against review output.
Report documentation status must use successfully resolved effective documentation, including explicit and automatic inheritance within a package and across the configured suite.
The resolution acceptance cases below are also required. Initial function-only report tests do not satisfy this gate.
Validation-only and baseline-update modes remain independent.

The initial per-overload classification and metadata-selection contract was implemented after its tests failed against stubs.
The next increment adds independent baseline comparison, file checking, and explicit file updates.
The [baseline contract](../README.md#review-artifacts-and-baselines) requires exact text comparison, no writes during checks, and exception propagation for unexpected filesystem errors.
Three acceptance tests cover missing and stale baselines, exact whitespace, explicit creation and replacement, invalid paths, and filesystem failures.
These operations consume text without parsing report syntax or repeating analysis. They do not yet constitute a review-artifact generator or satisfy the end-to-end parity gate.
The initial report representation now joins selected signature metadata to detached function facts.
The Markdown renderer preserves exported aliases, type-only paths, and compiler overload order, while excluding implementation bodies and provisional identifiers.
The default layout now follows API Extractor's declaration-oriented Markdown style, using compiler-printed call-signature declarations and explicit alias exports.
Release tags display by default; other recognized tags are opt-in. Undocumented annotations are independently configurable and default to enabled.
These options affect presentation only. Tag-only comments do not count as descriptive documentation.
Required package-documentation support is recorded in the follow-up tracker; broader presentation customization follows rough API Extractor parity.
Public, complete, and empty reports use checked-in snapshots. Both TS6- and TS7-built function fixtures render the same snapshots after session closure.
At this historical checkpoint, the builder rejected other declaration forms, including merged namespaces, rather than emitting partial reports.
Repeated named namespaces are now supported as recorded in the current acceptance checklist above; compound merges remain open.
Structured documentation targets and same-package explicit function inheritance now feed report construction.
Next, extend report facts and selection to other declaration forms, integrate the automatic member resolver, and add suite resolution as specified below.
Complete reference validation, actual conditional-entrypoint parity, and the repository pilot before closing Stage 2.
The analysis facts still contain raw declaration text and export targets, not a complete type-reference graph.
Signature documentation and classification inputs use a required `string | undefined` property.
The adapter extracts only the closest attached TSDoc comment, including delimiters, and uses `undefined` when no TSDoc comment exists.
Explicit empty comments remain distinguishable from absence for the future local-comment inheritance rule. Declaration source text remains separate.
Classification reads comment text into separate release-level and modifier metadata; it does not implement inheritance or resolve semantic references.
Do not infer semantic references by parsing printed type strings. Extend facts through the compiler adapter and verify them with real-compiler fixtures.
Extract the required reference facts before disposing of the snapshot so later policies can reuse detached data without repeating full analysis.
Documentation-link resolution and inheritance now belong to Stage 2. The function report builder resolves all supplied signature comments before selection and measures effective content.
An inheritance request alone does not count as documentation. Empty inherited content remains undocumented.
The declaration-generation gate does not block review and validation work. It remains open for the generation path.
The async termination failure also remains open; the planned asynchronous entrypoint may continue using the synchronous adapter with documented blocking behavior.

#### Resolve documentation before report construction

Current implementation: `resolveDocumentation` copies inherited documentation within the same package using explicit target bindings and official TSDoc parsing and printing.
The [resolver contract](../README.md#explicit-documentation-inheritance-contract) defines bindings, resolved comments, local metadata, and inheritance paths.
Pure tests cover chains, empty targets, blocks that remain local, invalid bindings, cycles, and unsupported features.
Real-compiler tests resolve comments from TypeScript 6 and TypeScript 7 declaration builds after the TypeScript 7 analysis session closes.

`bindDocumentationReferences` uses compiler lookup facts to bind function references and namespace or instance method paths in the original declaration scope.
This includes imported and exported aliases.
The adapter collects targets that are not exported and retains the location and parameter facts for each signature.
Tests verify lookup through re-exports and after session closure or JSON serialization.
The binder requires one target signature, selected by a one-based numeric TSDoc selector for overloaded targets, with matching parameter names, optional parameter flags, rest parameter flags, and type-parameter names.
It reports missing targets, ambiguous overloads, and incompatible parameter shapes without comparing printed types.
These checks do not establish TypeScript assignability.

Numeric selectors for same-package function and method inheritance are implemented, including bounds and selected-parameter validation.
Method paths use terminal selectors; static class member paths and static/instance name collisions are rejected.
Package-qualified references, nonnumeric selectors, and parameter adaptation remain pending. Automatic overload matching is deferred, not a Stage 2 requirement.
Classification, reference binding, and content resolution now share explicit custom modifier configuration through `TsdocOptions`.
Each operation creates an independent TSDoc configuration and rejects invalid names or redefinitions.
Binding and resolution still fail on parser diagnostics when classification disables its own syntax diagnostics.
Pure tests and fixtures built with both supported compilers verify local custom metadata, request isolation, and unchanged classification and selection after resolution.
Custom block and inline tags, configuration-file loading, and general API link target support remain pending.
The adapter now records API links in `SignatureDocumentationContext.links` using the shared `DocumentationReferenceLookup` type.
Lookup retains original scope, aliases, non-exported targets, repeated links, and missing or unsupported reference results.
Compiler tests cover links in documentation blocks, self-references, mutually linked declarations, URL exclusion, and detached JSON-compatible contexts for both input compilers.
The separate internal `bindDocumentationLinks` operation now binds local links to structured targets using original classification metadata, independently of report selection.
This increment supports same-package standalone function targets with one callable signature.
It preserves source signature identity, API link occurrence index, reference text, target declaration identity, and original comment location in frozen results.
It permits public-to-beta links and rejects links from non-internal APIs to internal APIs.
Missing classification or release levels fail validation; no public release level is inferred.
General declaration and overload targets remain unsupported until their classification and target semantics are defined.
Pure tests cover the release-policy matrix and failure boundaries; both compiler fixtures verify detached binding after session closure and JSON serialization.
The content resolver now accepts validated link bindings and original classification through `DocumentationResolutionOptions.linkValidation`.
Bindings include the target signature identity for classification as well as the target declaration identity.
The resolver associates original TSDoc link nodes with their bindings before copying inherited sections.
Effective links preserve their original source signature, occurrence index, and location through chains; retained local blocks keep their own bindings.
Target-only blocks that are not copied do not contribute inherited links.
Each receiving API is checked against the target's original release level, independently of report selection.
Pure tests verify section provenance, binding validation, and rejection of inherited internal targets for non-internal receivers.
Both compiler inputs verify original scope through aliases after session closure and JSON serialization.
Complete-comment snapshots cover inherited links and copied sections with local examples.
Function reports now run both binders and content resolution before applying selection.
Required report options supply full original classification and the shared custom modifier vocabulary, including unselected targets.
Documentation failures prevent successful reports even when the selection is empty.
Reports measure effective content but retain original selected release metadata and local annotation tags.
Pure tests cover empty inherited content, inherited API links, strict parsing, missing metadata, and resolution failures.
Both compiler inputs produce the same descriptive and empty-inheritance report snapshots after session closure and JSON serialization.
The next extraction prerequisite now retains original TSDoc on each source declaration for symbols and effective members.
Member source records replace location-only origins and preserve separate overload and merged-declaration comments.
Class and interface fixtures verify inherited generic member origins, absent and empty local overrides, and frozen detached records for both input compilers.
Effective members now have identifiers scoped to their containing declaration and detached callable signatures in compiler order.
Both input compilers verify generic substitution, optional methods, callable properties, independent overload selection, and frozen signature facts after session closure.
These member identities do not establish ancestor or override relationships.
Collected function and method targets and inspectable effective callable member signatures retain original-scope documentation contexts.
Effective callable signatures join the shared analysis context for original classification, reference binding, and completion.
Release-tag validation includes untagged effective methods and single-declaration non-callable properties; enclosing type tags do not supply member metadata.
Direct class and interface base declaration links are now retained through compiler-resolved symbols, including unexported ancestors without changing export surfaces.
Both compiler inputs verify generic bases, class inheritance, a diamond hierarchy with a shared root, implements exclusion, and frozen detached links.
Base targets describe original declarations rather than instantiated generic views. These links do not establish member overrides or overload compatibility.
Local class implements targets are now retained separately from base declarations, including unexported contracts and type alias targets.
Both compiler inputs verify direct-only implementation links, unchanged local comments and members, and frozen detached targets without adding exports.
Direct declaration links are now accompanied by detached `HeritageFact` views with compiler-instantiated members for extends and implements clauses.
Both compiler inputs verify interface and class bases, generic substitution, type-alias implementation targets, and frozen views after session closure.
Direct heritage views now retain compiler-checked non-overloaded documentation matches, including instantiated contracts.
The internal automatic binder selects one compatible original member source, deduplicates diamonds, and skips overloaded, conflicting, or unproven candidates.
The resolver accepts these bindings through `automaticInheritance`, preserves local-comment suppression, follows source chains, and reuses explicit inheritance's content copying and link-policy validation.
Pure and native tests cover local suppression, class bases, type aliases, generic substitutions, diamonds, conflicting sources, overloaded receiver/source exclusion, and frozen results after session closure and JSON serialization.
This does not choose merged-comment precedence or implement broader classification and rendering.
Individually collected methods now retain original-scope API-link and explicit-reference contexts, including numeric inheritance chains with inherited-link provenance.
Analysis completion now maps conservative single-signature automatic member bindings to callable identities and resolves them with explicit references and API links.
Both input compilers verify original namespace lookup after generic substitution, effective numeric method selectors, missing receiver release metadata, eager reference failures, and conservative suppression after JSON serialization.
Single-declaration non-callable properties now retain original reference contexts, enter classification under member identities, and support API links and conservative automatic inheritance.
Both input compilers verify property contexts after disposal, captured-parser reuse, empty and tag-only suppression, and diagnostics for missing release tags, missing links, and unsupported explicit property inheritance.
Explicit property inheritance, callable-property and accessor comments, merged-member precedence, recursive instantiated ancestry, and class/interface report support remain next steps.
Later work must add suite resolution and source information for each resolved documentation section.
This implementation does not satisfy the resolution acceptance criteria below.

Deferred overload capability: the pinned native TS7 7.0.2 public checker has no pairwise signature-compatibility API.
The attempted overload-isolation path fails: `getTypeFromTypeNode` cannot resolve a function-type node returned by `signatureToSignatureDeclaration`.
A regression with equivalent generic overloads in different orders also shows that mutual parameter-type assignability rejects their independently declared type parameters.
Both TS6- and TS7-built fixtures reproduce these results.
Do not replace automatic semantic matching with printed-text matching, declaration-order matching, or a custom type checker.
Automatic overload inheritance is excluded from Stage 2 and tracked in the [future follow-up](api-extractor-replacement-follow-ups.md#automatic-overload-documentation-inheritance).
Explicit numeric selectors deliberately select by callable declaration order and do not require inferred overload matching.
The tested compiler limitations are not a blocker for the revised Stage 2 scope.

Implement a separate documentation-resolution API over detached facts and explicit dependency data.
Use the official TSDoc parser for comment syntax and the official compiler API for declaration relationships.
Extract target identities, origin context, compatible non-overloaded ancestor relationships, and callable overload order for explicit selectors before disposing of the compiler snapshot.
Do not derive these relationships from printed signature strings or assume that type-reference edges alone resolve documentation references.
Retain effective content and its provenance in an immutable result that reports and later documentation models can reuse without compiler access.
Keep file loading at the boundary. Keep resolution policy separate from I/O and from report rendering.

Implement and verify these increments in order:

1. Resolve same-package explicit `@inheritDoc` requests and API links. Cover inheritance chains, missing or ambiguous targets, cycles, empty targets, and originating-package context through re-exports.
2. Add automatic member inheritance with class and interface report support. Include confidently compatible implemented interface members as documentation sources for class members with no local TSDoc. Keep implements relationships separate from base-class inheritance. Any local TSDoc comment, including an empty or tag-only comment, suppresses all automatic inheritance. Exclude automatic inheritance when the receiving member or a candidate source member is overloaded. Leave ambiguous, conflicting, or unproven automatic sources undocumented rather than guessing. Define precedence between class and interface sources. Explicit inheritance remains a validated resolution request: require one-based numeric selectors for overloaded targets and diagnose missing targets, invalid selectors, and incompatible parameter documentation.
3. Add suite dependency-model loading, target identity, and compatibility contracts required for cross-package resolution. Support direct, transitive, and peer dependencies selected by package names or globs. Missing or incompatible models for any selected dependency fail package processing, even when unused. Reject API references outside the suite and preserve the documentation's originating package. Move the minimum dependency-model producer and reader support forward from Stage 3 to make this increment testable.

An increment must diagnose resolution requests that require unsupported scope. Do not silently accept them as documented.
API links require target and reference-policy validation, including B3. URL links do not require network access or destination validation.
Release classification and metadata selection remain independent. Inheriting descriptive content must not implicitly copy release tags or change API visibility.
Retain resolution inputs independently of report selection so an unselected ancestor can supply documentation.

The target `documented` contract is whether effective documentation contains descriptive content after local-comment precedence and inheritance resolution.
It measures content presence, not documentation quality or completeness. Parameter, return-value, and example completeness checks are separate policies.

| Input or resolution outcome | Report documentation status |
| --- | --- |
| Local descriptive content | Documented. |
| Successfully inherited descriptive content | Documented. |
| Successfully resolved inheritance with no descriptive content | Undocumented. |
| No local comment and no ancestor content | Undocumented. |
| Empty or metadata-tag-only local comment without explicit inheritance | Undocumented; automatic inheritance is suppressed. |
| Overloaded receiver or candidate source, or no confidently compatible automatic source | No automatic inheritance; undocumented when local descriptive content is absent. |
| Invalid explicit target or selector, incompatible explicit binding, or inheritance cycle | Resolution diagnostic; do not construct a successful report with a guessed boolean. |

Resolution returns diagnostics for user-caused failures without a partial success value. Internal assertions and operational failures remain exceptions.
If partial reports are introduced later, they must represent unresolved documentation explicitly rather than use `false` or `true` as a fallback.
Function reports now implement effective-content boolean semantics. Extend the documented contract and tests together as automatic inheritance and suite resolution are added.

Acceptance tests must cover every table row, local-comment precedence, signature matching, origin preservation, suite model failures, and reference policies.
For implements relationships, cover absent, empty, and tag-only local comments, compatible generic non-overloaded contracts, multiple interface sources, and interaction with base-class sources.
Verify that overloaded members and uncertain or conflicting automatic sources do not inherit content. Verify explicit numeric selectors, order sensitivity, bounds, and selected-parameter validation separately.
Use pure resolver tests plus real-compiler fixtures built with TS6 and TS7 and analyzed with TS7.
Verify resolution and report generation after session closure. Use checked-in report snapshots and confirm that classification and selection do not change when documentation is inherited.
Stage 2 takes on these semantic prerequisites; Stage 3 retains the complete portable-model and downstream-consumption gates.

### Stage 3. Deliver resolved documentation models

Acceptance status (2026-09-21): implementation and artifact regression coverage are available, but Stage 3 is not yet accepted.
The W7 signature-link gap now has an implementation and compiler-backed acceptance tests; final stage acceptance remains a separate review.

Implemented: portable model encoding, source-free single-model and model-set readers, and portable declaration/member contracts.
The public `api-analyzer/model` entrypoint does not import compiler-backed analysis.
Installed-suite loading shares pure cross-model validation with the reader and retains file freshness checks at the root boundary.

Implementation contract: the documentation artifact includes an explicit declaration graph for source-free readers.
The graph retains entrypoints, aliases, declaration syntax, effective member types, ordered callable signatures, original declaring containers, heritage, type-reference targets, and partial-view limitations.
Resolved documentation and classification remain in the existing API records; graph records reference those records rather than resolving comments again.
Compiler-printed type and signature text is display data, not a structured TypeScript type algebra or compilable declaration rollup.
Development policy (2026-09-21): format and identity versions remain 1 throughout initial development, including incompatible changes.
There are no backward compatibility requirements during this period; regenerate artifacts after schema or identity changes rather than adding migrations or compatibility paths.
Identities remain scoped to the recorded compiler version and package inputs; they do not promise stability across source edits or analysis restoration.
Readers reject unsupported version markers, incomplete graph records, and dangling graph references even though development versions do not change.
Model decoding requires only artifact content; installed-suite loading additionally validates input and dependency fingerprints.

- Reuse Stage 2 parsing, reference validation, effective documentation, and provenance; add no separate resolver for model output.
- Extend the dependency-model identity, loading, and compatibility contracts introduced in Stage 2 into the complete portable documentation-model contract.
- Keep model encoding, decoding, and artifact validation together in `model-generation`; root composition owns file reads and supplies validated dependency data to analysis.
- Serialize resolved links, inherited content, effective members, and metadata with versioned identities. Complete round-trip and downstream-consumer verification without repeating semantic resolution.
- Verify explicit reference integrity and malformed, incomplete, or incompatible artifact rejection. Do not equate model round-trip support with the deferred ability to restore all analysis outputs.

Exit: W3, W7, W8, F1-F3, and B3 pass, including missing unused suite models, outside-suite links, public-to-beta links, and non-internal-to-internal rejection.
Load and consume models without a source checkout or live compiler connection.

Acceptance evidence:

- [Native model regressions](../src/test/nativeCapabilities.test.ts) round-trip inherited class/interface members, generic substitutions, intersections, `Pick`, `Omit`, `Readonly`, declaration forms, and ordered overloads for TS6- and TS7-built inputs.
- [Suite regressions](../src/test/suite.test.ts) read and render portable members and resolved inherited documentation in a new process after deleting declaration inputs, with imports of TypeScript and analysis blocked.
- The same suite tests reject duplicate, incomplete, dangling, obsolete, and incompatible artifacts, preserve package link origins, and prove model-set order independence and dependency fingerprint validation.
- Existing W3/F2/F3/B3 tests continue to validate missing unused suite models, outside-suite references, public-to-beta links, internal-target rejection, local comment suppression, and explicit/automatic inheritance before encoding.
- The package build generates the checked-in [self-model](../api-model/api-analyzer.api.json) together with its API report from one analysis. This development-only source-control exception exposes model-format and content differences for review. The [pilot tests](../src/test/pilot.test.ts) verify both entrypoints, supporting-type reference tokens, and read-only freshness checks. It does not replace Stage 5 artifact publication or retention.

#### Stage 3 acceptance audit

| Criterion | Evidence | Status |
| --- | --- | --- |
| W3 / B3: validate documentation independently of report selection | [Documentation tests](../src/analysis/test/documentation.test.ts): `permits public-to-beta links independently of selection and preserves occurrences`, `enforces only the internal-target restriction across all release levels`, syntax and cycle checks; native original-scope tests exercise both input compilers. | Covered for the accepted Stage 2 reference scope. |
| F1: portable inherited and composed member views | [Native tests](../src/test/nativeCapabilities.test.ts): `round-trips portable inherited, intersection, and utility member views` checks classes, interfaces, generic substitution, intersections, `Pick`, `Omit`, `Readonly`, and overload order. | Covered for supported member expansion; partial views retain limitations. |
| F2: selected suite models and resolved targets | [Suite tests](../src/test/suite.test.ts): missing and incompatible unused models, transitive and peer dependencies, stale fingerprints, outside-suite targets, and model-set order independence. | Covered. |
| F3: inherited documentation and local-comment suppression | [Documentation tests](../src/analysis/test/documentation.test.ts): `resolves automatic chains while suppressing local comments and uncertain choices`; native member completion and suite explicit/automatic inheritance tests. | Covered under accepted overload and ambiguity limits. |
| W7: hierarchy, aliases, metadata, and documentation | Native declaration/model round trips and suite nested namespace, recursive alias, compound declaration, and cross-package re-export tests; `captures exact excerpt targets across aliases, binders, and substituted scopes` verifies occurrence-specific tokens and source-free rendering with both input compilers. | Covered for the supported declaration and display views. |
| W8: portable artifact consumption and integrity | The [dependency](../src/test/snapshots/dependency.api.json) and [consumer](../src/test/snapshots/consumer.api.json) artifacts are exact snapshots. `consumes checked-in model snapshots without declarations or compiler imports` uses a fresh process to follow their aliases, inherited content, and original-package links. | Source-free library workflow covered; publication and historical artifact retention remain Stage 5. |
| Incomplete artifact rejection | `rejects nested export paths that disagree with the portable member graph` rejects missing paths, renamed members, and incorrect member sides. Encoding and decoding share the portable export traversal, including ordered overload and recursive alias targets. | Decoder gap found during this audit is repaired. |

#### Structured excerpt implementation

W7 requires consumers to link references within displayed type expressions to the correct API items without repeating semantic resolution.
The model now supplies readonly content/reference tokens and exclusive-end token ranges, inspired by API Extractor's structured excerpts.
Original source excerpts retain compiler-bound spans; callable views and effective property types retain their own printed occurrences after substitution or normalization.
Target identities are resolved in analysis and validated against the portable declaration graph during decoding.
Source and signature excerpts must reconstruct their stored text exactly; property excerpts retain complete compiler-printed syntax independently of compact type-string whitespace.

The implementation follows the functional architecture: explicit compiler dependencies at the adapter, pure token construction, local construction-only mutation, readonly data contracts, and independent model validation.
No excerpt class, mutable public builder, or downstream compiler lookup is introduced.
Tests were added and observed failing before each implementation slice, including import types, substitutions, lexical binders, portable fields, and separately stored member sources.
[Pure excerpt tests](../src/analysis/test/structuredExcerpt.test.ts) cover exact reconstruction, repeated occurrences, deterministic output, empty excerpts, immutable inputs, and invalid spans.
[Compiler excerpt boundary tests](../src/analysis/test/compilerExcerpt.test.ts) exercise original-source and generated-view capture independently of the native adapter, with injected identity policy and reference exclusion.
[Native excerpt tests](../src/test/nativeCapabilities.test.ts) cover both input compilers and source-free linked rendering from encoded models, including malformed excerpt rejection.
The [fixture guide](../src/test/fixtures/native/README.md#structured-excerpts) records the named and shadowed-reference scenarios.

The graph deliberately stores effective member views rather than reconstructing generic instantiations downstream.
This can duplicate syntax across receiving types; deduplicating it is an optimization, not a requirement for source-free correctness.
Direct heritage targets preserve recursive ancestry, and receiving views preserve transitive substitutions without inferring overload compatibility.
Stage 5 still owns documenter integration, stable website URL policies, and migration or retention of maintained historical artifacts.

### Stage 4. Deliver declarations and entrypoint capabilities

- Productize the generation path proven in Stage 0 using the shared facts and selected surfaces.
- Generate entrypoint declaration rollups from completed `APIAnalysis` data without live compiler resources or full reanalysis. This capability remains required by the revised API scope.
- Keep `rollup-generation` independent of analysis implementation and the other generators, using only the shared graph contract and generic utilities.
- Preserve required imports, remove excluded-only imports, and retain namespace and alias semantics.
- Expose sufficient APIs for release-level entrypoint generation without consumer reimplementation of analysis or selection.
- Test included-dependency and external-reference variants and compile consumers with TS6 and TS7.

Exit: W5 and B4-B5 pass, with B1 and B6 checked where applicable to generated output.
The existing `flub generate entrypoints` command need not be migrated in this stage.

### Stage 5. Integrate builds and documentation consumers

- Document build dependency tracking and failure propagation before changing task integration.
- Add export-validation coverage checks based on configured surfaces, not obsolete command strings.
- Track relevant source, declaration, dependency, export-map, documentation, configuration, and tool-version changes.
- Fresh analysis on every invocation satisfies the initial analysis-reuse contract; build integration must not reuse stale completion status or omit requested missing outputs.
- Keep baseline checks and output-existence checks separate from reusable semantic analysis.
- Test removed outputs, restored baselines, failed runs, concurrent jobs, and clean/incremental agreement.
- Adapt the documenter and website inputs to the new model without repeating semantic resolution downstream.
- Establish a tested retention or conversion path for maintained historical documentation artifacts before replacing their reader.

Exit: W6, W8, W9, and W11 pass in repository integration, including artifact completion and publication status.
Persistent analysis caches are deferred to the follow-up tracker, not required for initial delivery.
Future caching must pass the invalidation and fresh-analysis equivalence tests before use.

### Stage 6. Migrate and retire API Extractor

- Exercise every usage family with representative packages: Tree, fluid-framework, client-utils, Presence, local-driver, the documenter, build-tools, and server.
- Include independent common/tool packages, examples, and experimental packages in the coverage inventory.
- Run old and new workflows side by side during evaluation. Compare intended semantics, not byte equality or known incorrect behavior.
- Classify differences as intended fixes, approved format changes, policy mismatches, or defects. Preserve current per-rule exceptions.
- Migrate consumers in bounded groups with a documented rollback path. Update artifact collection, coverage policy, build tasks, and ownership rules together where required.
- Verify retirement of `flub release setPackageTypesField` and its caller before adoption; that retirement remains outside the replacement package's implementation scope.
- Remove API Extractor dependencies, patches, and obsolete configuration only after their last consumers migrate.

Exit: all W1-W11 acceptance scenarios and F1-F4/B1-B6 regression obligations have linked passing tests; all usage families have migration evidence.
Historical documentation remains renderable and generated declarations remain consumable.

## Verification strategy

| Test layer | Purpose |
| --- | --- |
| Pure unit tests | Configuration merging, graph transformations, selections, policy rules, documentation precedence, deterministic identities, and diagnostics. |
| Real TS7 adapter tests | Verify actual public compiler queries, handles, effective types, process lifecycle, and reusable analysis. Mocks alone cannot establish compiler support. |
| Generator unit tests | Use small completed-graph fixtures to verify each generator independently of compiler and filesystem access. |
| Fixture integration tests | Connect analysis, documentation, policy, and requested outputs. Include positive and negative cases for each W/F/B obligation. |
| Consumer compilation | Build inputs and compile generated declarations with supported TS6 and TS7 versions; analyze through the pinned TS7 engine. |
| Artifact tests | Verify encoding/decoding round trips and reference integrity, reject malformed or incompatible models, and render without source access or repeated semantic resolution. |
| Composition tests | Verify original metadata preservation, immutable shared data and outputs, output-order independence, cleanup, and no compiler queries or full reanalysis during generation. |
| Build and migration tests | Invalidation, missing outputs, restored baselines, concurrency, coverage changes, repository exceptions, and maintained documentation versions. |

Reuse existing test helpers and frameworks where appropriate.
Keep small fixtures close to their owning tests and use representative repository packages for broader integration.
Track W/F/B identifiers in test descriptions or a concise coverage index so acceptance claims are traceable.
Do not close a regression entry until its passing tests are linked.

Measure compiler startup, semantic queries, fact extraction, model size, and total multi-output time on representative packages.
Record trends and repeated-work evidence; do not invent numerical performance thresholds before agreement.
No benchmark result can substitute for the requirement that tasks reuse analysis.

## Questions for review

These questions do not reopen the confirmed TS7, process, documentation, testing, or functional-design decisions.
The suggested defaults are proposals until resolved.

| ID | Question | Suggested starting point | Needed before |
| --- | --- | --- | --- |
| Q1 | Should the first version of `api-analyzer` be published or remain repository-local? | The name and location (`tools/api-analyzer`) are confirmed. Defer external publication initially. | Stage 0 package metadata. |
| Q2 | May the first supported input contract require untrimmed declarations with preserved TSDoc, or must direct `.ts` input ship initially? | Begin with declarations and use Stage 0 fidelity tests to determine whether source access is necessary. | Input contract stabilization. |
| Q3 | What level of unstable TS7 API maintenance is acceptable, and who will own compiler upgrades? | Pin a published release, isolate its API in one adapter, and require contract tests for upgrades. Private APIs remain excluded. | Production dependency commitment. |
| Q4 | How much generic export traversal and artifact modeling are we willing to own if TS7 provides semantics but no complete extraction model? | Own only the required representation and policy integration; review substantial custom declaration-generation or identity logic before implementation. | Stage 0 findings and Stage 1 design. |
| Q5 | Do you have preferences for report format, model format, or configuration style? | Evaluate declaration-like review text, versioned structured models, and typed programmatic configuration with inheritance. Document alternatives before freezing formats. | Stages 1-3 contract stabilization. |
| Q6 | Which package should be the first repository pilot? | Use a small representative package first, then client-utils for conditional parity; keep Tree and aggregate packages as required later gates. | Stage 2 pilot. |
| Q7 | Should historical documentation use a retained old-format reader or converted artifacts? | Retain an isolated reader initially unless conversion proves simpler and lossless for maintained versions. | Stage 5 reader migration. |
| Q8 | What rollout scope and rollback period should each migration group use? | Migrate small groups after side-by-side validation and keep the prior workflow available until the group's acceptance evidence is complete. | Stage 6 adoption. |

No prototype, dependency installation, package scaffold, or migration is performed by this planning change.

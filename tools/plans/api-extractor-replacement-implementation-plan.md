# API tooling replacement: implementation plan

## Status and objective

API direction updated on 2026-09-17: adopt the agreed [one-shot API proposal](../api-analyzer/API-Proposal.md).
The reusable public session has been removed in favor of `analyzeAPIs(configuration): Promise<Result<APIAnalysis>>`.
The initial implementation completes existing callable classification and documentation validation before success and closes the compiler connection before returning.
The completed analysis exposes effective configuration, API counts, and function report generation from prepared data.
General declaration validation, suite loading, model generation, and declaration rollups remain incomplete; this migration does not close Stage 2 or later gates.
Declaration rollups remain required.
Source invalidation and watch mode are not initial API requirements; persistent reuse across builds is deferred.

Status: The initial Stage 1 configuration resolver, compiler adapter, and reusable synchronous session pass 29 focused contract tests, verified on 2026-09-15.
The adapter returns facts that contain no compiler objects.
The first Stage 2 increment implements TSDoc-based release classification and configurable metadata selection, with 45 combined contract tests passing on 2026-09-15.
The subsequent baseline-handling increment adds pure comparison, read-only file checks, and explicit updates, with 48 combined contract tests passing on 2026-09-15.
An initial function-only review report builder and Markdown renderer use checked-in snapshots for full-report tests.
The combined contract suite passes 54 tests, including configurable report presentation and snapshots for TS6- and TS7-built declarations, verified on 2026-09-15.
General declaration reports, reference validation, and the repository pilot are not yet implemented.
See the [Stage 0 results and review decisions](../api-analyzer/README.md#stage-0-results) for reproducible evidence.
The Stage 0 probe recorded 19 passing checks and 3 failures: missing retained-program declaration emission for both input compilers and async request handling after native termination.
The [Stage 1 results and experimental API](../api-analyzer/README.md#stage-1-results) describe the new tests and limits.
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
- Expose API statistics separately from internal performance instrumentation. Exact output signatures and statistics remain to be specified.
- Expected validation failures return diagnostics; internal and unexpected operational failures reject the promise. An asynchronous entrypoint does not require the native asynchronous compiler client.
- Provide a Node.js-compatible TypeScript API. A CLI is optional, not part of the initial required delivery.
- ESM-only support is acceptable. Preserve Node, browser, and custom resolution conditions for supported entrypoints.
- Keep Fluid tags, package scopes, surface names, and policy meanings outside the generic implementation.
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
Follow the repository's [Documentation Guidelines](../../docs/content/Guidelines/Documentation-Guidelines.md) and the applicable guidance linked there, including source-code documentation guidance.
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
Review module overviews and API-level comments whenever fixtures are added or changed, following the [fixture comment guide](../api-analyzer/src/test/fixtures/README.md#fixture-comments).
For comment-only edits, verify unchanged code tokens and attached TSDoc, then run the affected fixture tests without updating snapshots.

Use semantic test and suite names that describe the behavior under test.
Keep design requirement identifiers in comments above the applicable tests, not in test names.
For a temporary investigation test, add a comment that states its purpose and when to remove or replace it.
When renaming tests or suites, verify that test-selection commands still run the intended coverage.

Use checked-in snapshot files for full generated-report expectations rather than inline expected report strings.
Normal test runs must compare snapshots without updating them. Review intentional snapshot changes as API or report-format changes.
Keep focused semantic assertions alongside snapshots for selection, identity, order, and failure behavior.

### Functional architecture

Use a functional core with an effectful boundary:

- Represent API facts, references, policy inputs, selections, and diagnostics as explicit data.
- Prefer pure functions and immutable inputs for transformations. Return new results rather than mutate shared package models.
- Use discriminated unions for states and diagnostic results. Make unsupported or incomplete analysis explicit.
- Pass configuration and dependencies explicitly. Avoid global sessions, hidden filesystem access, and ambient mutable registries.
- Keep filesystem access, compiler communication, process lifecycle, timing, and output publication at the boundary.
- Limit necessary mutation to invocation-owned compiler state, local caches, and private algorithm-local builders. Do not copy large graphs merely to simulate immutability.
- Use basic caching sparingly in performance-critical areas where measurements show costly redundant computation. Prefer small, local caches with explicit ownership, lifetimes, and invalidation rules. Avoid general caching infrastructure unless its benefit justifies the added complexity; cached and uncached results must agree.
- Use focused functions and composition. Do not add a functional programming framework or a large compiler abstraction without a demonstrated need.

Tests must verify that changing task order cannot mutate or corrupt shared analysis.

### Diagnostics and internal validation

Maintain this invariant throughout development: failure diagnostics describe only user-caused failures, such as invalid inputs, configuration, or caller actions.
Document each supported diagnostic code and its corrective action in the public `DiagnosticCode` definition.

- Use standard assertions for internal-only validation and broken implementation invariants. Do not convert assertion failures into diagnostics.
- Propagate unexpected operational failures, such as compiler-process or file-access failures, as exceptions. These failures are not necessarily caused by the user.
- Convert exceptions to failure diagnostics only when the boundary identifies an expected user-input validation failure. A broad catch must not hide library defects.
- Release owned resources and discard invalid cached state before propagating an exception. Preserve the original error; if cleanup also fails, retain both errors.
- Keep capability limitations on successful facts distinct from failure diagnostics. A limitation does not imply invalid user input or complete analysis.
- Test both paths: invalid user inputs return diagnostics, while internal assertions and unexpected operational failures remain exceptions.

## Proposed architecture

The following components are logical ownership boundaries, not a commitment to separate packages or a fixed directory layout.

| Component | Responsibility | Boundary |
| --- | --- | --- |
| Configuration resolution | Resolve defaults, inheritance, overrides, suite selection, and required surface coverage. Expose the effective configuration. | Load files at the boundary; merge and validate explicit data in pure functions. |
| Analysis entrypoint | Resolve ordinary configuration, load suite models, own compiler resources, and complete shared analysis and validation. | Effectful; release resources before returning success or failure. |
| Completed analysis | Own private immutable results and provide report, model, declaration rollup, and API-statistics operations. | No compiler handles, source invalidation, or caller disposal. |
| TS7 adapter | Query official compiler semantics, exports, aliases, effective types, signatures, and declaration origins. | Only this component depends directly on unstable TS7 interfaces. |
| API facts | Represent declarations, export paths, references, signatures, effective members, and provenance. | Readonly data consumed without compiler handles. |
| Documentation processing | Parse TSDoc; resolve suite references and inherited content against API facts and dependency models. | Use the TSDoc parser; keep resolution policy separate from I/O. |
| Policy and selection | Apply generic release-level rules, custom directional rules, per-rule opt-outs, and configured surface selections. | Pure transformations over complete facts and effective configuration. |
| Artifact construction | Construct review artifacts, portable models, declaration output plans, and entrypoint output plans. | Reuse detached results; complete required compiler work behind the adapter before returning the analysis. |
| Output and build integration | Compare baselines, write requested artifacts, report diagnostics, track dependencies, and publish completion metadata. | Effectful; does not reconstruct API semantics. |

The initial processing flow is:

1. Resolve configuration and discover package entrypoints, resolution contexts, dependencies, and selected suite models.
2. Validate every selected suite model and analyze the required declarations in the applicable compiler contexts.
3. Extract reusable API facts while preserving complete validation scope, including excluded targets.
4. Parse documentation and resolve references and inheritance in the correct originating context.
5. Apply enabled policies and derive selected surface views without discarding the complete facts.
6. Retain all data needed for requested output capabilities, release compiler resources, and return the completed analysis or failure diagnostics.
7. Construct requested artifact content from the completed analysis without repeating shared validation.
8. Let build integration write artifacts and perform explicit baseline checks or acceptance.

Validation-only requests must not produce artifacts.
Documentation requests must not implicitly accept report changes.
Invalid selected suite dependencies must fail package processing under F2 even when no link uses the missing model.
Task prerequisites must reflect these contracts rather than force every optional output to run.

### Analysis reuse and lifecycle

Use one completed analysis per package invocation, following the [agreed API contract](../api-analyzer/API-Proposal.md).
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

### Input and declaration generation

Proposed initial input: untrimmed, comment-preserving declaration files built by the package's supported compiler.
Validate this choice against overload documentation, generic specialization, source locations, aliases, and original package context.
Keep source input as an option if declaration inputs cannot preserve required information; do not commit to two input implementations without evidence.

Declaration generation is an early feasibility gate, not a final formatting task.
The inspected TS7 release exposes printing and semantic queries but does not establish all required emit capabilities.
Test complete and trimmed outputs, import closure, namespace exports, nominal identity, and consumer compilation early.
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

Current progress: The [initial classification contract and results](../api-analyzer/README.md#release-classification-and-selection-contract) cover independent callable-overload release levels, explicit custom modifier configuration, diagnostic opt-outs, and named metadata selections.
`classifyApiItems` and `selectApiItems` are experimental pure APIs over explicit data. Selection reuses classified metadata without repeating compiler analysis.
This is metadata selection, not a complete selected declaration graph or report representation.
Real-compiler tests use detached overload facts after session closure with both supported input-build compilers.
The initial 45-test contract suite does not satisfy the Stage 2 exit criteria below.
Release levels use a numeric enum with increasing permissiveness: `Public = 0`, `Beta = 1`, `Alpha = 2`, and `Internal = 3`.
Numeric comparisons express the linear ordering; configured selections remain explicit sets.
TSDoc tag strings map explicitly to enum values, and classification metadata stores those numeric values.

- Document the initial programmatic API, report format, baseline comparison, and update behavior.
- Extend the implemented eager analysis entrypoint with the remaining shared semantic validation. Preserve detached report reuse and tested cleanup before return.
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
The [baseline contract](../api-analyzer/README.md#review-artifacts-and-baselines) requires exact text comparison, no writes during checks, and exception propagation for unexpected filesystem errors.
Three acceptance tests cover missing and stale baselines, exact whitespace, explicit creation and replacement, invalid paths, and filesystem failures.
These operations consume text without parsing report syntax or repeating analysis. They do not yet constitute a review-artifact generator or satisfy the end-to-end parity gate.
The initial report representation now joins selected signature metadata to detached function facts.
The Markdown renderer preserves exported aliases, type-only paths, and compiler overload order, while excluding implementation bodies and provisional identifiers.
The default layout now follows API Extractor's declaration-oriented Markdown style, using compiler-printed call-signature declarations and explicit alias exports.
Release tags display by default; other recognized tags are opt-in. Undocumented annotations are independently configurable and default to enabled.
These options affect presentation only. Tag-only comments do not count as descriptive documentation.
Required package-documentation support is recorded in the follow-up tracker; broader presentation customization follows rough API Extractor parity.
Public, complete, and empty reports use checked-in snapshots. Both TS6- and TS7-built function fixtures render the same snapshots after session closure.
The builder explicitly rejects other declaration forms, including merged namespaces, rather than emitting partial reports.
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
The [resolver contract](../api-analyzer/README.md#explicit-documentation-inheritance-contract) defines bindings, resolved comments, local metadata, and inheritance paths.
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
Collected function and method targets retain signature documentation contexts; effective-member view contexts remain pending.
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
Effective-member context integration, recursive instantiated ancestry, and class/interface report support remain next steps.
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

- Reuse Stage 2 parsing, reference validation, effective documentation, and provenance; add no separate resolver for model output.
- Extend the dependency-model identity, loading, and compatibility contracts introduced in Stage 2 into the complete portable documentation-model contract.
- Serialize resolved links, inherited content, effective members, and metadata with versioned identities. Complete round-trip and downstream-consumer verification without repeating semantic resolution.

Exit: W3, W7, W8, F1-F3, and B3 pass, including missing unused suite models, outside-suite links, public-to-beta links, and non-internal-to-internal rejection.
Load and consume models without a source checkout or live compiler connection.

### Stage 4. Deliver declarations and entrypoint capabilities

- Productize the generation path proven in Stage 0 using the shared facts and selected surfaces.
- Generate entrypoint declaration rollups from completed `APIAnalysis` data without live compiler resources or full reanalysis. This capability remains required by the revised API scope.
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
| Fixture integration tests | Connect analysis, documentation, policy, and requested outputs. Include positive and negative cases for each W/F/B obligation. |
| Consumer compilation | Build inputs and compile generated declarations with supported TS6 and TS7 versions; analyze through the pinned TS7 engine. |
| Artifact tests | Review meaningful differences, resolve references after round-trip serialization, reject incompatible models, and render without source access. |
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

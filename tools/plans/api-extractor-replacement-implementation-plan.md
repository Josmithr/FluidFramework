# API tooling replacement: implementation plan

## Status and objective

Status: The initial Stage 1 configuration resolver, compiler adapter, and reusable synchronous session pass 29 focused contract tests, verified on 2026-09-15.
The adapter returns facts that contain no compiler objects.
The first Stage 2 increment implements TSDoc-based release classification and configurable metadata selection, with 45 combined contract tests passing on 2026-09-15.
The subsequent baseline-handling increment adds pure comparison, read-only file checks, and explicit updates, with 48 combined contract tests passing on 2026-09-15.
Review artifacts, reference validation, and baseline workflows are not yet implemented.
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
- Compiler child processes are acceptable. One Node.js API session must reuse applicable analysis across requested tasks for unchanged inputs.
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

1. Identify the requirement and acceptance scenarios for the change.
2. Write or update the behavior contract before implementation. Specify inputs, outputs, invariants, diagnostics, failure behavior, and compatibility effects.
3. For public APIs and configuration, document representative usage and observable behavior before committing to a signature or schema.
4. Record significant architecture choices and alternatives in short decision records. Keep provisional choices clearly marked.
5. Keep the contract, tests, and implementation in the same change. Update user-facing documentation and migration guidance when behavior changes.

Reuse the planning documents and the future package's existing documentation where appropriate.
Do not create a separate design document for every small change.
Documentation must describe supported behavior, not promise unverified compiler capabilities.

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

Use semantic test and suite names that describe the behavior under test.
Keep design requirement identifiers in comments above the applicable tests, not in test names.
For a temporary investigation test, add a comment that states its purpose and when to remove or replace it.
When renaming tests or suites, verify that test-selection commands still run the intended coverage.

### Functional architecture

Use a functional core with an effectful boundary:

- Represent API facts, references, policy inputs, selections, and diagnostics as explicit data.
- Prefer pure functions and immutable inputs for transformations. Return new results rather than mutate shared package models.
- Use discriminated unions for states and diagnostic results. Make unsupported or incomplete analysis explicit.
- Pass configuration and dependencies explicitly. Avoid global sessions, hidden filesystem access, and ambient mutable registries.
- Keep filesystem access, compiler communication, process lifecycle, timing, and output publication at the boundary.
- Limit necessary mutation to session-owned compiler state, caches, and private algorithm-local builders. Do not copy large graphs merely to simulate immutability.
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
| Analysis session | Own the compiler connection, snapshots, analysis contexts, caches, cancellation, and disposal. Schedule shared work. | Effectful; no repository-specific policy. |
| TS7 adapter | Query official compiler semantics, exports, aliases, effective types, signatures, and declaration origins. | Only this component depends directly on unstable TS7 interfaces. |
| API facts | Represent declarations, export paths, references, signatures, effective members, and provenance. | Readonly data consumed without compiler handles. |
| Documentation processing | Parse TSDoc; resolve suite references and inherited content against API facts and dependency models. | Use the TSDoc parser; keep resolution policy separate from I/O. |
| Policy and selection | Apply generic release-level rules, custom directional rules, per-rule opt-outs, and configured surface selections. | Pure transformations over complete facts and effective configuration. |
| Artifact construction | Construct review artifacts, portable models, declaration output plans, and entrypoint output plans. | Pure where possible; compiler printing or emit remains behind the adapter. |
| Output and build integration | Compare baselines, write requested artifacts, report diagnostics, track dependencies, and publish completion metadata. | Effectful; does not reconstruct API semantics. |

The initial processing flow is:

1. Resolve configuration and discover package entrypoints, resolution contexts, dependencies, and selected suite models.
2. Load the required declarations and acquire or reuse the applicable compiler analysis.
3. Extract reusable API facts while preserving complete validation scope, including excluded targets.
4. Parse documentation and resolve references and inheritance in the correct originating context.
5. Apply enabled policies and derive selected surface views without discarding the complete facts.
6. Construct only the requested reports, models, declarations, and entrypoints from shared results.
7. Publish successful artifacts and return structured diagnostics and completion status.

Validation-only requests must not produce artifacts.
Documentation requests must not implicitly accept report changes.
Invalid selected suite dependencies must fail package processing under F2 even when no link uses the missing model.
Task prerequisites must reflect these contracts rather than force every optional output to run.

### Analysis reuse and lifecycle

Start with session-local reuse. Defer persistent caching until correctness is demonstrated.
The unit of reuse is a compatible analysis context, not necessarily the entire repository or every resolution condition.
Distinct conditions or compiler options may require distinct contexts; output format or release-level filtering alone must not cause a complete reanalysis.

Track compiler setup, extracted facts, parsed comments, resolved documentation, and selected surfaces separately where their invalidation inputs differ.
Shared work must be reused even when callers request operations sequentially through separate API calls.
Coalesce concurrent requests for the same work or otherwise prevent duplicate full analysis and unsafe mutation.

Define snapshot ownership and resource lifetime before exposing the public session API.
Compiler handles must not escape into portable artifacts or remain usable after their owning snapshot is invalid.
Dispose of owned child processes on normal completion and failure. Specify cancellation and recovery behavior in the session contract.
Do not silently reuse stale state after a compiler crash.

Instrument analysis creation and fact extraction so tests can detect task-triggered full reruns.
A single child process alone is not proof of reuse.
Task-specific queries and different semantic contexts are legitimate work and must be distinguished from repeated whole-package analysis.

### Semantic and artifact representation

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

- Document the session lifecycle, dependency inputs, effective configuration, and diagnostic contracts.
- Implement minimal configuration inheritance and explicit analysis contexts.
- Build the TS7 adapter and reusable API facts from real compiler fixtures.
- Cover export aliases, type-only paths, namespaces, merged declarations, effective members, and callable overload identity.
- Verify deterministic facts, task-order independence, input invalidation, and no leaked compiler handles.

Exit: reusable analysis and effective configuration pass focused contract tests for W4, W6, W11, F1, B1, and B2.
Tests at this stage need not claim final artifact behavior that has not yet been implemented.

The initial implementation requires callers to invalidate cached facts after input changes.
Each session owns its cache. Automatic input tracking remains Stage 5 work.
Facts are frozen and contain no compiler objects before the snapshot is disposed.
Different TypeScript projects use separate cache entries.
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
- Use `@microsoft/tsdoc` to parse release levels and custom tags before surface selection. Document tag configuration, missing or conflicting metadata, diagnostics, and rule opt-outs.
- Implement release-level selection per callable overload and generic custom-tag selection.
- Specify and test structured reference facts before implementing reference-validation policies. Preserve reference origins and targets, including non-exported and cross-package targets, independently of selected report surfaces.
- Implement entrypoint and cross-package validation as distinct policies, including custom directional rules and per-rule opt-outs.
- Generate separate review artifacts from shared facts and check Node/browser parity without overwriting an accepted baseline.
- Add a small repository pilot using configured policy, not built-in Fluid behavior.

Exit: W1, W2, W10, and F4 work together through one session, with B1, B2, and B6 assertions against review output.
Validation-only and baseline-update modes remain independent.

The initial per-overload classification and metadata-selection contract was implemented after its tests failed against stubs.
The next increment adds independent baseline comparison, file checking, and explicit file updates.
The [baseline contract](../api-analyzer/README.md#review-artifacts-and-baselines) requires exact text comparison, no writes during checks, and exception propagation for unexpected filesystem errors.
Three acceptance tests cover missing and stale baselines, exact whitespace, explicit creation and replacement, invalid paths, and filesystem failures.
These operations consume text without parsing report syntax or repeating analysis. They do not yet constitute a review-artifact generator or satisfy the end-to-end parity gate.
Next, specify the deterministic declaration report representation and its selection inputs, then implement review output with real-compiler fixtures.
The analysis facts still contain raw declaration text and export targets, not a complete type-reference graph.
Signature documentation and classification inputs use a required `string | undefined` property.
The adapter extracts only the closest attached TSDoc comment, including delimiters, and uses `undefined` when no TSDoc comment exists.
Explicit empty comments remain distinguishable from absence for the future local-comment inheritance rule. Declaration source text remains separate.
Classification reads comment text into separate release-level and modifier metadata; it does not implement inheritance or resolve semantic references.
Do not infer semantic references by parsing printed type strings. Extend facts through the compiler adapter and verify them with real-compiler fixtures.
Extract the required reference facts before disposing of the snapshot so later policies can reuse detached data without repeating full analysis.
Full documentation-link resolution and inheritance remain Stage 3 work; basic TSDoc parsing is a Stage 2 prerequisite.
The declaration-generation gate does not block review and validation work. It remains open for the generation path.
The async termination failure also remains open; Stage 2 continues with the documented synchronous session contract.

### Stage 3. Deliver resolved documentation models

- Reuse the Stage 2 `@microsoft/tsdoc` parsing and conformance diagnostics; add no custom comment parser.
- Specify and implement suite model loading and compatibility for direct, transitive, and peer dependencies.
- Resolve documentation references using their originating package, not a re-exporting package.
- Implement local-comment precedence, explicit inheritance, signature-based automatic inheritance, conflict detection, and cycle diagnostics.
- Serialize resolved links, inherited content, effective members, and metadata with versioned identities.

Exit: W3, W7, W8, F1-F3, and B3 pass, including missing unused suite models, outside-suite links, public-to-beta links, and non-internal-to-internal rejection.
Load and consume models without a source checkout or live compiler connection.

### Stage 4. Deliver declarations and entrypoint capabilities

- Productize the generation path proven in Stage 0 using the shared facts and selected surfaces.
- Preserve required imports, remove excluded-only imports, and retain namespace and alias semantics.
- Expose sufficient APIs for release-level entrypoint generation without consumer reimplementation of analysis or selection.
- Test included-dependency and external-reference variants and compile consumers with TS6 and TS7.

Exit: W5 and B4-B5 pass, with B1 and B6 checked where applicable to generated output.
The existing `flub generate entrypoints` command need not be migrated in this stage.

### Stage 5. Integrate builds and documentation consumers

- Document build dependency tracking and failure propagation before changing task integration.
- Add export-validation coverage checks based on configured surfaces, not obsolete command strings.
- Track relevant source, declaration, dependency, export-map, documentation, configuration, and tool-version changes.
- Keep baseline checks and output-existence checks separate from reusable semantic analysis.
- Test removed outputs, restored baselines, failed runs, concurrent jobs, and clean/incremental agreement.
- Adapt the documenter and website inputs to the new model without repeating semantic resolution downstream.
- Establish a tested retention or conversion path for maintained historical documentation artifacts before replacing their reader.

Exit: W6, W8, W9, and W11 pass in repository integration, including artifact completion and publication status.
Persistent caches are optional; any cache added must pass the invalidation suite before use.

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

# API tooling replacement: repository workflow requirements

## Purpose and scope

This document defines the repository workflows that must remain possible when an in-repository tool replaces API Extractor.
It covers all current uses, including API review, API validation, declaration generation, documentation model generation, and build integration.
It is a requirements document, not an implementation proposal.

The [new capabilities and regression coverage](api-extractor-replacement-new-features.md) document tracks specific API Extractor defects that the replacement must handle correctly.
The [implementation plan](api-extractor-replacement-implementation-plan.md) records the selected TS7 direction, delivery stages, and required documentation-driven, test-driven, and functional development practices.

The following scope decisions come from the requirements discussion:

- Cover all repository uses, not only client API reports and documentation models.
- Reduce the configuration and build-step complexity that the current tool requires.
- Do not require the current script names, number of invocations, configuration hierarchy, or execution order.
- Do not choose report syntax, model serialization, library dependencies, or a command-line interface at this stage.
- A Node.js-compatible TypeScript API is sufficient. A command-line interface (CLI) is optional and may be added later if useful; it is not required.
- Preserve workflow outcomes, not the internal behavior or known defects of API Extractor.

In this document, **must** identifies a required workflow outcome.
**Open decision** identifies a policy or success criterion that needs agreement before implementation.
Current paths and command names are evidence, not requirements for the replacement.

## Terms

- **API surface**: the declarations available to a consumer through a package entrypoint under a selected set of resolution conditions.
- **Release level**: the API stability classification expressed by `@public`, `@beta`, `@alpha`, or `@internal`.
- **Legacy API surface**: the API surface maintained to support internal partners. These APIs aren't yet intended for external adoption and may never be. The custom `@legacy` modifier identifies these APIs and APIs needed to fulfill the associated support commitments. It accompanies a release tag rather than replacing it; the client tooling distinguishes `legacyPublic`, `legacyBeta`, and `legacyAlpha`. A legacy entrypoint can also include current APIs, so its exports are not necessarily all tagged `@legacy`.
- **Current API surface**: the non-legacy API surface. Current release-level entrypoints exclude APIs tagged `@legacy`.
- **API report**: a human-reviewable baseline of an API surface.
- **Documentation model**: API structure and documentation data that a documentation generator can consume without analyzing the source repository again.
- **Suite**: a configured set of packages, selected by package names or glob patterns, whose generated documentation models participate in cross-package documentation reference resolution and inheritance.
- **Declaration rollup**: a generated declaration file that consolidates declarations for a package entrypoint.
- **CI**: continuous integration.

See [Release Tags](../../../docs/content/Guidelines/Documentation-Guidelines/Documenting-TypeScript/Release-Tags.md) for the intended audiences, stability guarantees, and guidance for applying these tags.
The [client entrypoint generator](../../../build-tools/packages/build-cli/src/library/commands/generateEntrypoints.ts) defines how current and legacy API levels are combined into entrypoints.

## Current usage inventory

The inventory below groups current uses by workflow rather than by command name.
The evidence links in the requirement sections identify the controlling code and representative consumers.
This investigation inspected configuration, implementations, tests, and pipeline definitions; it did not execute every extraction job.

| Current use | Representative examples | Required outcome |
| --- | --- | --- |
| Current and legacy reports by release level | Core-interfaces [current report](../../../packages/common/core-interfaces/api-extractor/api-extractor-report.current.json) and [legacy report](../../../packages/common/core-interfaces/api-extractor/api-extractor-report.legacy.json); [Tree scripts](../../../packages/dds/tree/package.json) | Review the APIs exposed to each audience. |
| Complete reports and combined report/model generation | [Build-tools configuration](../../../build-tools/api-extractor-base.json); [server configuration](../../../server/routerlicious/api-extractor-build-base.json) | Support areas that do not use the client report split. |
| Entrypoint and cross-package linting | [Entrypoint validation](../../../common/build/build-common/api-extractor-lint.entrypoint.json); [cross-package validation](../../../common/build/build-common/api-extractor-lint.json); [export-coverage policy](../../../build-tools/packages/build-cli/src/library/repoPolicyCheck/npmPackages.ts) | Validate both exposed declarations and their dependencies. |
| Complete and trimmed declaration roll-ups | [API Markdown documenter configuration](../../api-markdown-documenter/api-extractor.json) | Preserve usable published type declarations. |
| Programmatic extraction and incremental tracking | [Fluid Build task](../../../build-tools/packages/build-tools/src/fluidBuild/tasks/leaf/apiExtractorTask.ts) and [worker](../../../build-tools/packages/build-tools/src/fluidBuild/tasks/workers/apiExtractorWorker.ts) | Integrate results, diagnostics, and invalidation into builds. |
| Package-level and aggregated documentation models | [Core-interfaces model](../../../packages/common/core-interfaces/api-extractor/api-extractor-model.json); [fluid-framework aggregate model](../../../packages/framework/fluid-framework/api-extractor/api-extractor-model.json); [documenter model loader](../../api-markdown-documenter/src/LoadModel.ts) | Supply API structure and documentation independently of reports. |
| Artifact collection, storage, and versioned rendering | [Client artifact staging](../../pipelines/templates/build-npm-client-package.yml); [server artifact publication](../../pipelines/templates/build-docker-service.yml); [combined artifact publication](../../pipelines/publish-api-model-artifact.yml); [website version inputs](../../../website/config/docs-versions.mjs) | Publish reference documentation from build artifacts. |
| Shared tag definitions and metadata | [Fluid tag definitions](../../../common/build/build-common/tsdoc-base.json); [dependency metadata generation](../../../common/build/build-common/api-extractor-report-base.esm.json) | Preserve API policy across package boundaries. |
| Conditional selection of published type declarations (out of scope) | [Deprecated release command](../../../build-tools/packages/build-cli/src/commands/release/setPackageTypesField.ts); [conditional pipeline caller](../../pipelines/templates/include-set-package-version.yml) | Retirement is an adoption prerequisite, not a replacement-tool requirement. |

## Confirmed workflow requirements

### W1. Maintain API review baselines

Developers must be able to update review baselines after an intentional API change.
CI must be able to detect a missing or stale baseline without silently accepting the change.
A reviewer must be able to distinguish changes to current and legacy surfaces and to supported release levels.
Consumers must be able to configure generation of separate review artifacts for each selected API surface.
Separate artifacts need not be the only supported output form; consolidated or other output forms may also be supported.

Review output must expose changes to exported signatures, release levels, and policy-relevant modifiers.
It must expose changes to APIs re-exported from another Fluid package, including changes made in the source package.
An unchanged API must not produce unrelated baseline changes.
Reviewers must be able to identify the package and surface that changed so the repository can retain its API-review ownership rules.
This requirement does not include automatic approval, automatic breaking-change classification, or automatic changeset generation.

Evidence:

- [Shared API Extractor configuration](../../../common/build/build-common/api-extractor-base.json)
- [Report configuration and dependency inclusion](../../../common/build/build-common/api-extractor-report-base.esm.json)
- [Current-surface report configuration](../../../common/build/build-common/api-extractor-report.esm.current.json)
- [Legacy-surface report configuration](../../../common/build/build-common/api-extractor-report.esm.legacy.json)
- [API-review ownership](../../../.github/CODEOWNERS)

### W2. Validate API contracts within and across packages

Where the selected repository policy enables a rule, developers must receive diagnostics for missing or conflicting release levels, incompatible release-level references, and invalid exported type references.
Validation must follow cross-package references.
It must not skip release-level compatibility checks merely because a referenced declaration is not directly exported from the entrypoint under analysis.

Consumers must be able to define and enforce custom API reference rules through configuration or extension APIs.
Rules must be able to use classifications and custom-tag metadata for both the referring API and the referenced API.
These rules must work within and across packages, including references to declarations not directly exported by the analyzed entrypoint.
For example, Fluid Framework must be able to prohibit non-legacy APIs from referencing legacy APIs, independently of their release levels.
This restriction is directional; it must not also prohibit legacy APIs from referencing non-legacy APIs unless the configured policy requires it.
This is a new validation capability that the repository has not been able to implement with API Extractor.
The tool must support equivalent rules for other custom classifications without built-in Fluid-specific logic (see W10).

Validation must distinguish two existing policies:

- An entrypoint must expose a usable API with valid declaration references.
- Cross-package validation must not require every dependency type to be re-exported by its consumer.

The workflow must support validation without updating review baselines or generating documentation artifacts.
This does not require a separate implementation or a separate analysis pass.
Diagnostics must identify the affected package, entrypoint or declaration, violated rule, and relevant reference target.
Where source locations are available, diagnostics must let developers locate the problem without searching generated reports.
Invalid package-documentation tags must remain diagnosable under the applicable policy.
Function overloads must support different release levels, including mixed internal and non-internal overloads, with each callable overload classified and filtered independently.
The tool must not reject a mixed overload set solely because it combines these release levels; repository-specific restrictions may be enforced through configurable validation.

Evidence:

- [Shared validation rules](../../../common/build/build-common/api-extractor-base.json)
- [Cross-package validation policy](../../../common/build/build-common/api-extractor-lint.json)
- [Entrypoint validation policy](../../../common/build/build-common/api-extractor-lint.entrypoint.json)
- [Release-level validation patch](../../../patches/@microsoft__api-extractor@7.58.1.patch)

### W3. Validate documentation in the appropriate context

Developers must receive diagnostics for malformed documentation, unresolved declaration links, unresolved inherited documentation, and inheritance cycles.
Documentation validation must use the intended documentation scope.
A valid link to a lower release level API from a higher release level API (e.g., linking to a beta API from a public API) documentation must not fail only because a public review baseline omits the beta target.

- However, linking to an *internal* API from a non-internal API should be forbidden.

Documentation policy must remain configurable where repository areas have different requirements.
Do not introduce new requirements for underscore-prefixed internal names or complete documentation coverage as incidental migration effects.
The current shared configuration disables both checks; documentation completeness is disabled because of an upstream defect.

Evidence:

- [Documentation diagnostics](../../../common/build/build-common/api-extractor-base.json)
- [Report-specific link handling](../../../common/build/build-common/api-extractor-report-base.esm.json)
- [Complete-model configuration](../../../common/build/build-common/api-extractor-model.esm.json)

### W4. Support the repository's package surfaces and policy differences

The workflow must cover client, server, build-tools, independent common/tool packages, examples, and experimental packages that currently use API Extractor.
It must handle packages with one entrypoint and packages with multiple subpath or conditional entrypoints.
The tool may support ECMAScript modules (ESM) exclusively; CommonJS support is not required.
Within the supported ESM surfaces, it must distinguish Node, browser, and custom package-resolution conditions where the package uses them.
The package and validation-coverage requirements do not require analysis of CommonJS-only entrypoints.
It must not assume that every package exposes current and legacy release-level entrypoints.

Developers must be able to review a complete surface or selected release levels.
They must also be able to assert that two configured surfaces have the same reviewed API.
For example, client-utils currently updates a baseline from the browser surface and checks the Node surface against that baseline without updating it.
The replacement must preserve this parity check without requiring that sequence of file-writing operations.

Shared policy must be reusable, with explicit exceptions for a package or repository area.
Consumers must be able to opt out of individual policy rules through configuration, including requirements for explicit release tags or documentation completeness.
Disabling a rule must not disable other enabled checks.
Moving to the replacement must not silently enable stricter checks in areas that currently disable them.
For example, build-tools allows missing release tags, and the server cross-package configuration disables incompatible-release-tag diagnostics.
The replacement must preserve these existing policy choices through configuration rather than built-in knowledge of repository areas.

API analysis must preserve the meaning of declarations supported by the repository's TypeScript configurations.
The tool must support at least TypeScript major versions 6 and 7 across the required analysis, validation, and generation workflows.
A single TypeScript 7 analysis engine may analyze packages authored or built with TypeScript 6 or 7 using TypeScript 7 semantics.
The tool does not need to reproduce each build compiler's checker behavior or provide a separate analysis engine for each major version.
Compatibility must be verified for supported package inputs and module-resolution configurations, and generated declarations must remain consumable with the corresponding supported build compiler.
TypeScript 7 support is a required input to technology and dependency selection, not an optional future enhancement.
This requirement does not prescribe a compiler API, analysis backend, or integration mechanism.

Supported declaration forms must include aliases, re-exports, namespaces, type-only exports, merged type/value declarations, overloads, generic constraints and defaults, and recursive or computed types.
It must not silently omit an unsupported declaration or replace a valid exported alias with an inaccessible implementation name.
Unsupported analysis must produce an actionable failure.

The workflow must support local workspace dependencies and installed dependencies without requiring every dependency's source project to be rebuilt.
It must preserve the distinction between APIs that a package presents as its own surface and external references that remain external.
Package-specific dependency inclusion or exclusions must be expressible without copying an entire analysis configuration.
This does not require the current `bundledPackages` setting or its pattern syntax.

Evidence:

- [Conditional exports and parity-check scripts](../../../packages/common/client-utils/package.json)
- [Node report parity rule](../../../packages/common/client-utils/api-extractor/api-extractor-report-node.current.json)
- [Build-tools complete reports and policy](../../../build-tools/api-extractor-base.json)
- [Server generation configuration](../../../server/routerlicious/api-extractor-build-base.json)
- [Server cross-package policy](../../../server/routerlicious/api-extractor-lint-base.json)
- [Documented renamed-export failure](../../../common/build/build-common/README.md)
- [Local-driver dependency exception](../../../packages/drivers/local-driver/api-extractor/api-extractor-report.current.json)
- [Tree declaration input and resolution workaround](../../../packages/dds/tree/api-extractor/api-extractor-model.json)

### W5. Preserve consumable package declarations

Packages that use API Extractor to generate declarations must still be able to produce usable declarations for their published entrypoints.
The replacement workflow must preserve the intended type surface and release-level visibility, including complete and trimmed declarations where used.
Generated declarations must resolve their imports and type references when consumed through the package's exports.
Changing implementation names or moving declarations must not silently change exported names or type identity.

The current documenter package enables complete and beta-trimmed declaration roll-ups.
This is an active generation requirement outside the shared client defaults, which disable roll-ups.
It does not require the replacement to use the same declaration-generation technique.

Consumers must be able to implement release-level entrypoint generation using the tool's configuration and APIs.
This includes generating entrypoints for configured API surfaces, with their release-level selections and custom-tag inclusion rules.
Fluid's current and legacy surface definitions must remain repository configuration, not built-in tool concepts.
The tool must provide sufficient capabilities for this workflow without requiring consumers to independently reimplement API analysis and surface selection.
This requirement does not prescribe the API design or require the existing `flub generate entrypoints` command to be migrated as part of the tool's initial implementation.

Evidence:

- [Documenter declaration generation](../../api-markdown-documenter/api-extractor.json)
- [Documenter package exports](../../api-markdown-documenter/package.json)
- [Existing release-level entrypoint generator](../../../build-tools/packages/build-cli/src/library/commands/generateEntrypoints.ts)

### W6. Integrate with local and automated builds

The required workflows must be accessible through a Node.js-compatible TypeScript API without requiring a CLI.
One completed package analysis must support the requested workflows; the tool does not need to provide its own executable.
Compiler child processes are permitted as an implementation detail.

Developers must be able to run API work for one package, affected dependent packages, or a release group without manually ordering a series of extractor invocations.
They must be able to request review, validation, declaration generation, or documentation outcomes together or independently where useful.
Selecting several outcomes must not require separate copies of the same package policy.
The tool must complete configured shared semantic validation once and reuse the completed analysis for requested API reports, declaration rollups, and documentation model artifacts.
The [API direction agreed on 2026-09-17](API-Proposal.md) uses `analyzeAPIs(configuration): Promise<Result<APIAnalysis>>`.
The [agreed architecture](Architecture-Proposal.md) makes report, model, and declaration generators independent consumers of one completed immutable graph.
Shared classification, documentation resolution, and validation belong to analysis, not to a generator.
The returned analysis exposes output operations and API statistics, but no source invalidation, reanalysis, or disposal methods.
Output operations may run separately and must not repeat full analysis or shared validation.
Different content variants, API surfaces, or validation policies must not require independent configurations or a complete rerun of the same API analysis for each operation.
A wrapper that reruns the entire API analysis independently for each output is not acceptable, regardless of process count.
The design must reuse applicable setup and analysis across outcomes for unchanged inputs.
Task-specific output work, distinct internal analysis contexts, and new invocations after relevant input changes are permitted within the agreed architecture.
Numerical performance targets are deferred.
Fresh analysis on each invocation is acceptable, even for unchanged inputs.
Persistent analysis caching and restoration across builds are deferred; watch mode and live source invalidation are not initial requirements.

Builds must preserve dependency-aware correctness across package boundaries.
An incremental build must not report success using stale API results after a relevant source, declaration, dependency, export map, documentation, configuration, or tool-version change.
Changing, removing, or restoring an old review baseline must invalidate the affected baseline check.
Missing generated outputs must be regenerated when requested.
Clean and incremental builds must agree on API results for the same inputs.

Build integration must expose actionable failures and a reliable success or failure result.
Running through an orchestrator must not hide diagnostics that appear in a direct local run.
Independent work must be safe to schedule concurrently without corrupting shared outputs.
The replacement does not have to preserve the current worker API or task-name conventions.

Evidence:

- [Current task ordering](../../../fluidBuild.config.cjs)
- [Incremental extraction task](../../../build-tools/packages/build-tools/src/fluidBuild/tasks/leaf/apiExtractorTask.ts)
- [Report-state regression tests](../../../build-tools/packages/build-tools/src/test/tasks/leaf/apiExtractorTask.tests.ts)
- [Programmatic worker integration](../../../build-tools/packages/build-tools/src/fluidBuild/tasks/workers/apiExtractorWorker.ts)

### W7. Supply complete data for API documentation

Documentation authors must be able to generate API reference content from a complete documentation model, independently of the selected review surfaces.
A documentation model must retain enough information for the following existing consumer workflows:

- Organize APIs by package, entrypoint, namespace, and containing declaration.
- Display declaration kinds, signatures, overloads, parameters, type parameters, return types, inheritance, and member relationships.
- Display type expressions accurately and link references within signatures to the intended API items.
- Distinguish declarations that share a name, including type/value declarations, nested members, and overloads.
- Display summaries, remarks, examples, parameter and type-parameter documentation, return documentation, deprecation notices, and supported documentation blocks.
- Resolve declaration links within and across packages, including references with an explicit package and references resolved from the originating context.
- Apply inherited documentation across the selected package set, without silently losing content or accepting inheritance cycles.
- Apply release-level and package filters downstream, without confusing an omitted review item with a missing documentation target.
- Produce stable page and section links, including the website's version-specific API link manifests.

Model scope must include the APIs that a package re-exports for documentation, including selected implementation packages when required.
For example, fluid-framework includes Fluid package APIs, and Presence includes its internal Presence packages.
The replacement must not assume that documentation always excludes dependency declarations because the shared model configuration does not bundle them by default.

Through repository configuration and downstream consumers, the workflow must preserve the meaning of Fluid's `@legacy`, `@system`, and `@input` modifiers alongside ordinary release levels and deprecation metadata.
The tool must preserve configured custom-tag metadata without built-in knowledge of these Fluid-specific meanings (see W10).
In particular, `@legacy` is a separate classification, not a replacement name for `@alpha`.
The website currently treats legacy APIs differently from ordinary alpha APIs when displaying notices.

Documentation extraction must not force website layout, navigation, page filtering, or rendering choices.
The same API data must remain usable by the documenter library and other repository documentation consumers.

- The exact format this data takes does not need to be compatible with the current `api-markdown-documenter` package tooling.
  It is okay to make changes to that package to support a new API model format in order to support the `api-extractor` replacement library.

Documentation references and inherited documentation must be resolved before documentation model output, as specified in [F2 and F3](api-extractor-replacement-new-features.md#f2-resolve-documentation-references-before-model-output).
Downstream consumers must not need to repeat semantic reference resolution; output representation and rendering remain design decisions.

Evidence:

- [Complete-model configuration](../../../common/build/build-common/api-extractor-model.esm.json)
- [Fluid documentation tags](../../../common/build/build-common/tsdoc-base.json)
- [Model loading and inherited documentation](../../api-markdown-documenter/src/LoadModel.ts)
- [Model-level reference validation](../../api-markdown-documenter/src/LintApiModel.ts)
- [Documentation transformation helpers](../../api-markdown-documenter/src/api-item-transforms/helpers/Helpers.ts)
- [Website rendering and filtering](../../../website/infra/api-markdown-documenter/render-api-documentation.mjs)
- [API link identity and overload handling](../../../website/infra/api-markdown-documenter/api-link-manifest.mjs)
- [Aggregate-package documentation scope](../../../packages/framework/fluid-framework/api-extractor/api-extractor-model.json)
- [Presence re-export documentation scope](../../../packages/framework/presence/api-extractor/api-extractor-model.json)

### W8. Produce and consume versioned documentation artifacts

Builds must produce portable documentation artifacts that later jobs can collect, publish, and render without repeating API analysis against the original source tree.
The workflow must support both local working-tree documentation and documentation from published build artifacts.
It must support combining package artifacts into the package set required for a documentation version.
Combining artifacts must not silently replace one package or surface with another.

Documentation generation must support the site's maintained versions alongside a local preview.
A replacement must not make older published documentation inputs unusable without an agreed migration or retention path.
This is a documentation continuity requirement, not a requirement to preserve an existing serialization format.

Artifact production and collection must distinguish successful, complete output from stale or missing output.
A documentation-only build must not require accepting an unrelated API baseline change.
Review-baseline updates and documentation artifact generation must remain independently controllable even if one invocation can do both.

Current evidence includes root collection scripts, CI artifact publication, an Azure publication pipeline, and version-specific website downloads.
The current artifact names, flattened directories, archive types, storage URLs, and upload tools are not requirements for the replacement.

Evidence:

- [Root generation and collection workflows](../../../package.json)
- [Client build artifact staging](../../pipelines/templates/build-npm-client-package.yml)
- [Independent-package artifact staging](../../pipelines/templates/build-npm-package.yml)
- [Server artifact publication](../../pipelines/templates/build-docker-service.yml)
- [Combined documentation artifact publication](../../pipelines/publish-api-model-artifact.yml)
- [Published artifact download](../../../website/infra/download-doc-models.mjs)
- [Versioned and local documentation inputs](../../../website/config/docs-versions.mjs)

### W9. Keep validation coverage complete as packages change

Repository maintainers must be able to determine which package surfaces receive API validation.
Adding a package, export, or resolution condition must not silently bypass the required checks.
The workflow must support shared defaults, explicit coverage exceptions, and verification of required coverage.
It must not depend on maintainers adding a separate script and configuration file for each covered declaration entrypoint.

Policy checks must validate the intended coverage rather than require obsolete API Extractor command strings.
The replacement must account for configuration consumers, shared documentation-tag definitions, generated metadata, and build-tool integrations that currently depend on API Extractor.
Removing the executable alone is not a complete workflow replacement.

Evidence:

- [Export-coverage policy and generated lint configuration](../../../build-tools/packages/build-cli/src/library/repoPolicyCheck/npmPackages.ts)
- [Shared documentation configuration dependency](../../../common/build/build-common/tsdoc-base.json)
- [Cross-package metadata generation](../../../common/build/build-common/api-extractor-report-base.esm.json)

### W10. Keep repository-specific policy outside the tool

The tool must conform to the [TSDoc specification](https://tsdoc.org/), including its syntax, tag semantics, and custom-tag extension rules.
It may have built-in knowledge of tags defined by that specification, but no other tags.
Tags outside the specification and their meanings must be supplied through configuration or extensions, not built into the tool.

The tool must not depend directly on Fluid Framework-specific concepts, tags, package scopes, or API surface names.
Fluid Framework must be able to configure the tool to implement its API policies without changing the tool's implementation.
References to Fluid-specific behavior elsewhere in this document describe the configured repository workflow, not built-in tool behavior.

In particular, the tool must not have built-in knowledge of `@legacy` or of "legacy" versus "current" API surfaces.
Repository configuration must be able to define custom tags and named API surfaces, select APIs by tag presence or absence, and combine those selections with release levels.
This must be sufficient to express current surfaces that exclude `@legacy` APIs and legacy surfaces that include the configured combination of legacy and current APIs.
The same capabilities must work with other custom tag and surface names without implementation changes.

Custom-tag metadata must remain available for configured review output, validation policy, and downstream documentation consumers.
Fluid-specific meanings for tags such as `@system` and `@input`, dependency inclusion rules, and documentation notices must belong to repository configuration or downstream consumers rather than the tool itself.
The design of the configuration or extension mechanism remains open; this requirement does not prescribe a plugin system, configuration format, or rule language.

### W11. Make the complete effective configuration inspectable

The tool must support reusable configurations and extension of base configurations.
Developers must be able to view the complete effective configuration for their selected execution context after all configuration sources, inherited settings, defaults, and overrides have been resolved.
The view must reflect the configuration actually used by the tool, not only the settings explicitly supplied in one configuration file.
Developers must not have to reconstruct the final configuration manually by following its inheritance chain.

This requirement does not prescribe the inspection mechanism, interface, or output format.

## Ownership boundaries

The requirements describe end-to-end repository outcomes.
They do not require one executable to own every step.

| Area | Relationship to this replacement |
| --- | --- |
| Repository-specific API policy | Fluid Framework owns custom tags, surface definitions, and their policy meanings. The tool supplies generic capabilities that repository configuration can use. |
| TypeScript compilation | API Extractor currently analyzes built declarations. Input selection remains open. One TS7 analysis engine may serve TS6- and TS7-built packages under W4; supported input and declaration-consumption compatibility must be verified. |
| Release-level entrypoint generation | The tool must provide configuration and APIs sufficient to implement this workflow. Fluid-specific surface rules remain repository-owned; migration of the existing `flub generate entrypoints` command is a separate integration decision. |
| Tree entrypoint source generation | Tree has an additional source-generation workflow. API changes must continue to propagate to its consumable and reviewed surfaces. The current shell script need not remain. |
| API review and release decisions | Reports support human review. API approval, release policy, and changeset decisions remain separate responsibilities. |
| Documentation rendering | Extraction supplies sufficient API data. Rendering, website layout, page filtering, and link-manifest production can remain downstream. |
| CI publication | Extraction supplies complete artifacts and reliable status. Existing CI and storage tools may continue to publish those artifacts. |
| Other checks | Type tests, package-consumption checks, ordinary TypeScript checking, and ESLint are not automatically replaced by API validation. |

Boundary evidence:

- [Independent entrypoint generator](../../../build-tools/packages/build-cli/src/library/commands/generateEntrypoints.ts)
- [Existing export and release-level analysis](../../../build-tools/packages/build-cli/src/library/typescriptApi.ts)
- [Tree generation and validation workflows](../../../packages/dds/tree/package.json)

## Existing constraints that are not requirements

The following mechanisms explain the current implementation, but they must not constrain the replacement design:

- Separate analysis passes solely to select reports, models, linting, or different release-level outputs.
- Metadata-generation tasks that must run first merely so the extractor recognizes dependency release tags.
- Script parsing and exact configuration filenames as proof that exports receive validation.
- The current JSON schemas, model classes, Markdown syntax, diagnostic identifiers, and path conventions.
- A patch to suppress report imports. The requirement is focused, stable review output, not a mandatory omission of all import information.
- A patch to validate release levels on references outside the consumable export set. The requirement is correct validation, not the patched algorithm.
- Incorrect names for aliased dependency exports or module-resolution substitutions used to work around extraction defects.
- Repeated model loading or inherited-documentation workarounds in downstream tools.

The replacement must preserve intentional policy while removing technical workarounds where possible.
For example, allowing a public documentation comment to link to a beta API is intentional.
Using a separate extraction pass to avoid a false unresolved-link diagnostic is not a required workflow.

## Acceptance scenarios

These scenarios define observable outcomes for later implementation tests.
They do not prescribe test files, output syntax, or a migration sequence.
Existing configuration is evidence for expected policy, not a byte-for-byte oracle for known defects.

| Scenario | Required result | Requirements |
| --- | --- | --- |
| Change a public signature or `@input`/`@system` classification. | A focused review difference identifies the affected surface; CI rejects an unaccepted baseline. | W1 |
| Configure separate review artifacts for multiple API surfaces. | Each selected surface receives its own artifact containing its configured API selection, reusing applicable analysis across surfaces. | W1, W6, W10 |
| Change a dependency API re-exported by an aggregate package. | The consuming surface's review and documentation reflect the change. | W1, W4, W7 |
| Reference a less stable dependency type from a more stable API, where validation is enabled. | Validation reports the relationship, including references not directly exported by the analyzed entrypoint. | W2 |
| Configure a rule that prohibits non-legacy APIs from referencing legacy APIs, then exercise references within and across packages. | Validation diagnoses prohibited references even when release levels match or the target is not directly exported. Reverse-direction references remain allowed by this rule. | W2, W10 |
| Enforce an equivalent API reference rule using another custom classification. | The rule uses the configured classification of both APIs and produces actionable diagnostics without changes to the tool's implementation. | W2, W10 |
| Reference a valid external type without re-exporting it. | Cross-package policy does not demand an unnecessary new consumer export. | W2, W4 |
| Link from public documentation to a beta API. | The link resolves in the documentation scope; the public baseline's filtering does not cause a false error. | W3, W7 |
| Use malformed documentation, conflicting release tags, or an inherited-documentation cycle. | The applicable policy produces an actionable diagnostic. | W2, W3 |
| Change a Node-only API that must match a browser baseline. | The parity check fails without overwriting the accepted browser surface. | W1, W4 |
| Analyze an aliased namespace re-export and same-name type/value declarations. | Exported names, reference identity, and documentation links remain correct. | W4, W5, W7 |
| Build a package with complex generic and recursive types. | Reports and models preserve the declared API; generated declarations remain consumable. | W4, W5, W7 |
| Run the required analysis, validation, and generation workflows against packages using TypeScript 6 and TypeScript 7. | Both package versions are supported; one TS7 engine using TS7 semantics is acceptable. Input and module-resolution compatibility are verified, and generated declarations remain consumable with the corresponding build compiler. | W2, W4, W5, W6, W7 |
| Generate complete and release-filtered published declarations. | Package consumers resolve the intended types; excluded APIs do not leak into the selected surface. | W5 |
| Implement release-level entrypoint generation using the tool's configuration and APIs. | Generated entrypoints expose the configured surfaces, including current/legacy combinations, without consumer reimplementation of API analysis and surface selection or Fluid-specific logic in the tool. | W4, W5, W10 |
| Add an export with a new resolution condition. | Required validation coverage includes it or reports a coverage gap. | W4, W9 |
| Restore an old baseline or remove a requested generated artifact after a successful build. | The next relevant build revalidates or regenerates instead of returning stale success. | W6 |
| Change shared policy, dependency tags, or compiler resolution settings. | Affected packages are reanalyzed; clean and incremental results agree. | W4, W6 |
| Load package artifacts in a different order. | Cross-package links and inherited documentation resolve to the same content. | W7, W8 |
| Render a maintained documentation version without its source checkout. | The published artifact set supplies the required API data and links. | W7, W8 |
| Request models without accepting report changes, or validation without generation. | Only the selected workflow outcomes occur. | W2, W6, W8 |
| Request all supported API generation and validation operations for the configured surfaces together. | One invocation completes shared validation and returns an analysis that supports all requested output variants without full reanalysis. Instrumentation verifies reuse and compiler cleanup before return. | W6 |
| Apply build-tools or server policy with individual rules disabled, such as the requirement for explicit release tags. | Disabled rules do not produce policy violations, other enabled checks remain active, and the area's existing policy choices are preserved. | W2, W4, W10 |
| Configure current and legacy surfaces using `@legacy` and release levels. | API selection follows repository configuration, including the configured overlap between surfaces, without Fluid-specific logic in the tool. | W4, W10 |
| Configure equivalent selections with a different custom tag and different surface names. | Review, validation, and documentation workflows use the configured selections and metadata without tool implementation changes. | W1, W2, W7, W10 |
| Extend a reusable base configuration and override some settings. | Developers can view the complete resolved configuration, including inherited values, defaults, and effective overrides, matching what the tool uses for the selected execution context. | W11 |

The evaluation set must cover each in-scope usage family in the inventory, not only a small package with simple exports.
Representative cases include Tree, fluid-framework, client-utils, Presence, local-driver, the documenter, a build-tools package, and a server package.
Compare both positive and negative cases, including accepted exceptions and intentional failures.

## Resolved workflow decisions

1. **Performance and simplification targets:** Numerical performance targets are deferred. One completed package analysis must support multiple outputs without repeating full analysis or shared validation. The 2026-09-17 API decision removes live session invalidation and defers persistent caching while retaining declaration rollups. Compiler child processes are permitted during analysis and must be released before return. W6 and its acceptance scenario capture this requirement. Downstream website rendering and publication remain separate.
2. **Currently disabled checks:** Consumers must retain the ability to opt out of individual policy rules, including requirements for release tags or documentation completeness. Preserve the existing policy choices of build-tools, server, and other repository areas through configuration. Migration does not enable currently disabled checks. W4 and its acceptance scenario capture this requirement.
3. **Review granularity:** Consumers must be able to configure separate review artifacts for each selected API surface. Separate artifacts are not required to be the only supported output form; consolidated or other output forms remain optional. W1 and its acceptance scenario capture this requirement without prescribing artifact syntax.
4. **Deprecated publishing-time type selection:** The new tool does not need to support or replace `flub release setPackageTypesField`. Retiring that command and its remaining pipeline caller is a prerequisite for adopting the new tooling, outside this tool's requirements. This exclusion does not remove the declaration-generation requirements in W5.
5. **Release-level entrypoint generation:** Consumers must be able to implement this workflow through the tool's configuration and APIs. W5 and its acceptance scenario capture the capability requirement. The API design and migration of the existing generator remain separate implementation and integration decisions.
6. **Architecture and model ownership:** The 2026-09-17 architecture decision defines independent generators over a completed semantic graph, with mutable compiler and parser state private to analysis. The model layer owns versioned encoding, decoding, and validation; root composition reads artifacts and passes validated dependencies to analysis. Full analysis restoration remains deferred and is not guaranteed by initial model serialization.

## Decisions deferred from this document

The API and architecture proposals record the agreed public workflow and layer boundaries.
Detailed graph schemas, artifact formats, and generation strategies still require documented designs and capability evidence.
The persistent-reuse follow-up must determine whether full restoration can use the portable model or needs a separate cache artifact.
It must also determine whether to retain or replace existing supporting libraries.
No requirement in this document mandates compatibility with an API Extractor class, configuration file, diagnostic identifier, or serialized model schema.

The migration design must account for existing consumers, but this requirements stage does not choose how those consumers adapt.

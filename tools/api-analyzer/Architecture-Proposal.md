# `api-analyzer` Architecture Proposal

Status: architecture direction agreed on 2026-09-17; directory migration and the complete shared graph are not yet implemented.
The [API proposal](API-Proposal.md) defines the public workflow.
The [implementation plan](../plans/api-extractor-replacement-implementation-plan.md) defines delivery stages and capability gates.

## Public workflow

1. The caller passes ordinary configuration to `analyzeAPIs` and awaits `Result<APIAnalysis>`.
2. Successful analysis returns an object that provides declaration rollup generation, API model generation, API report generation, and API statistics.
3. The caller requests outputs from that object without repeating analysis or shared validation.

Compiler resources are released before analysis returns success or failure.
The returned object has no source invalidation, reanalysis, or disposal methods.
Output methods return artifact content; the caller owns file writes and explicit baseline acceptance.

## Operations

**Analysis** reads comment-preserving declaration files produced by `tsc` and consumes validated dependency-model data.
It extracts compiler facts, classifies original metadata, resolves documentation and references, and applies configured shared validation.
Its output is one completed analysis graph, not only raw compiler facts.

**Declaration rollup generation** reads the completed graph and configured surface selections to produce complete or trimmed entrypoint declarations.
It does not query a live compiler or repeat semantic analysis.

**API model generation** encodes graph data in an explicit, versioned JSON format for dependency analysis and documentation tools.
The same layer decodes artifacts and validates their format, identities, references, and completeness.
The artifact format is not an automatic dump of internal objects.

**API report generation** reads the completed graph and selection criteria to produce a deterministic Markdown overview of the API surface.
It can prepare report-specific records, but it does not classify original comments or resolve documentation references.

The three generators are independent consumers of the same graph.
They must not invoke one another or depend on analysis implementation code.

## Completed graph

The graph describes the API independently of any output format.
It includes declaration and export identities, type and member relationships, original release and custom metadata, resolved documentation and API links, and source provenance.
It retains required unselected targets so output selection does not change validation scope or documentation lookup.
Original classification remains separate from inherited descriptive content.

The graph is immutable after analysis completes.
Compiler handles, mutable TSDoc nodes, traversal sets, and construction indexes remain private working state in `analysis`.
Generators must not depend on that working state.
The shared graph contract does not need to mirror every intermediate representation or introduce a second TypeScript type system.
Use official compiler results and preserve relationships explicitly; do not infer semantics from printed type strings.

## Source organization

Use the following directories under `src`.
These are ownership boundaries within one package, not separate packages.

| Directory | Responsibility | Allowed internal dependencies |
| --- | --- | --- |
| `utilities` | Generic assertions and small data helpers without API-domain policy. | No other layer. |
| `analysis-types` | Shared graph types, input/output contracts, and narrowly scoped graph operations needed by multiple layers. | `utilities`. |
| `analysis` | Compiler access, extraction, original classification, documentation resolution, and shared semantic validation. | `analysis-types`, `utilities`. |
| `rollup-generation` | Complete and trimmed declaration output from the completed graph. | `analysis-types`, `utilities`. |
| `model-generation` | Versioned model encoding, decoding, and artifact validation. | `analysis-types`, `utilities`. |
| `report-generation` | Report-specific preparation and Markdown generation from the completed graph. | `analysis-types`, `utilities`. |

The `src` root contains the public API and composes these layers.
It resolves configuration, reads selected dependency artifacts, invokes model decoding and validation, and passes validated data to analysis.
Analysis does not import the model implementation to read its own dependencies.
Artifact file writes remain the caller's responsibility.

Keep the graph contract independent of compiler-specific and renderer-specific object types.
Generic utilities must not become a home for release selection, reference policy, or domain-specific traversal.
Establish shared semantic results during analysis where possible.
If generators need a common selection or graph operation, place it beside the graph contract instead of duplicating it or making generators import one another.
Add such operations only when shared use requires them; do not add a general graph framework.

Enforce directory dependency rules with the existing ESLint tooling as layers are introduced.
Do not add separate dependency-checking infrastructure unless existing tooling is insufficient.
Create directories when their implementations are needed, not as empty scaffolding.

## Model contract

Specify a serialized format with a format version, stable identities, explicit references, and compatibility rules.
Represent graph references by identifiers rather than serializing object cycles or process-local handles.
Exclude mutable parser objects, transient indexes, and absolute checkout paths from portable identity.
Decoding must validate malformed, incompatible, incomplete, and unresolved-reference inputs before analysis consumes them.
Validate every selected suite dependency, including models unused by documentation links.
Dependency models do not replace the type declarations used by compiler analysis.

The shared graph and portable artifact may eventually support complete analysis restoration without compiler access.
That is a future capability to verify, not a guarantee of the initial serializer.
The [persistent-reuse follow-up](../plans/api-extractor-replacement-follow-ups.md#persistent-analysis-reuse-across-builds) must determine whether the portable model contains all required data or a separate cache artifact is needed.
Restored analysis must agree with fresh analysis for every supported output, statistic, and configured validation result.
Dependency-model decoding is required for suite resolution and is not deferred with cross-build caching.

## Functional boundaries

Use a functional core with explicit I/O boundaries.
Compiler and filesystem operations are effects even when they are isolated in separate directories.
Keep those operations at the public composition boundary and the analysis adapter.
Transform explicit data within each layer and keep necessary mutation local to construction or traversal.
Do not expose mutable working state to another generator or to callers.

Expected input failures return diagnostics through the public result contract.
Internal assertions and unexpected operational failures remain exceptions, with cleanup preserving the original failure.
Output-specific request validation remains separate from completed shared semantic validation.

## Declaration feasibility

Declaration rollups remain required under this architecture.
Prove that the completed graph retains enough information for import closure, surface trimming, aliases, namespaces, and nominal identity before depending on a generation strategy.
Compile generated declarations with the supported consumer compilers.
Printed type strings alone do not establish these capabilities.
Do not compensate for missing graph data by silently retaining compiler resources or rerunning analysis inside a generator.
If official tooling cannot satisfy the boundary, record a blocker for an explicit design decision rather than remove rollup support.

## Tests and migration

- Test analysis with the real compiler and declarations built by both supported TypeScript versions.
- Test each generator with small graph fixtures that isolate its output behavior, without compiler or filesystem access.
- Test model encoding and decoding with round trips, invalid references, compatibility failures, and missing selected dependencies.
- Test composition end to end for immutable outputs, output-order independence, original metadata preservation, and no repeated semantic analysis.
- Test resource cleanup on success and failure, and verify that generation works after compiler disposal.
- Retain complete report snapshots and generated-declaration consumer checks alongside focused semantic assertions.

Migration starts by defining the completed graph contract and model-reader responsibilities.
Then move shared classification, reference resolution, and documentation validation into `analysis`.
The current report preparation still calls documentation resolution; that must move rather than become a dependency from `report-generation` to `analysis`.
Keep mutable extraction and documentation contexts private, and make report preparation consume completed graph data.
Move existing implementations into their owning directories and enforce imports without preserving obsolete internal APIs.
Keep the public API narrow and preserve existing validated behavior during the migration.
The directory reorganization alone does not complete suite support, portable models, or declaration rollups.

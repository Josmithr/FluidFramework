# API tooling replacement: follow-up tracker

## Purpose

Track deferred investigations and improvements separately from the [implementation plan](api-extractor-replacement-implementation-plan.md).
These items do not define delivery-stage exit criteria. Schedule them separately from the remaining plan work unless a required capability depends on them.
The plan retains required capability gates, acceptance criteria, and implementation blockers.
Moving an item here does not waive those requirements or mark an unresolved capability as supported.
Scheduling decision on 2026-09-20: finish the remaining library implementation before pursuing these follow-ups.
Stage 2 is accepted with the documented unnamed-selector parser limitation and deliberate module-reference exclusion.
Complete portable models and declaration rollups remain required Stages 3 and 4 work in the plan, not optional follow-ups.

## Persistent analysis reuse across builds

Status: open; explicitly deferred from initial delivery by the [2026-09-17 API decision](API-Proposal.md).

Investigate avoiding repeated package analysis when inputs have not changed since a previous build.
The initial version may perform fresh analysis on every invocation.
This follow-up does not introduce watch mode or source invalidation on `APIAnalysis`.
Follow the [agreed model contract](Architecture-Proposal.md#model-contract): serialized artifacts have an explicit versioned format, not the internal working-context layout.
Dependency-model decoding and validation remain required for suite resolution and are not deferred by this item.

- Identify all relevant inputs, including analyzed declarations, effective configuration, resolution settings, selected dependency models, and analyzer and compiler versions.
- Define input fingerprints and validation rules for restoring completed analysis.
- Determine whether the portable API model contains sufficient data for full analysis restoration or a separate cache artifact is required. Model round-trip fidelity alone does not prove restoration equivalence.
- Compare restored and fresh analysis for reports, declaration rollups, models, API statistics, and configured validation.
- Reject stale, incomplete, or incompatible cache entries and recompute analysis rather than return stale success.
- Keep baseline checks and missing-output regeneration independent of analysis cache hits.

Acceptance: restored analysis is equivalent to fresh analysis for unchanged inputs, and relevant input changes prevent stale reuse.
Within-invocation reuse across outputs and dependency-aware build correctness remain required before this follow-up.

## Automatic overload documentation inheritance

Status: open; explicitly deferred from Stage 2 by the revised inheritance scope.

Investigate confident automatic documentation-source selection for overloaded members, including independently generic signatures.
Current policy excludes automatic inheritance when the receiving member or a candidate source member is overloaded.
Ambiguous or unproven automatic sources leave documentation absent. Explicit numeric `@inheritDoc` selectors remain supported within the implemented declaration scope.

- Evaluate official compiler APIs for pairwise signature compatibility, including generic substitution and constraints. Do not infer matches from printed signature text or overload order.
- Retain the native generic-overload capability regression as evidence of the tested TS7 7.0.2 limitations, not proof that all official approaches are impossible.
- Cover reordered overloads, generic parameters, optional and rest parameters, base classes, implemented interfaces, and conflicting sources.
- Preserve local-comment suppression, original release classification, and source provenance. An uncertain match must not copy documentation.
- Keep explicit numeric selectors one-based and order-sensitive; test invalid selectors independently of automatic matching.

Acceptance: automatic inheritance selects a demonstrably compatible source without guessing, or leaves documentation absent when no confident selection is possible.
This item is not a Stage 2 exit requirement and does not defer non-overloaded automatic inheritance or explicit numeric selector support.

## Flexible container member selection

Status: open; explicitly deferred beyond V1 by the 2026-09-18 container decision.

V1 must keep selected containers intact, including namespace exports, static class members, and constructor signatures.
That rule is implemented and tested for the supported report and analysis forms; see the [Stage 2 acceptance audit](api-extractor-replacement-implementation-plan.md#current-acceptance-checklist).
Declaration-rollup selection remains Stage 4 work, not part of this optional follow-up.
Investigate whether a later version can permit different member release levels or independent member selection with a clear compatibility contract.
No namespace or static-member exception is approved for V1.

- Evaluate assignability of instance types, constructor/static types, and namespace values obtained through `typeof` across different selected surfaces.
- Define the effects of release-level and custom-tag filters on complete container shapes, inherited members, local overrides, and nested containers.
- Preserve constructor accessibility, overload resolution, and required reference targets. Removing a constructor must not accidentally permit a new construction pattern.
- Specify diagnostics, configuration, and dependency-model requirements before introducing any exception.
- Verify reports, models, and declaration rollups against mixed-surface consumer examples with both supported compiler versions.

Outcome: document whether additional flexibility is justified and which compatibility guarantees it can preserve.
Any implementation requires an approved design; this item is not a commitment to permit partial container selection.

## Upstream TypeScript reports

Status: open; follow-up to the [Stage 0 findings](../README.md#stage-0-results).

- Create a minimal standalone reproduction of the async native-process termination issue. Show that the pending request does not reject as expected.
- Create minimal reproductions for other suspected TypeScript defects encountered during this project. Remove repository-specific dependencies and unrelated behavior.
- Record the compiler version, Node.js version, operating system, reproduction command, and expected and actual results. Retest against the latest published tooling without changing the project's pinned dependency merely to prepare a report.
- Check existing upstream issues before filing. Add evidence to an applicable report or file a new TypeScript bug when appropriate. Distinguish missing API capabilities from implementation defects.
- Link upstream reports to the local regression tests and findings. Keep unresolved cases visible and verify fixes before closing them locally.

No upstream bug has been filed as part of this tracked follow-up.
The declaration-generation capability gate remains in the implementation plan. Deferring upstream reporting does not resolve that gate.

## Verify and report the TSDoc unnamed-selector mismatch

Status: open; requested on 2026-09-20 and deferred until the remaining library implementation is complete.
The user accepted this known limitation for Stage 2 closure; the task still requires verification and an upstream report if warranted.

The official [label documentation](https://tsdoc.org/pages/tags/label/) shows references such as `Interface.(:CALL)` for labeled unnamed members.
The pinned `@microsoft/tsdoc` 0.16.0 parser reports `tsdoc-reference-missing-identifier` for this form.
The documentation also says the notation is not finalized, so confirm the specification before classifying this as a parser defect.

1. Check the current specification, documentation examples, and linked declaration-reference discussion to confirm whether unnamed label selectors are supported or still proposed.
2. Reproduce the behavior with a standalone `new TSDocParser().parseString("/** {@link Interface.(:CALL)} */")` call on both 0.16.0 and the latest published TSDoc version. Record versions, diagnostics, and parsed output without changing this project's dependency merely to prepare the report.
3. Check [existing TSDoc issues](https://github.com/microsoft/tsdoc/issues). If the specification supports the syntax and the current parser rejects it, file a parser bug or add the reproduction to an existing issue. Include the specification reference, minimal input, expected parse, and actual diagnostic.
4. If the example describes proposed or obsolete syntax instead, record that finding and request clarification or a documentation correction where appropriate. Do not label it a confirmed parser bug.
5. Link the upstream outcome to the [parser-capability regression](../src/analysis/test/documentation.test.ts) and the [Stage 2 conformance notes](api-extractor-replacement-implementation-plan.md#remaining-stage-2-decisions).

Acceptance: record the verified specification status and an upstream issue link, or the evidence that no parser bug should be filed.
No external issue has been filed as part of adding this task.
Reporting the mismatch does not itself implement unnamed-target resolution or establish full conformance.

## Broader automatic documentation matching

Status: future investigation, after the remaining library implementation.
Current matching copies documentation only from a uniquely proven compatible non-overloaded source.
Keep ambiguous, merged, accessor, or parameter-adaptation cases undocumented when compatibility is not established.

- Investigate original-scope matching for merged members and accessors without relying on printed type text.
- Cover recursive instantiated ancestry and competing class/interface sources without assuming declaration order is precedence.
- Specify safe parameter and type-parameter adaptation before copying comments across renamed or destructured parameters.
- Consider target-less `@inheritDoc` only when one source can be established without guessing; keep explicit request errors distinct from absent automatic documentation.

Acceptance: any expanded behavior has compiler-backed positive and negative tests and preserves release classification, local-comment suppression, and source provenance.
This does not reopen the explicit numeric and label selection already implemented for overloaded targets.

## Consider module-based documentation references

Status: open investigation; explicitly deferred from Stage 2 by the 2026-09-20 decision.
Current analysis must reject whole-module targets and import paths without a package name in TSDoc links and inheritance requests, including package comments and nested symbol references.

Examples currently forbidden are `{@link my-package#}`, `{@link my-package/widgets#}`, `{@link ./widgets#Widget}`, and `{@link ./widgets#}`.
Named package exports such as `{@link my-package#Widget}` and `{@link my-package/widgets#Widget}` remain supported under existing suite and visibility rules.
This restriction does not affect TypeScript imports or links through named namespaces.

- Evaluate whether module-level documentation destinations or source-relative API links provide sufficient value to add support.
- Define module-target identities without inventing API release metadata. Keep the single package-owned `@packageDocumentation` comment independent from entrypoints.
- Resolve relative paths from the original comment's source file using the compiler's resolution settings, retaining that scope through re-exports and inheritance.
- Specify applicable suite boundaries, diagnostics, and portable model data before changing the rejection behavior.
- Cover local and dependency-model references, module and named targets, nested symbol keys, missing paths, re-exports, and existing named package links.

Outcome: record a support recommendation and its compatibility requirements.
This investigation does not commit to implementation, block Stage 2 closure, or waive the requirement to reject these forms today.

## Support user TSDoc configuration files

Status: open; future migration work. No file-loading support is implemented by this item.

Support an optional user-supplied `tsdoc.json` as a source of custom tag definitions and other applicable TSDoc settings.
This should reduce configuration changes when migrating from API Extractor.
Preserve direct programmatic configuration as a supported alternative; callers must not need a configuration file.

- Evaluate the official `@microsoft/tsdoc-config` loader before implementing custom loading or inheritance logic. Review its maintenance and license before adding a dependency.
- Keep file loading and path resolution at an explicit I/O boundary. Pass resolved settings into classification and documentation processing without hidden filesystem access.
- Specify explicit path handling, inherited configuration resolution, and whether configuration discovery is supported.
- Define precedence when file-based and programmatic settings are combined. Document duplicate or conflicting tag definitions and settings that the analyzer does not support.
- Cover custom modifier, block, and inline tag definitions, supported-tag settings, and inherited configurations. Recognizing a tag's syntax must not imply that the analyzer implements its semantics.
- Report missing, malformed, incompatible, or unresolvable configuration with actionable diagnostics that identify the affected file.
- Track loaded configuration files and their inherited dependencies as invalidation inputs when automatic dependency tracking is implemented.

Acceptance: equivalent file-based and programmatic settings produce equivalent classification and parser diagnostics.
Tests cover inherited configurations, relative paths, precedence, invalid inputs, and changes to inherited configuration.
Include a representative API Extractor migration fixture that reuses its existing TSDoc configuration.
Direct programmatic use remains available without filesystem access.

## Configurable documentation inheritance rules

Status: open; future investigation. No configurable inheritance rules are implemented or committed by this item.

Evaluate whether consumers need configuration beyond the fixed [documentation inheritance rules](../README.md#explicit-documentation-inheritance-contract).
Keep the current rules as the default while evaluating use cases and compatibility with TSDoc and API Extractor.

- Consider which documentation sections can be inherited, including blocks that currently remain local, such as examples and deprecation notices.
- Consider local-content precedence and the planned rule that any local TSDoc comment suppresses automatic inheritance. Distinguish explicit requests from automatic inheritance.
- Keep content inheritance separate from release classification, API selection, and reference validation. Configuration must not implicitly change API visibility or bypass link policy.
- Define deterministic behavior for conflicting settings, inheritance chains, and package boundaries before implementing options.
- Assess effects on report documentation status, annotation tags, provenance, and future documentation models. Identify the tests and snapshots needed for each supported option.

Outcome: record whether configuration is justified and which rules, if any, should become configurable.
This investigation does not defer the required automatic-inheritance or suite-resolution work in the implementation plan.

## Required package documentation support

Status: single-package ownership, extraction, validation, link resolution, model retention, and report output are implemented for the supported reference forms.

The agreed contract is one package-owned comment, separate from all entrypoints.
Extraction scans package-owned compiler inputs and excludes the comment from API-item metadata.
Missing documentation is allowed unless `rules.requirePackageDocumentation` is enabled.
Duplicates, misplaced tags, malformed comments, and API-only parameter, return, release, or inheritance tags are diagnosed.
Facts and dependency models retain the original comment and location; all entrypoint reports render that same comment when present.
TS6/TS7 emission tests, absent and multi-entrypoint tests, a report snapshot, and suite ownership/freshness tests cover these paths.
No missing-comment annotation is emitted.

API declaration links retain original-scope lookup, selected overload identities, and local or selected-dependency targets.
The package remains outside API-item classification.
The approved package-link rule permits non-internal targets and rejects internal targets, like ordinary non-internal API documentation.
Unclassified targets remain invalid because their visibility cannot be established.
There is no package-specific visibility override.
URL links are supported without network validation.
Complete portable documentation models remain part of Stage 3.

## Configurable report presentation

Status: open; schedule after the default report format achieves rough API Extractor parity.

Make it easy for users to customize report formats without reimplementing API analysis, classification, selection, or validation.
Preserve the API Extractor-like format as the default presentation.

- Define a supported customization contract over detached report data. Evaluate presentation options and custom renderers before choosing an extension mechanism.
- Keep presentation separate from semantic policy. Changing a format must not change selected APIs, tag recognition, or validation behavior.
- Reuse analysis and report data across formats without new compiler queries or mutation of shared inputs.
- Document deterministic output requirements and the effect of presentation changes on review baselines. Custom rendering must not implicitly accept or update baselines.
- Use checked-in full-report snapshots to verify the default format and representative custom formats.

Acceptance: a consumer can produce the default report and a custom presentation from the same detached report data without repeating analysis.
Tests verify unchanged input data, deterministic output, and independent baseline checks and updates.

This follow-up does not defer the agreed initial options for displayed tags or undocumented-item annotations.
Release tags appear by default; other displayed tags are configurable. Undocumented-item annotations are independently configurable and default to enabled.

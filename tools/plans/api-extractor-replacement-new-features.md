# API tooling replacement: new capabilities and regression coverage

## Purpose

This document tracks API Extractor defects that the replacement library must handle correctly.
It supplements the [workflow requirements](api-extractor-replacement-requirements.md).
The entries define required outcomes, not implementation techniques or output syntax.
References to `bundledPackages` describe the upstream reproductions; they do not require an equivalent configuration setting.

## Verification status

All entries below are pending implementation and regression tests in the replacement library.
The linked issue descriptions were inspected, but their reproductions have not been run as part of this requirements work.
Upstream issue closure does not establish that the replacement handles the case correctly.
Before closing an entry, link its passing regression tests and verify the applicable behavior with both TypeScript 6 and TypeScript 7.

## Required regression coverage

### B1. Preserve dependency export aliases

Source: [Rushstack #5920: Export aliases lost with `bundledPackages`](https://github.com/microsoft/rushstack/issues/5920).

Reported defect: Analysis follows a dependency's exported alias to its source declaration, then uses the source name in reports, models, and declaration roll-ups.
This also produces a false forgotten-export diagnostic when the consumer references the alias without re-exporting it.

Required result: Preserve the dependency's exported name and reference identity without requiring an unnecessary consumer re-export.

Regression check: Export a dependency type under an alias and reference it from a consuming API while including the dependency in analysis.
Verify correct names and references in reports, models, and generated declarations, with no false forgotten-export diagnostic.
Cover consumers with and without an explicit re-export of the alias.

Related requirements: W1, W2, W4, W5, W7.

### B2. Distinguish type-only exports in review output

Source: [Rushstack #4771: API report does not indicate if a class was type exported](https://github.com/microsoft/rushstack/issues/4771).

Reported defect: Changing a class export to a type-only export does not change its API report, despite removing consumer access to the class value.

Required result: Review output must distinguish type-only exports from exports that expose a value.
The distinction must follow the export path, not only the underlying declaration kind.

Regression check: Compare ordinary and type-only re-exports of the same class.
Verify that switching between them produces a review difference and that each entrypoint retains its own export semantics.
Include other declarations for which type-only export changes consumer access, such as enums, functions, and constants.

Related requirements: W1, W4.

### B3. Diagnose documentation references to internal APIs

Source: [Rushstack #5172: TSDoc references from non-internal API exports to internal exports do not error](https://github.com/microsoft/rushstack/issues/5172).

Reported defect: A non-internal API can link to or inherit documentation from an internal API without a diagnostic, although API Extractor omits the target from its documentation model.

Required result: Under the configured repository policy, diagnose both `@link` and `@inheritDoc` references from non-internal APIs to internal APIs.
Resolving a target during analysis must not bypass the policy check.
The replacement need not reproduce API Extractor's unconditional exclusion of internal APIs from documentation models.

Regression check: Exercise both reference forms and verify that diagnostics identify the referring API, target, and violated policy.
Also verify that a permitted public-to-beta documentation reference resolves in the documentation scope, even when the public review surface omits its target.

Related requirements: W3, W7, W10.

### B4. Remove imports used only by excluded APIs

Source: [Rushstack #4861: Imports are not correctly trimmed in roll-ups or report variants](https://github.com/microsoft/rushstack/issues/4861).

Reported defect: Filtered reports and declaration roll-ups retain imports used only by excluded declarations.
Changes to those imports cause unrelated review differences.

Required result: Generated declarations must omit imports needed only by excluded APIs while retaining imports needed by the selected declarations.
Review output must not change solely because an import used only by an excluded API changes.
This does not require reports to contain import statements or to omit all import information.

Regression check: Use distinct imported types in public and beta APIs, then generate complete and public-only outputs.
Change an import used only by the beta API and verify that the public report remains unchanged.
Verify that the public declarations omit that unused import and still compile, including when an import is shared by retained and excluded APIs.

Related requirements: W1, W4, W5.

### B5. Preserve re-exported module namespaces

Source: [Rushstack #4807: Re-exported import namespaces produce malformed declaration roll-ups with `bundledPackages`](https://github.com/microsoft/rushstack/issues/4807).

Reported defect: Re-exporting a dependency's module namespace while including its declarations produces malformed namespace syntax and missing member declarations or references.

Required result: Generated declarations must preserve valid namespace exports and their members across package boundaries.
Namespace members must retain their type and value meanings.

Regression check: Export a module namespace containing a class, interface, and constant, then re-export it from a consuming package.
Generate declarations with the dependency included and with it retained as an external reference.
Verify that both outputs compile and that consumer code can access the intended namespace members.
Include a dependency declaration input with an export list inside a namespace, as in the reported generated output.

Related requirements: W4, W5.

### B6. Filter exports that shadow built-ins correctly

Source: [Rushstack #4762: Exports which shadow built-ins are included in incorrect report variants](https://github.com/microsoft/rushstack/issues/4762).

Reported defect: An export alias introduced to avoid a built-in name collision remains in report variants that exclude its declaration.
The issue's follow-up reproduction reports this defect in reports, not trimmed declaration roll-ups.

Required result: Surface selection must apply to the exported API even when output generation renames its declaration to avoid a collision.
An excluded API must not leave an alias export in the selected report.

Regression check: Export an internal API named `performance` and generate complete and public-only reports.
Verify that the complete report preserves the intended export name and that the public report contains neither the internal declaration nor an alias exporting it.
Repeat with an included release level to verify that collision handling does not remove a valid export.

Related requirements: W1, W4.

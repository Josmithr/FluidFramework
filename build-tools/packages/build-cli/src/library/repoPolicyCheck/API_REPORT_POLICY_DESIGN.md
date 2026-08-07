# API Report Coverage Policy Design

## Status

Proposed. This document is intended for design review before implementation.

## Summary

Add a repository policy-check handler that ensures every generated release-level TypeScript entrypoint rollup has a corresponding configured and checked-in API report.

The invariants are:

```text
package.private !== true ⇒ API report tasks and configuration exist
release levels referenced by package declaration metadata ⊆ configured API report levels with checked-in report files
configured API report levels with checked-in report files ⊆ release levels referenced by package declaration metadata
```

The missing-report direction is the implementation priority. Extraneous configured variants and report files should also be diagnosed, but may be delivered as a follow-up phase if implementing both directions together would delay missing-report enforcement.

The policy should derive required release levels independently from API Extractor report configuration. This is necessary because the defect being prevented is adding an entrypoint rollup without updating report configuration.

The policy should not require a build. When invoked with `--fix`, it should update package-owned API Extractor report configurations when the correct target is unambiguous, but it should not generate or modify API report Markdown files.

## Motivation

Fluid packages can expose separate declaration rollups for current and legacy API release levels, including public, beta, and alpha. API Extractor reports are used to review changes to those surfaces.

A developer can add a new beta or alpha entrypoint to a package without adding the matching report variant. Existing API report CI tasks will continue to pass because API Extractor only checks variants present in its configuration. The newly exposed surface would therefore lack a checked-in review artifact.

Policy-check already enforces repository-wide package invariants and is the appropriate place to detect this configuration gap early.

## Goals

- Require a corresponding API report for every generated release-level entrypoint rollup.
- Require every package not marked `private` to participate in API report generation.
- Detect a missing report even when the report config was not updated.
- Detect configured report variants and checked-in report files that have no matching declaration rollup, with missing-report detection taking priority.
- Verify that the expected report is both configured and checked in.
- Support current and legacy release levels.
- Discover published declaration rollups from the package's `exports` or `types`/`typings` metadata rather than its build scripts.
- Support declaration rollups emitted by standard, TypeScript, or custom generation.
- Support multiple declaration channels in one package, such as the browser and Node entrypoints in `@fluid-internal/client-utils`.
- Support inherited API Extractor configuration and custom report filenames.
- Add missing report variants to package-owned leaf configs through `policy-check --fix` when the target is unambiguous.
- Run successfully in a clean checkout before declaration output exists.
- Produce a diagnostic that tells the developer what to update and which command to run.

## Non-goals

- Generating API reports from policy-check.
- Automatically creating a new report-config family when none exists or choosing between ambiguous config targets.
- Editing shared API Extractor base configs as a fix for one package.
- Validating API report content. API Extractor CI tasks already do that.
- Replacing existing policies that validate API lint scripts or package exports.

## Proposed Policy

Add a dedicated package policy handler:

```text
npm-package-api-reports-match-entrypoints
```

Suggested files:

```text
build-tools/packages/build-cli/src/library/repoPolicyCheck/apiReports.ts
build-tools/packages/build-cli/src/test/library/repoPolicyCheck/apiReports.test.ts
```

Register the handler in `repoPolicyCheck/index.ts`.

A dedicated module is preferable to adding more logic to `npmPackages.ts` because:

- Entry point discovery and report configuration resolution are independently testable concerns.
- The existing `npm-package-exports-apis-linted` policy validates API lint configuration, not generated review artifacts.
- The package policy test suite currently has little coverage, so exported pure helpers in a focused module will be easier to test.

Static API Extractor config resolution should be implemented as a shared build-cli utility rather than embedded in the policy module. The policy remains its first consumer, but inheritance, token handling, and effective API report settings are general API Extractor concerns and should not need to be reimplemented by future commands or policies.

## Policy Scope

The handler matches `package.json` files.

A package is in scope when its `package.json` does not set `private` to `true`. This matches npm's publication semantics: an omitted or false `private` field means the package is publishable.

Every in-scope package must have API report configuration and direct report tasks. A package without direct `ci:build:api-reports:*` API Extractor commands fails the policy. The diagnostic should direct the developer to either configure API reports or mark the package `private` when it is not intended to be published.

Packages marked `private: true` are ignored, even if they happen to have API report scripts. A separate policy could validate voluntarily generated reports for private packages if that becomes useful.

After scope is established, use direct leaf CI scripts rather than the aggregate `ci:build:api-reports` script. This avoids parsing `concurrently` or npm script expansion.

## Terminology

The policy uses these release-level identifiers internally:

```ts
type ReportLevel =
    | "current.public"
    | "current.beta"
    | "current.alpha"
    | "legacy.public"
    | "legacy.beta"
    | "legacy.alpha";
```

These identifiers distinguish current and legacy report families while retaining API Extractor's `public`, `beta`, and `alpha` report variants.

## Discovering Required Entrypoint Levels

Required levels must be derived without consulting `apiReport.reportVariants`.

### Declaration metadata source

Use the declaration files referenced by the package's published metadata as the source of truth. Build scripts are implementation details and should not participate in discovery.

Treat `exports` and top-level `types`/`typings` as mutually exclusive discovery modes:

- If `exports` is present, inspect declaration targets under `types` conditions in `exports` and ignore top-level `types`/`typings` for this policy.
- Otherwise, inspect the top-level `types` or `typings` target.
- If both `types` and `typings` are present without `exports`, fail because the declaration source is ambiguous.

This is discovery precedence rather than a new manifest-shape restriction. The current repository commonly retains a top-level `types` field alongside `exports` for compatibility, so literal mutual exclusivity between those properties cannot be required without a separate migration.

Use the existing `queryTypesResolutionPathsFromPackageExports()` helper to traverse nested export conditions. Its `mapTypesPathToExportPaths` result provides each referenced declaration target and the export paths and conditions that expose it. Request all declaration targets with a pattern that accepts `.d.ts`, `.d.mts`, and `.d.cts` files, and deduplicate ESM/CommonJS references to the same target.

Do not require the referenced declaration files to exist. The package manifest is sufficient for this policy, allowing it to run before a build.

### Declaration filename classification

Classify release levels from the referenced declaration filename, independent of its directory and package export path. Match the final filename tokens so prefixes and nested output directories remain supported.

| Declaration filename form | Report level |
| --- | --- |
| `public.d.ts` or `*.public.d.ts` | `current.public` |
| `beta.d.ts` or `*.beta.d.ts` | `current.beta` |
| `alpha.d.ts` or `*.alpha.d.ts` | `current.alpha` |
| `legacy.public.d.ts` or `legacyPublic.d.ts` | `legacy.public` |
| `legacy.d.ts` or `*.legacy.d.ts` | `legacy.beta` |
| `legacy.beta.d.ts` or `legacyBeta.d.ts` | `legacy.beta` |
| `legacy.alpha.d.ts` or `legacyAlpha.d.ts` | `legacy.alpha` |

Apply the same classification to `.d.mts` and `.d.cts` suffixes.

Check legacy forms before current forms so `legacy.alpha.d.ts` is not misclassified as current alpha. The unqualified `legacy.d.ts` maps to legacy beta, matching the repository's established compatibility convention.

Prefixed filenames preserve channel information for config association while mapping to the same release level. For example:

```text
client-utils.browser.alpha.d.ts -> current.alpha, channel "client-utils.browser"
client-utils.node.alpha.d.ts    -> current.alpha, channel "client-utils.node"
```

### Public fallback

Some published packages expose a single declaration named `index.d.ts` or another domain-specific name rather than `public.d.ts`.

- In `types`/`typings` mode, classify the referenced declaration as `current.public` regardless of its filename.
- In `exports` mode, first classify every referenced declaration with the filename rules above.
- If at least one declaration has an explicit release-level filename, use only explicitly classified declarations. This prevents ordinary runtime declarations such as Client Utils' `indexBrowser.d.ts` from creating an unintended public report requirement.
- If no declaration has an explicit release-level filename, classify the declaration referenced by the root `.` export as `current.public`.

Ignore unclassified declarations associated only with non-root exports, such as internal, test, or feature-specific subpaths.

If no reportable TypeScript entrypoint can be discovered, fail with a targeted diagnostic. A non-private package must either expose a typed API surface that can be reported or be explicitly marked private. The policy should not silently exempt publishable packages because their API shape is unclear.

## Discovering Report Configurations

For every in-scope package, require direct `ci:build:api-reports:*` scripts. Obtain each API Extractor command's `--config` argument using the existing `getApiExtractorConfigFilePath()` helper.

Missing report scripts are a policy failure, not a scope exclusion. The aggregate `ci:build:api-reports` script should also be required to ensure the leaf tasks participate in the standard build, but leaf commands remain the source of config metadata.

Classify a report command as legacy when its script name contains a `legacy` segment. Other report commands are current. Script names may contain additional channel segments, such as `browser` or `node`.

For each config, statically resolve its JSON5 `extends` chain and merge only the API report properties needed by this policy:

- `apiReport.enabled`
- `apiReport.reportFolder`
- `apiReport.reportFileName`
- `apiReport.reportVariants`

Resolution must support:

- Config-relative `extends` paths.
- `<projectFolder>` substitution.
- `<unscopedPackageName>` substitution.
- Leaf properties overriding inherited properties.

Do not use `ExtractorConfig.loadFileAndPrepare()`. That API validates `mainEntryPointFilePath` and can fail before `lib/` or `dist/` has been built. Policy-check must be independent of generated declaration files.

If an `extends` target cannot be read or parsed, return a policy error identifying the config and the resolution failure.

## Mapping Levels to Report Files

For each current or legacy report config, compute its effective report base name and folder.

The default repository settings are:

```text
reportFolder: <projectFolder>/api-report/
current reportFileName: <unscopedPackageName>
legacy reportFileName: <unscopedPackageName>.legacy
```

API Extractor inserts the variant before `.api.md`. Normalize either a bare base name or a base ending in `.api.md`:

```ts
function getReportFileName(baseName: string, variant: ReportVariant): string {
    const base = baseName.replace(/\.api\.md$/, "");
    return `${base}.${variant}.api.md`;
}
```

This supports the custom `experimental-<unscopedPackageName>.api.md` setting without a package-specific policy exception.

Multiple configs may map to the same output file. Browser and Node Client Utils reports intentionally do this. Expected paths should therefore be deduplicated.

## Validation Algorithm

For each in-scope package:

1. Derive the required `ReportLevel` set independently from entrypoint generation.
2. Verify the aggregate and direct CI report scripts exist.
3. Discover and statically resolve current and legacy report configs.
4. For each required declaration channel and level:
    1. Find its associated config in the corresponding current or legacy family.
    2. Verify the config's effective `reportVariants` includes the required variant.
    3. Compute the expected report file path.
5. Deduplicate identical expected report paths, then verify every distinct `.api.md` file exists.
6. Compare configured variants and checked-in report files against required levels and diagnose extraneous coverage.
7. Return one aggregated diagnostic containing every missing or extraneous script, config family, config variant, or report file.

The configured-variant check is intentionally included in addition to file existence. A stale checked-in report file must not satisfy the policy if API Extractor is no longer configured to regenerate it.

Pseudocode:

```ts
const requiredEntrypoints = getRequiredReportEntrypoints(packageJson);
const reportConfigs = await getReportConfigMetadata(packageJson, packageDirectory);
const failures: ReportCoverageFailure[] = [];

for (const entrypoint of requiredEntrypoints) {
    const { channel, level } = entrypoint;
    const family = level.startsWith("legacy.") ? "legacy" : "current";
    const variant = getVariant(level);
    const configs = reportConfigs.filter(
        (config) => config.family === family && configMatchesChannel(config, channel),
    );

    if (configs.length === 0) {
        failures.push({ kind: "missing-config-family", level });
        continue;
    }

    const coveringConfigs = configs.filter((config) =>
        config.reportVariants.includes(variant),
    );

    if (coveringConfigs.length === 0) {
        failures.push({ kind: "missing-config-variant", level, configs });
        continue;
    }

    const expectedFiles = coveringConfigs.map((config) =>
        getExpectedReportPath(config, variant),
    );

    if ([...new Set(expectedFiles)].some((file) => !existsSync(file))) {
        failures.push({ kind: "missing-report-file", level, expectedFiles });
    }
}

failures.push(...findExtraneousReportCoverage(requiredEntrypoints, reportConfigs));
```

Channel matching prevents one channel's config from accidentally satisfying another channel's declaration rollup. For example, Client Utils has separate browser-alpha and node-alpha declarations and configs. Both configs intentionally produce the same alpha report, so the policy validates both config associations and then deduplicates their identical report path. If future channel configs produce different report paths, every distinct report file is required.

Extraneous coverage has two forms:

- A configured report variant has no matching declaration channel and level.
- A checked-in `.api.md` file in a package's effective report folder is not an expected output of any required configured variant.

The first form is authoritative and should be implemented first. File-only detection must be constrained to effective report folders and recognized report filename patterns so unrelated Markdown is never flagged. Diagnostics for extraneous coverage should recommend removing the obsolete variant from the package-owned leaf config and deleting the stale generated report; `--fix` should not perform either removal because report deletion is destructive and may reveal ambiguous shared-config ownership.

## Diagnostics

Diagnostics should identify:

- Package name.
- Missing aggregate or leaf report scripts.
- Missing current or legacy release level.
- Relevant report config paths.
- Expected report file paths.
- The package-local report generation command.

Example:

```text
@fluidframework/example references a current beta declaration rollup, but its API report is incomplete.

Missing config coverage:
  api-extractor/api-extractor-report.current.json does not include the "beta" report variant

Expected report:
  api-report/example.beta.api.md

Add "beta" to apiReport.reportVariants and run:
  pnpm --dir packages/example run build:api-reports
```

If configuration covers the level but the report file is absent, omit the configuration instruction and report only the missing file and generation command.

## Fix Behavior

Provide a `resolver` that updates package-owned API Extractor leaf configurations when it can determine the target safely.

For each missing configured variant, the resolver should:

1. Select report configs in the matching current or legacy family.
2. Associate configs with the declaration channel derived from the referenced `.d.ts` filename when prefixes distinguish channels such as browser and Node.
3. Update every distinct leaf config that generates the required level and produces a distinct report output.
4. If multiple configs converge on the same report output, update all relevant leaf configs so each command remains internally consistent.
5. Add the variant to the leaf config's local `apiReport.reportVariants` array, preserving the standard order `public`, `beta`, `alpha`.
6. If the leaf inherits `reportVariants` without declaring them, materialize an explicit array in the leaf containing the inherited variants plus the missing variant.

The resolver must edit only configs located within the package directory. It must never modify a shared config in `common/build/build-common`, even when the missing behavior is inherited from that config.

Config edits should preserve JSON5 comments and surrounding formatting. Prefer a targeted JSON5-aware text edit over parsing and rewriting the entire document. The resolver should fail without changing files when it cannot identify a unique safe edit, including when:

- The required current or legacy config family does not exist.
- A report command's config cannot be resolved.
- Multiple candidate configs cannot be associated with the referenced declaration channel.
- The selected leaf config is outside the package directory.
- The existing `apiReport` shape cannot be updated without a broad rewrite.

After updating config files, return `resolved: false` with an instructional message when the expected `.api.md` file is still absent. This keeps `policy-check --fix` failing until the developer builds declarations, runs local API report generation, and reviews the generated report. If the report file already exists as a stale artifact, the resolver may return `resolved: true` after confirming the updated effective config covers the required variant.

Policy-check should not automatically:

- Build declaration files.
- Invoke API Extractor in local mode.
- Create or accept API report content.

API reports are review artifacts. Their creation can expose significant API changes and should remain an explicit developer action. After fixing configuration, the diagnostic should provide the appropriate package-local report command.

## Error Handling

The policy should fail with a targeted diagnostic when:

- `package.json` cannot be parsed.
- An in-scope package has no discoverable reportable TypeScript entrypoint.
- An in-scope package has no aggregate or direct CI report scripts.
- A direct report command does not provide a usable config path.
- A config file does not exist.
- JSON5 parsing fails.
- An `extends` target cannot be resolved.
- `apiReport.enabled` is false for a required report family.
- A required family has no report config.
- A required variant is not configured.
- A required report file is absent.

The policy should not read or validate `mainEntryPointFilePath`, since declarations may not exist yet.

## Performance

The handler runs once per matching `package.json`.

Expected work per package is small:

- Parse one package manifest.
- Traverse a small `exports` object or inspect one top-level declaration target.
- Resolve one or two short config inheritance chains.
- Perform several file existence checks.

Cache statically resolved shared configs by absolute path because most packages extend the same files in `common/build/build-common`. Cache entries should contain unresolved tokenized values, with project-specific token substitution applied after retrieval.

No subprocesses or TypeScript builds are required.

## Tests

Add focused unit tests using temporary package directories and small JSON5 fixtures.

### Entrypoint discovery

- Top-level `types` without `exports` requires current public regardless of filename.
- Top-level `typings` without `exports` requires current public.
- `exports` takes precedence when top-level `types` is also present.
- Both top-level `types` and `typings` without `exports` fail as ambiguous.
- Nested `types` conditions in `exports` are traversed.
- ESM and CommonJS references to the same declaration are deduplicated.
- `public.d.ts`, `beta.d.ts`, and `alpha.d.ts` map to current levels.
- Prefixed forms such as `example.alpha.d.ts` map to current levels.
- `legacy.d.ts`, `legacy.beta.d.ts`, and `legacyBeta.d.ts` map to legacy beta.
- `legacy.public.d.ts` and `legacyPublic.d.ts` map to legacy public.
- `legacy.alpha.d.ts` and `legacyAlpha.d.ts` map to legacy alpha.
- `.d.mts` and `.d.cts` suffixes are supported.
- Legacy filename forms are not misclassified as current levels.
- Multiple browser and Node declaration channels are combined.
- If explicit release-level filenames exist, unclassified runtime declarations are ignored.
- If no explicit release-level filename exists, the root export's declaration maps to current public.
- Unclassified declarations under internal, test, and feature subpaths are ignored.
- Missing reportable declaration metadata fails.

### Config resolution

- Config-relative inheritance works.
- `<projectFolder>` inheritance works.
- Leaf `reportVariants` override inherited variants.
- Current and legacy config families are separated.
- Bare and `.api.md` report base names are normalized.
- `<unscopedPackageName>` is substituted.
- Custom report filenames are supported.
- Duplicate output paths are deduplicated.
- Missing and malformed config files produce useful errors.
- Resolution succeeds when `lib/` and `dist/` do not exist.

### Handler behavior

- Required variant configured and file present passes.
- Entrypoint exists but variant is absent fails.
- Variant is configured but file is absent fails.
- A stale file does not pass when the variant is absent from config.
- A configured variant with no corresponding declaration level fails as extraneous.
- A recognized report file with no corresponding required configured output fails as extraneous.
- Missing current or legacy config family fails.
- Multiple distinct channel outputs must all exist.
- Multiple channels converging on one output pass with one file.
- Non-private package without direct report tasks fails.
- Non-private package without a discoverable typed entrypoint fails with guidance to configure its API surface or mark it private.
- Package with `types` or `typings` but no `exports` field requires a current public report.
- Private package is ignored regardless of report scripts.

### Resolver behavior

- Adds a missing variant to an existing local `reportVariants` array.
- Materializes a local override when variants are inherited.
- Preserves `public`, `beta`, `alpha` ordering.
- Preserves JSON5 comments and unrelated formatting.
- Updates all relevant browser and Node leaf configs when they converge on one report output.
- Does not modify shared base configs.
- Refuses to choose between ambiguous config targets.
- Refuses to create a missing current or legacy config family.
- Returns unresolved after a config fix when the expected report file is absent.
- Returns resolved after a config fix when a matching checked-in report already exists.

### Repository baseline

Add an integration-style test or validation command that runs only this handler across the repository:

```text
pnpm flub check policy --handler npm-package-api-reports-match-entrypoints
```

At the time of this design, the workspace contains 100 non-private packages. Of those, 87 have direct API report tasks and 13 do not. Ten do not expose reportable declaration metadata under the rules above. These groups overlap: 15 distinct packages require remediation by adding report support, publishing an explicit declaration target, or being marked private. The 87 non-private report-producing packages currently use 136 report configs and produce 164 distinct report artifacts.

## Proposed Implementation Sequence

1. Add pure helpers that collect declaration targets from `exports` or `types`/`typings` metadata.
2. Add declaration-filename classification and channel extraction.
3. Add shared static JSON5 API Extractor config inheritance resolution outside the policy module.
4. Add report path computation and missing-coverage validation.
5. Add targeted JSON5 leaf-config editing and safe target selection.
6. Add the package policy handler and resolver, then register them.
7. Add unit tests for metadata precedence, filename classification, custom channels, and resolver cases.
8. Add authoritative extraneous-config-variant validation.
9. Add conservative stale-report-file validation, either in the initial implementation or as a follow-up phase.
10. Run the targeted policy against the repository in check and fix modes.
11. Run build-cli tests, Biome, and the repository-wide policy check.

## Resolved Decisions

- Coverage is bidirectional, but missing reports take implementation priority over extraneous reports.
- Every declaration channel must have an associated config. Identical final report paths across channels are deduplicated; distinct paths must all exist.
- Static API Extractor config resolution will be a shared build-cli utility rather than policy-local code.

No design questions currently block implementation.

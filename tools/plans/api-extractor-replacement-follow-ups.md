# API tooling replacement: follow-up tracker

## Purpose

Track deferred investigations and improvements separately from the [implementation plan](api-extractor-replacement-implementation-plan.md).
These items do not define delivery-stage exit criteria. Schedule them separately from the remaining plan work unless a required capability depends on them.
The plan retains required capability gates, acceptance criteria, and implementation blockers.
Moving an item here does not waive those requirements or mark an unresolved capability as supported.

## Upstream TypeScript reports

Status: open; follow-up to the [Stage 0 findings](../api-analyzer/README.md#stage-0-results).

- Create a minimal standalone reproduction of the async native-process termination issue. Show that the pending request does not reject as expected.
- Create minimal reproductions for other suspected TypeScript defects encountered during this project. Remove repository-specific dependencies and unrelated behavior.
- Record the compiler version, Node.js version, operating system, reproduction command, and expected and actual results. Retest against the latest published tooling without changing the project's pinned dependency merely to prepare a report.
- Check existing upstream issues before filing. Add evidence to an applicable report or file a new TypeScript bug when appropriate. Distinguish missing API capabilities from implementation defects.
- Link upstream reports to the local regression tests and findings. Keep unresolved cases visible and verify fixes before closing them locally.

No upstream bug has been filed as part of this tracked follow-up.
The declaration-generation capability gate remains in the implementation plan. Deferring upstream reporting does not resolve that gate.

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

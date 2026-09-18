---
description: "Required completion checklist for api-analyzer coding tasks."
applyTo: "tools/api-analyzer/**"
---

# Task Completion Checklist

Before declaring any coding task complete, review every checklist item.
Complete applicable checks and disclose anything skipped, blocked, or unverified.

Follow the [Development contract section of the implementation plan](../../tools/api-analyzer/docs/api-extractor-replacement-implementation-plan.md) for detailed procedures.
Use this checklist for each task; do not persist completion marks in this instruction file.

- [ ] Audit new and modified code against the [coding guidelines](../../docs/content/Guidelines/Coding-Guidelines.md), including tests and configuration.
	Check naming, types, assertions, error handling, and consistency with nearby code.
- [ ] Review long or complex functions for distinct responsibilities and extract semantically meaningful helpers where needed.
	Keep inputs, outputs, and side effects clear; avoid arbitrary line limits or splitting code only to shorten functions.
- [ ] Review functional programming practices and the [Functional boundaries section of the architecture proposal](../../tools/api-analyzer/docs/Architecture-Proposal.md).
	Prefer pure transformations and immutable shared data, pass dependencies explicitly, and keep I/O at designated boundaries.
	Keep necessary mutation local to the invocation; avoid unnecessary copying or abstractions.
- [ ] Ensure documentation matches the code changes.
	Review affected API comments, inline comments, examples, README content, plans, and stated limitations.
	Distinguish implemented behavior from planned work and update references affected by renames or moves.
- [ ] Audit new and modified documentation against the [documentation guidelines](../../docs/content/Guidelines/Documentation-Guidelines.md) and their applicable linked guides.
	Check clear wording, useful explanations of non-obvious logic, multiline TSDoc, accurate contracts, and optional-value omission semantics.
	Introduce examples with explanatory text; validate changed TSDoc with the official parser, type-check applicable examples, and check links.
- [ ] Review regression coverage for the changed behavior, including relevant edge cases and failure paths.
	Do not treat passing existing tests as proof that new behavior is covered.
	For defects, confirm that the regression test fails for the intended reason before applying the fix.
- [ ] Review TODOs, known limitations, and follow-up items affected by the changes.
	Remove completed items, update changed constraints, and record actionable remaining work in the appropriate tracker or nearby code.
	Do not defer required work through a TODO or describe unverified capabilities as complete.
- [ ] Run the applicable verification checks and resolve failures caused by the changes.
	For code changes, run `pnpm build`, then `pnpm test`, `pnpm lint`, and `pnpm check:format` from `tools/api-analyzer`; lint includes the architecture checks.
	Check editor diagnostics and run `git diff --check`.
	For documentation-only tasks, use relevant documentation checks instead of unrelated code tests.
	Report the checks performed and any known pending tests, pre-existing failures, or skipped checks; do not describe unverified gates as passing.
- [ ] Review the final diff for unintended or unrelated changes and confirm that existing user edits are preserved.
	Review snapshot and generated-artifact changes against the intended behavior and supporting semantic assertions.
	Do not accept snapshots solely because they match current output or update baselines automatically to make tests pass.

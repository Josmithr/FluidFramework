# Jest Test Migration Plan

This checklist tracks the removal of Jest from the Fluid Framework repository. Migrate each test to Mocha with jsdom or to Playwright according to the runtime behavior that the test verifies.

## Goals

- [x] Preserve the behavior covered by the current Jest tests.
- [x] Use Mocha for Node.js and jsdom component tests.
- [x] Use Playwright only when a test requires a real browser.
- [x] Remove all Jest test scripts, configuration, dependencies, and root orchestration.
- [x] Keep each package migration independently buildable and testable.

## Current Scope

- [x] Migrate `@fluidframework/common-utils` in `common/lib/common-utils`.
- [x] Migrate `@fluid-example/app-insights-logger` in `examples/client-logger/app-insights-logger`.
- [x] Migrate `@fluid-internal/devtools-view` in `packages/tools/devtools/devtools-view`.
- [x] Remove repository-level Jest orchestration after all package migrations are complete.

## Phase 1: Establish Baselines

- [ ] Run the legacy Jest tests for each package and record any existing failures.
  - This step cannot be completed after the migration. Before the migration, the `common-utils` Jest suite could not start because its type packages and `jest-puppeteer` preset were unavailable.
- [x] Record the source test case counts before conversion:
  - [x] `@fluidframework/common-utils`: 19 cases.
  - [x] `@fluid-example/app-insights-logger`: 1 case.
  - [x] `@fluid-internal/devtools-view`: 28 cases.
- [x] Confirm that required browser binaries are available for the Playwright migration.
- [x] Make one package migration at a time and validate it before starting the next package.

## Phase 2: Migrate `@fluid-example/app-insights-logger`

Target: Playwright against the webpack application.

- [x] Add the repository-standard Playwright configuration.
- [x] Use the repository test-port assignment for the webpack development server.
- [x] Add build and test scripts for the Playwright test.
- [x] Convert the Jest loading-state test to a Playwright test.
- [x] Test the application through its production bootstrap path.
- [x] Remove the test-only container initialization seam from the application component.
- [x] Run the package build and the Playwright test in Chromium.
- [x] Confirm that the loading-state assertion has equivalent coverage.
- [x] Remove `jest.config.cjs`.
- [x] Remove Jest, Mocha, jsdom, React Testing Library, and their test-only dependencies.
- [x] Add Playwright and the repository test-tools dependency.
- [x] Remove `eslint-plugin-jest` if no package source or configuration still uses it.
- [x] Update the lockfile.

## Phase 3: Migrate `@fluid-internal/devtools-view`

Target: Mocha with jsdom for all existing tests.

### Test Harness

- [x] Add a repository-standard `.mocharc.cjs` configuration.
- [x] Initialize `global-jsdom` before React, Fluent UI, Recharts, and test modules load.
- [x] Add a Mocha setup file for shared browser API stubs.
- [x] Add a minimal `ResizeObserver` fake for chart tests.
- [x] Stub `HTMLCanvasElement.prototype.getContext` for dependencies that require canvas.
- [x] Ensure that React Testing Library cleanup runs after each test.
- [x] Rename or replace `src/test/tsconfig.jest.json` with a Mocha test configuration.
- [x] Update the CommonJS and ECMAScript module test TypeScript configurations to extend the new configuration.
- [x] Update build and test scripts for the intended CommonJS and ECMAScript module outputs.

### Test Conversion

- [x] Convert all 28 existing test cases from Jest globals and expectations to Mocha and `node:assert`.
- [x] Replace callback `jest.fn()` uses with Sinon spies.
- [x] Replace `ResizeObserver` `jest.fn()` uses with the shared fake.
- [x] Replace Jest DOM focus assertions with active-element assertions.
- [x] Replace Jest DOM text, attribute, and checked-state assertions with DOM properties and `node:assert`.
- [x] Update `src/test/utils/axeUtils.ts` to use `node:assert`.
- [x] Preserve all React Testing Library role, text, and test-ID queries.
- [x] Preserve all `userEvent` keyboard and pointer interactions.
- [x] Preserve all seven `axe-core` accessibility checks.
- [x] Confirm that Recharts tests still mount without browser API errors.

### Validation and Cleanup

- [x] Run the focused Mocha tests against the ECMAScript module output.
- [x] Run the focused Mocha tests against the CommonJS output.
- [x] Confirm that all 28 cases pass without leaked DOM state.
- [x] Confirm that callback spies and focus-order tests retain their original behavior.
- [x] Remove `jest.config.cjs` and `jest.setup.cjs`.
- [x] Remove Jest, `ts-jest`, Jest types, Jest JUnit support, Jest DOM packages, and `eslint-plugin-jest`.
- [x] Keep Mocha, Sinon, Testing Library, `user-event`, and `axe-core` dependencies.
- [x] Add `global-jsdom` and `jsdom` as direct development dependencies.
- [x] Update the lockfile.

### Optional Browser Coverage

Do not mechanically move the current component tests to Playwright. Add browser tests only when they verify behavior that jsdom cannot represent.

- [x] Decide that this migration does not require additional real-browser chart coverage.
- [x] Decide that this migration does not require additional browser accessibility or keyboard coverage.

## Phase 4: Migrate `@fluidframework/common-utils`

Target: Mocha for buffer tests and Playwright for retained browser hashing tests.

### Buffer Tests

- [x] Move the 12 cases in `src/test/jest/buffer.spec.ts` into the existing Mocha test area.
- [x] Convert Jest `test` calls to Mocha `it` calls.
- [x] Replace Jest equality expectations with `node:assert`.
- [x] Add the moved test to the existing Mocha TypeScript configuration.
- [x] Confirm that the tests compare the Node.js and browser buffer implementations under Node.js as before.
- [x] Run the focused Mocha tests and confirm that all 12 cases pass.

### Browser Hashing Decision

The seven hash cases duplicate the scenarios in `packages/common/client-utils/src/test/playwright`, but they execute the deprecated `common-utils` implementation. Select one option before removing the Jest-Puppeteer suite.

- [x] Select the browser hashing strategy:
  - [x] **Retain coverage:** Port the seven cases to Playwright and execute the `common-utils` production browser entry point.
  - [ ] **Retire coverage:** Document that the deprecated implementation is frozen and rely on the replacement `@fluid-internal/client-utils` Playwright coverage.

### Retained Hash Coverage

Complete this section only if the browser hashing coverage is retained.

- [x] Follow the existing `packages/common/client-utils` Playwright test structure.
- [x] Add a browser entry module that exposes the production `common-utils` hash operations to the page.
- [x] Bundle the browser entry module for the Playwright test.
- [x] Add Playwright configuration and a dedicated test TypeScript configuration.
- [x] Add build and test scripts for the Playwright suite.
- [x] Continue to serve a localhost page so Web Crypto runs in a secure context.
- [x] Preserve all four binary fixtures and their expected hashes.
- [x] Preserve SHA-1, SHA-256, hexadecimal, base64, consistency, Node.js, and browser checks.
- [x] Run all seven cases in Chromium.
- [x] Confirm that the test invokes the production browser entry point instead of private functions through `rewire`.

### Cleanup

- [x] Remove the old Jest test directory after all tests and assets have moved or been intentionally retired.
- [x] Remove `jest.config.cjs` and the Jest TypeScript configuration.
- [x] Remove Jest, `ts-jest`, `jest-puppeteer`, Puppeteer types, Jest types, Jest JUnit support, and `rewire`.
- [x] Remove direct Puppeteer because no non-Jest code uses it.
- [x] Add Playwright dependencies because browser hash coverage is retained.
- [x] Update `build:test`, `test`, and coverage scripts for Mocha and Playwright.
- [x] Update the lockfile.

## Phase 5: Remove Repository-Level Jest Support

Start this phase only after no workspace package defines a `test:jest` script.

- [x] Search all package manifests for Jest scripts and dependencies.
- [x] Search source and configuration files for Jest globals, imports, matchers, environments, and setup files.
- [x] Classify and remove stale type-only or lint-only references where appropriate.
- [x] Remove the root `build-and-test:jest` script.
- [x] Remove the root `ci:test:jest` and `ci:test:jest:coverage` scripts.
- [x] Remove the root `test:jest`, `test:jest:bail`, and `test:jest:report` scripts.
- [x] Remove Jest from the root `test` and `test:bail` command chains.
- [x] Remove the root Jest dependency.
- [x] Remove Jest-specific Fluid build task configuration.
- [x] Update CI definitions that invoke removed Jest scripts.
- [x] Update the root lockfile.

## Phase 6: Final Validation

- [x] Build each migrated package from a clean output directory.
- [x] Run the focused test command for each migrated package.
- [x] Run the repository-level Mocha test orchestration for the affected packages.
- [x] Run the repository-level Playwright test orchestration for `common-utils` and `app-insights-logger`.
- [x] Run lint and formatting checks for all changed files.
- [x] Run the relevant policy checks for all changed packages.
- [x] Confirm that test result and coverage artifacts still use the paths expected by continuous integration.
- [x] Confirm that no test count was lost without an explicit retirement decision.
- [x] Search the repository for remaining active Jest usage.
- [x] Confirm that remaining `jest` strings, if any, occur only in historical test data or unavoidable transitive lockfile entries.
- [x] Run the CI readiness check before pushing the completed migration.

Current validation status:

- `app-insights-logger`: 1 Playwright test passes in Chromium after a clean build. Lint and formatting checks pass.
- `devtools-view`: 28 tests pass in both ECMAScript module and CommonJS output after a clean build. ESLint and Biome checks pass.
- `common-utils`: 65 Mocha tests and 7 Playwright tests pass after a clean build. ESLint and Prettier checks pass.
- The CI readiness script passes for all eight changed packages. All eight package policy checks pass. No public API changed, so this migration does not require API report or type-test regeneration.
- A broader changed-package Mocha run fails in an unrelated `@fluid-tools/build-cli` Git-tag test. The migrated package tests pass in the same run.

## Completion Criteria

- [x] All three packages use the selected replacement test runners.
- [x] All retained tests pass with equivalent assertions.
- [x] No package defines a `test:jest` script.
- [x] No active test imports or uses Jest APIs.
- [x] No direct Jest dependency remains in a workspace package or at the repository root.
- [x] Root and CI test orchestration no longer refer to Jest.
- [x] The lockfile contains no avoidable Jest dependency graph.

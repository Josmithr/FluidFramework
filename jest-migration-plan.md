# Jest Test Migration Plan

This checklist tracks the removal of Jest from the Fluid Framework repository. Migrate each test to Mocha with jsdom or to Playwright according to the runtime behavior that the test verifies.

## Goals

- [ ] Preserve the behavior covered by the current Jest tests.
- [ ] Use Mocha for Node.js and jsdom component tests.
- [ ] Use Playwright only when a test requires a real browser.
- [ ] Remove all Jest test scripts, configuration, dependencies, and root orchestration.
- [ ] Keep each package migration independently buildable and testable.

## Current Scope

- [ ] Migrate `@fluidframework/common-utils` in `common/lib/common-utils`.
- [x] Migrate `@fluid-example/app-insights-logger` in `examples/client-logger/app-insights-logger`.
- [ ] Migrate `@fluid-internal/devtools-view` in `packages/tools/devtools/devtools-view`.
- [ ] Remove repository-level Jest orchestration after all package migrations are complete.

## Phase 1: Establish Baselines

- [ ] Run the current Jest tests for each package and record any existing failures.
- [ ] Record the current test counts:
  - [ ] `@fluidframework/common-utils`: 18 cases.
  - [x] `@fluid-example/app-insights-logger`: 1 case.
  - [ ] `@fluid-internal/devtools-view`: 28 cases.
- [ ] Confirm that required browser binaries are available for the Playwright migration.
- [ ] Make one package migration at a time and validate it before starting the next package.

## Phase 2: Migrate `@fluid-example/app-insights-logger`

Target: Mocha with jsdom.

- [x] Add the repository-standard Mocha test configuration.
- [x] Add `global-jsdom` and initialize jsdom before the test module loads.
- [x] Add or update the test TypeScript configuration for Mocha and Node.js types.
- [x] Add build and test scripts for the compiled Mocha test.
- [x] Convert `src/test/components/App.test.tsx` from Jest globals to Mocha globals.
- [x] Continue to use React Testing Library for rendering and DOM queries.
- [x] Explicitly clean up or unmount the rendered component after each test.
- [x] Ensure that the asynchronous Fluid container initialization does not cause an unhandled rejection or an open handle after the test completes.
- [x] Run the package build and the new Mocha test.
- [x] Confirm that the loading-state assertion has equivalent coverage.
- [x] Remove `jest.config.cjs`.
- [x] Remove Jest-only dependencies, including Jest, `ts-jest`, the Jest jsdom environment, Jest types, Jest JUnit support, and unused Jest DOM packages.
- [x] Remove `eslint-plugin-jest` if no package source or configuration still uses it.
- [x] Update the lockfile.

## Phase 3: Migrate `@fluid-internal/devtools-view`

Target: Mocha with jsdom for all existing tests.

### Test Harness

- [ ] Add a repository-standard `.mocharc.cjs` configuration.
- [ ] Initialize `global-jsdom` before React, Fluent UI, Recharts, and test modules load.
- [ ] Add a Mocha setup file for shared browser API stubs.
- [ ] Add a minimal `ResizeObserver` fake for chart tests.
- [ ] Stub `HTMLCanvasElement.prototype.getContext` for dependencies that require canvas.
- [ ] Ensure that React Testing Library cleanup runs after each test.
- [ ] Rename or replace `src/test/tsconfig.jest.json` with a Mocha test configuration.
- [ ] Update the CommonJS and ECMAScript module test TypeScript configurations to extend the new configuration.
- [ ] Update build and test scripts for the intended CommonJS and ECMAScript module outputs.

### Test Conversion

- [ ] Convert all 28 existing test cases from Jest globals and expectations to Mocha and `node:assert`.
- [ ] Replace callback `jest.fn()` uses with Sinon spies.
- [ ] Replace `ResizeObserver` `jest.fn()` uses with the shared fake.
- [ ] Replace Jest DOM focus assertions with active-element assertions.
- [ ] Replace Jest DOM text, attribute, and checked-state assertions with DOM properties and `node:assert`.
- [ ] Update `src/test/utils/axeUtils.ts` to use `node:assert`.
- [ ] Preserve all React Testing Library role, text, and test-ID queries.
- [ ] Preserve all `userEvent` keyboard and pointer interactions.
- [ ] Preserve all seven `axe-core` accessibility checks.
- [ ] Confirm that Recharts tests still mount without browser API errors.

### Validation and Cleanup

- [ ] Run the focused Mocha tests against the ECMAScript module output.
- [ ] Run the focused Mocha tests against the CommonJS output if both outputs remain supported by the package test contract.
- [ ] Confirm that all 28 cases pass without leaked DOM state.
- [ ] Confirm that callback spies and focus-order tests retain their original behavior.
- [ ] Remove `jest.config.cjs` and `jest.setup.cjs`.
- [ ] Remove Jest, `ts-jest`, Jest types, Jest JUnit support, Jest DOM packages, and `eslint-plugin-jest` when no longer used.
- [ ] Keep existing Mocha, Sinon, Testing Library, `user-event`, and `axe-core` dependencies.
- [ ] Add `global-jsdom` and `jsdom` as direct development dependencies.
- [ ] Update the lockfile.

### Optional Browser Coverage

Do not mechanically move the current component tests to Playwright. Add browser tests only when they verify behavior that jsdom cannot represent.

- [ ] Decide whether real-browser chart rendering needs additional coverage.
- [ ] If required, add a focused Playwright test that verifies nonzero rendered chart dimensions or meaningful SVG output.
- [ ] Decide whether browser accessibility-tree or real tab-order coverage is required.
- [ ] If required, add focused Playwright accessibility or keyboard navigation tests.

## Phase 4: Migrate `@fluidframework/common-utils`

Target: Mocha for buffer tests and Playwright for retained browser hashing tests.

### Buffer Tests

- [ ] Move the 11 cases in `src/test/jest/buffer.spec.ts` into the existing Mocha test area.
- [ ] Convert Jest `test` calls to Mocha `it` calls.
- [ ] Replace Jest equality expectations with `node:assert`.
- [ ] Add the moved test to the existing Mocha TypeScript configuration.
- [ ] Confirm that the tests compare the Node.js and browser buffer implementations under Node.js as before.
- [ ] Run the focused Mocha tests and confirm that all 11 cases pass.

### Browser Hashing Decision

The seven hash cases duplicate the scenarios in `packages/common/client-utils/src/test/playwright`, but they execute the deprecated `common-utils` implementation. Select one option before removing the Jest-Puppeteer suite.

- [ ] Select the browser hashing strategy:
  - [ ] **Retain coverage:** Port the seven cases to Playwright and execute the `common-utils` production browser entry point.
  - [ ] **Retire coverage:** Document that the deprecated implementation is frozen and rely on the replacement `@fluid-internal/client-utils` Playwright coverage.

### Retained Hash Coverage

Complete this section only if the browser hashing coverage is retained.

- [ ] Follow the existing `packages/common/client-utils` Playwright test structure.
- [ ] Add a browser entry module that exposes the production `common-utils` hash operations to the page.
- [ ] Bundle the browser entry module for the Playwright test.
- [ ] Add Playwright configuration and a dedicated test TypeScript configuration.
- [ ] Add build and test scripts for the Playwright suite.
- [ ] Continue to serve a localhost page so Web Crypto runs in a secure context.
- [ ] Preserve all four binary fixtures and their expected hashes.
- [ ] Preserve SHA-1, SHA-256, hexadecimal, base64, consistency, Node.js, and browser checks.
- [ ] Run all seven cases in Chromium.
- [ ] Confirm that the test invokes the production browser entry point instead of private functions through `rewire`.

### Cleanup

- [ ] Remove the old Jest test directory after all tests and assets have moved or been intentionally retired.
- [ ] Remove `jest.config.cjs` and the Jest TypeScript configuration.
- [ ] Remove Jest, `ts-jest`, `jest-puppeteer`, Puppeteer types, Jest types, Jest JUnit support, and `rewire`.
- [ ] Remove direct Puppeteer if no non-Jest code still uses it.
- [ ] Add Playwright dependencies only if browser hash coverage is retained.
- [ ] Update `build:test`, `test`, and coverage scripts for the selected runners.
- [ ] Update the lockfile.

## Phase 5: Remove Repository-Level Jest Support

Start this phase only after no workspace package defines a `test:jest` script.

- [ ] Search all package manifests for Jest scripts and dependencies.
- [ ] Search source and configuration files for Jest globals, imports, matchers, environments, and setup files.
- [ ] Classify and remove stale type-only or lint-only references where appropriate.
- [ ] Remove the root `build-and-test:jest` script.
- [ ] Remove the root `ci:test:jest` and `ci:test:jest:coverage` scripts.
- [ ] Remove the root `test:jest`, `test:jest:bail`, and `test:jest:report` scripts.
- [ ] Remove Jest from the root `test` and `test:bail` command chains.
- [ ] Remove the root Jest dependency.
- [ ] Remove Jest-specific Fluid build task configuration.
- [ ] Update CI definitions that invoke removed Jest scripts.
- [ ] Update the root lockfile.

## Phase 6: Final Validation

- [ ] Build each migrated package from a clean output directory.
- [ ] Run the focused test command for each migrated package.
- [ ] Run the repository-level Mocha test orchestration for the affected packages.
- [ ] Run the repository-level Playwright test orchestration if `common-utils` retains browser tests.
- [ ] Run lint and formatting checks for all changed files.
- [ ] Run the relevant policy checks for all changed packages.
- [ ] Confirm that test result and coverage artifacts still use the paths expected by continuous integration.
- [ ] Confirm that no test count was lost without an explicit retirement decision.
- [ ] Search the repository for remaining active Jest usage.
- [ ] Confirm that remaining `jest` strings, if any, occur only in historical documentation or unavoidable transitive lockfile entries.
- [ ] Run the CI readiness check before pushing the completed migration.

## Completion Criteria

- [ ] All three packages use the selected replacement test runners.
- [ ] All retained tests pass with equivalent assertions.
- [ ] No package defines a `test:jest` script.
- [ ] No active test imports or uses Jest APIs.
- [ ] No direct Jest dependency remains in a workspace package or at the repository root.
- [ ] Root and CI test orchestration no longer refer to Jest.
- [ ] The lockfile contains no avoidable Jest dependency graph.

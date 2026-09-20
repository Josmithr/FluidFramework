# API tooling replacement: analysis tooling research

## Summary

**Selected direction: use the official native TypeScript 7 tooling.**
The [implementation plan](api-extractor-replacement-implementation-plan.md) defines delivery, verification gates, and required documentation-driven, test-driven, and functional development practices.
This decision replaces the earlier recommendation to evaluate TypeDoc first. The comparative evidence below remains relevant, but does not select an alternative backend.
Implementation update on 2026-09-20: Stage 2 is accepted, including the package's self-generated complete API report.
This document remains the dated tooling investigation; use the [acceptance checklist](api-extractor-replacement-implementation-plan.md#current-acceptance-checklist) for current implementation evidence.
The three original compiler probes remain pending at their assigned stages, and the remaining follow-ups are scheduled after the library implementation.

The evaluated tools do not provide a proven solution that meets all current requirements with low maintenance cost.
TypeScript 6 has a mature, in-process compiler API.
TypeScript 7.0.2 publishes semantic APIs, but they are explicitly under `unstable` entrypoints and communicate with a native process.
The established higher-level tools inspected here do not yet provide native TypeScript 7 analysis.

The main findings are:

- **ts-morph simplifies access to the compiler. It does not supply a complete API extraction engine.** Version 28.0.0 bundles TypeScript 6.0.2 through `@ts-morph/common`.
- **TypeDoc offers the most relevant reusable extraction and documentation layer among the alternatives evaluated.** Its reflection model, inheritance support, serialization, and plugins could remove substantial custom work. However, its supported TypeScript range stops at 6, and its documentation policies do not exactly match our requirements.
- **IntelliSense protocols are not a substitute for a semantic compiler API.** They provide editor-oriented information, not a complete, portable API graph.
- **Declaration files are the preferred initial input for package-surface analysis.** They reduce implementation detail and match the published contract. They do not remove the need for type checking, dependency resolution, or documentation-origin tracking.
- **Native TypeScript 7's child process is permitted by W6.** The requirement is to reuse analysis across tasks, not to run the compiler inside Node. Published session APIs make reuse a candidate to test, not a verified outcome.
- **One TS7 engine may analyze TS6- and TS7-built packages using TS7 semantics.** Separate engines are not required merely to reproduce each build compiler's behavior. Input compatibility and generated-declaration compatibility still need tests.
- **Analyzing TypeScript 7 output with TypeScript 6 is a compatibility strategy, not proof of TypeScript 7 semantic support.** It needs explicit acceptance criteria and validation against W4.

This report reflects the clarified [workflow requirements](api-extractor-replacement-requirements.md): compiler child processes are permitted, analysis must be reused across tasks, and one TS7 engine may serve both supported package versions.
It proposes evaluation steps, not a package design or implementation commitment, and retains the [new capabilities and regression coverage](api-extractor-replacement-new-features.md).

## Research scope

Research date: **2026-09-15 UTC**.

The original investigation inspected upstream documentation, package metadata, published package files, and selected source files.
It did not install candidates, execute their analysis engines, run the upstream reproductions, or benchmark performance.
An available API method is evidence of a capability to test, not proof that a requirement passes.

The subsequent [Stage 0 investigation](../README.md#stage-0-results) executed pinned TS7 7.0.2 against fixtures built with TS6 6.0.3 and TS7 7.0.2.
It verified several semantic queries, declaration printing and consumption, and a narrow cached-query reuse case.
It recorded failed gates for retained-program declaration emission and async native-crash handling.
These runtime results supplement the original research; they do not establish full workflow coverage or performance targets.

Maturity is assessed from the following evidence:

- Whether the interface is published and documented.
- Whether it has an established ecosystem and ongoing maintenance.
- Whether the inspected release explicitly supports the required compiler versions.
- Whether adoption requires private APIs, a fork, or a replacement semantic implementation.
- Whether the abstraction matches API extraction rather than an adjacent task.

### Version snapshot

These versions were observed in the npm registry. They are not the repository's installed dependency versions.

| Package | Observed version | Relevant evidence |
| --- | --- | --- |
| `typescript` | 7.0.2 | Native distribution; exports `unstable/sync`, `unstable/async`, and AST utilities. [Package metadata](https://registry.npmjs.org/typescript/7.0.2). |
| `@typescript/typescript6` | 6.0.2 | Compatibility package depends on `@typescript/old`, an npm alias for `typescript@^6`. Its package version does not fix the resolved compiler patch. [Package metadata](https://registry.npmjs.org/@typescript%2Ftypescript6/6.0.2). |
| `ts-morph` | 28.0.0 | Depends on `@ts-morph/common ~0.29.0`. [Package metadata](https://registry.npmjs.org/ts-morph/28.0.0). |
| `@ts-morph/common` | 0.29.0 | Published compiler bundle identifies itself as TypeScript 6.0.2. [Published bundle](https://unpkg.com/@ts-morph/common@0.29.0/dist/typescript.js). |
| `typedoc` | 0.28.20 | TypeScript peer range includes 5.0.x through 6.0.x, not 7. [Package metadata](https://registry.npmjs.org/typedoc/0.28.20). |
| `typescript-language-server` | 6.0.0 | Community LSP wrapper around `tsserver`; not the server used by VS Code. [Package metadata](https://registry.npmjs.org/typescript-language-server/6.0.0). |
| `@microsoft/api-extractor` | 7.59.1 | Depends on TypeScript 5.9.3. [Package metadata](https://registry.npmjs.org/@microsoft%2Fapi-extractor/7.59.1). |
| `@microsoft/tsdoc` | 0.16.0 | Compiler-independent documentation parser. [Package metadata](https://registry.npmjs.org/@microsoft%2Ftsdoc/0.16.0). |
| `rollup-plugin-dts` | 6.5.1 | Advertises TS7 compatibility through a TS6 fallback; LGPL-3.0-only. [Package metadata](https://registry.npmjs.org/rollup-plugin-dts/6.5.1). |
| `dts-bundle-generator` | 9.5.1 | Depends on `typescript >=5.0.2`; this open range alone does not establish TS7 API compatibility. [Package metadata](https://registry.npmjs.org/dts-bundle-generator/9.5.1). |

Published files take precedence over development-branch capabilities for release claims.
Several upstream pages retain older preview or version-table text.
In particular, the TypeScript compiler API wiki describes the old API and says the new API is planned for 7.1, while 7.0.2 already publishes explicitly unstable API entrypoints.
Neither statement establishes that a stable replacement API is available now.

## What needs to be delegated

The phrase "API parsing" covers three different responsibilities.

| Responsibility | Examples | Appropriate owner |
| --- | --- | --- |
| Syntax parsing | Declarations, export clauses, comments, type expressions | TypeScript parser; TSDoc parser for documentation comments. |
| Language semantics | Module resolution, aliases, merged declarations, inferred types, instantiated inherited members, intersections, utility types, signatures | The applicable TypeScript compiler and checker. Do not reproduce these algorithms. |
| API-product behavior | Selected surfaces, stable identities, release policies, directional reference rules, suite-model validation, review output, artifact serialization | Reuse an extractor where possible. The replacement still needs integration and configured policy. |

API Extractor already uses TypeScript's parser and checker.
Its [CompilerState implementation](https://github.com/microsoft/rushstack/blob/cca9ec07ccfdcc8b754258e81f945404c7e16ab7/apps/api-extractor/src/api/CompilerState.ts) creates a TypeScript program.
Its [AstSymbolTable implementation](https://github.com/microsoft/rushstack/blob/cca9ec07ccfdcc8b754258e81f945404c7e16ab7/apps/api-extractor/src/analyzer/AstSymbolTable.ts) adds custom symbol traversal, export analysis, and declaration-reference tracking.
Replacing API Extractor with compiler calls alone would leave much of that higher-level work to us.

This distinction is important for the maintenance constraint.
If "no custom API analysis" includes all export traversal and graph construction, neither the compiler API nor ts-morph is a sufficient answer by itself.
TypeDoc or upstream improvements to an existing extractor become more important in that case.

## Candidate comparison

"In process" below refers to semantic analysis in the calling Node.js process, not merely a Node.js client API.
This is an implementation characteristic, not an acceptance requirement.

| Option | Maturity and ownership | TypeScript 6 | Native TypeScript 7 | Custom work and assessment |
| --- | --- | --- | --- | --- |
| Official compiler API | Most established semantic foundation; maintained with the language. Public APIs still change between compiler releases. | Direct, in-process support. | Different API, not a drop-in upgrade. | Strong semantic foundation, but substantial extraction and artifact work remains. |
| Official TS7 semantic API | Microsoft-owned; published but explicitly unstable. Less integration history than the old API. | May analyze TS6 inputs using TS7 semantics; compatibility needs testing. | Direct native queries through a child process or server connection. | Best native direction to evaluate. Process use is permitted; analysis reuse, API coverage, and maturity remain gates. |
| ts-morph | Established compiler wrapper with extensive documentation and active releases. | Bundled TS6 engine; in process. | No native TS7 backend established for the inspected release. | Helpful ergonomics, especially for source manipulation. Does not remove extractor ownership or bridge TS6 and TS7. |
| TypeDoc | Established documentation extractor with a public Node API, models, serialization, and plugins. | Advertised support; conversion can run in process. | Not in the inspected supported range. | Best higher-level reuse candidate. Policy, model fidelity, and compiler support remain acceptance gates. |
| Language service / `tsserver` / LSP | Mature editor tooling, but distinct interfaces and process models. | Language service can run in process; `tsserver` normally runs separately. | Native server and new API require separate evaluation. | Poor primary extraction boundary. Editor results omit information needed for complete artifacts. |
| API Extractor | Established integrated reports, declarations, TSDoc, and models; already used here. | Inspected package bundles TS5.9, not a TS6 engine. | No native TS7 path established. | Baseline and possible upstream-investment option. Known defects and policy constraints remain. |
| Declaration bundlers | Established within a narrower output task; maturity varies. | Compiler-dependent. | Some advertise a TS6 compatibility fallback. | Potential W5 components, not API graph or documentation engines. |

### Official TypeScript 6 APIs

The [compiler API guide](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API) describes `Program`, `CompilerHost`, `SourceFile`, and `TypeChecker`.
These interfaces support both source and declaration inputs.
The checker supplies symbols, types, module exports, aliases, properties, and signatures.
The compiler also supplies declaration emit, AST factories, and a printer.

These are the correct tools for computing generic specialization and composed types.
For F1, inspect the type as observed by the consumer and query its members and signatures.
Do not copy only the syntax of the base declaration: a base member declared as `T` may be `string` in the derived type.
Also test modifiers on synthesized mapped-type members. A source declaration's modifiers alone do not prove the effective `Readonly` or optional state.

The main costs are export-path tracking, graph traversal, stable artifact representation, and version maintenance.
An exported alias and its target symbol must both remain available.
Resolving an alias and then discarding the export path can recreate B1 and B2 even when the compiler resolved the symbol correctly.

**Assessment:** preferred semantic foundation for TS6, but not a low-maintenance complete extractor by itself.
Use public APIs and pinned, tested compiler versions. Do not treat compiler-internal helpers as supported APIs because they exist at runtime.

### Official TypeScript 7 APIs

The [7.0.2 package exports](https://registry.npmjs.org/typescript/7.0.2) include `typescript/unstable/sync`, `typescript/unstable/async`, and `typescript/unstable/ast`.
The root export points to version information rather than the old JavaScript compiler API.

The [published synchronous API declarations](https://unpkg.com/typescript@7.0.2/dist/api/sync/api.d.ts) expose useful semantic operations:

- Project snapshots and source-file access.
- Syntactic, semantic, and declaration diagnostics.
- `getExportsOfModule`, `getAliasedSymbol`, and `getImmediateAliasedSymbol`.
- `getTypeOfSymbolAtLocation`, `getDeclaredTypeOfSymbol`, and `getPropertiesOfType`.
- Base types, index information, type arguments, call signatures, and assignability.
- Declaration handles, documentation queries, type-to-node conversion, and node printing.

These are substantive semantic APIs, not just an LSP hover interface.
However, they are not API-compatible with TS6.
For example, TS7 exposes snapshot-scoped objects and declaration handles that must be resolved.
Persistent artifact identities must not be based on transient compiler handles.

The process behavior is explicit in the published implementation:

- The [synchronous RPC channel](https://unpkg.com/typescript@7.0.2/dist/api/syncChannel.js) imports `spawn` from `node:child_process` and launches the native executable on both POSIX and Windows.
- The [asynchronous client](https://unpkg.com/typescript@7.0.2/dist/api/async/client.js) launches a native process or connects to a server socket.

The inspected production package does not establish an in-process Node native binding or WebAssembly semantic engine.
Such a binding is not required by W6. Building and maintaining our own bridge would add unnecessary maintenance burden.
The intended evaluation retains a compiler connection and reuses project analysis across validation and generation tasks.
It must check actual reuse, communication overhead, process failure handling, and resource disposal.
A synchronous client call still communicates with a separate process; it does not imply a fresh compiler launch per query or task.

Development sources show more capabilities than 7.0.2.
For example, the [API source at commit 57d9528](https://github.com/microsoft/TypeScript/blob/57d9528db25b8dc8375e18468a870ec3f4277d62/packages/typescript/src/api/async/api.ts) adds APIs such as `createProgram`, declaration emit access, and `isReadonlySymbol` that are absent from the inspected 7.0.2 synchronous declaration surface.
Do not plan against those methods as released functionality.
The [compiler API wiki](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API) also warns that the new API will be completely different.

**Assessment:** the strongest native TS7 candidate, but experimental for this integration.
It is not currently a proven fit for W4, W5, and W6 together.
The child process is acceptable. A prototype must verify input compatibility, required public APIs, and analysis reuse before this becomes a production recommendation.

### ts-morph

ts-morph wraps TypeScript AST, symbol, type, and project operations.
Its [type API](https://ts-morph.com/details/types) includes properties, apparent properties, base types, signatures, intersections, type arguments, and access to the underlying compiler type.
It is useful when code needs repeated AST navigation or manipulation.

The release inspected here is tied to its own compiler bundle.
Installing TypeScript 7 beside ts-morph does not switch that bundle to the native compiler.
The [common package source](https://github.com/dsherret/ts-morph/blob/f288183ddb496adc6f4c5b6929830b5b73437185/packages/common/package.json) and published bundle both identify TS6.0.2.
No published native TS7 backend or committed delivery date was established in this research.

ts-morph does not provide release-level surfaces, suite documentation models, configurable API-reference policies, or review artifacts.
It also cannot guarantee that application code preserves alias names, type-only export paths, or documentation origin.

**Assessment:** reasonable TS6 convenience layer, not the recommended cross-version boundary.
For a read-only analyzer, compare its actual reduction in code against direct compiler calls before adding it.
Do not select it on the assumption that it will absorb the TS7 migration.

### TypeDoc

TypeDoc converts TypeScript symbols and types into a documentation-oriented reflection model.
Its [Node API](https://typedoc.org/documents/Overview.html#node-module) permits conversion and JSON generation without invoking its CLI.
Its [API reference](https://typedoc.org/api/) exposes converters, declaration and signature reflections, reference types, serializers, and deserializers.
This is a higher level of reuse than ts-morph.

Relevant existing capabilities include:

- Multiple entrypoints and package conversion.
- JSON model generation, deserialization, and model merging.
- Inheritance relationships and explicit `{@inheritDoc}` processing.
- Structured comment content and declaration-link resolution.
- Plugins and conversion hooks.
- Type expansion controls for documentation.

Its [input options](https://typedoc.org/documents/Options.Input.html) describe package and merge strategies, exclusions, and conversion depth limits.
Its [inheritDoc documentation](https://typedoc.org/documents/Tags.__inheritDoc_.html) and [expansion documentation](https://typedoc.org/documents/Tags._expand.html) describe existing behavior.
These are promising starting points, not proof that F1-F4 pass.

Important gaps require a focused evaluation:

- The inspected release advertises TS6 support, not TS7.
- TypeDoc has its own [comment parser](https://typedoc.org/documents/Doc_Comments.html). Supporting TSDoc-like tags is not the same as strict TSDoc conformance.
- Its [declaration references](https://typedoc.org/documents/Declaration_References.html) deliberately differ from TSDoc in some cases. TypeScript link resolution is also enabled by default.
- Package-model merging is not equivalent to F2. F2 requires dependency models and reference resolution before each package's model is written, with strict suite membership and origin rules.
- F3 requires any local TSDoc to stop automatic inheritance, signature-based overload matching, and errors for ambiguous bases. Do not assume default inheritance has these exact policies.
- Documentation exclusions must not erase internal targets needed for validation or remove an entire mixed-release overload set.
- A documentation reflection is not automatically a lossless representation of type-only export paths or a valid input for declaration roll-ups.
- Built-in non-TSDoc tags and semantics must not become unavoidable behavior in our generic tool.

**Assessment:** the strongest higher-level reuse alternative evaluated, but not the selected TS7 backend.
Reconsider it only through an explicit architecture decision if public extension points can supply the required behavior without a fork or a second independent semantic graph.
If it needs extensive reconstruction after conversion, much of its maintenance advantage disappears.
Distinguish optional Git subprocesses from compiler analysis when measuring lifecycle and reuse.

### IntelliSense, language services, and LSP

There are three different interfaces to distinguish:

1. The TS6 [language service API](https://github.com/microsoft/TypeScript/wiki/Using-the-Language-Service-API) can run inside Node. It uses the same compiler semantics and adds editor queries and incremental state.
2. `tsserver` hosts TypeScript services behind a protocol. The traditional VS Code TypeScript extension uses this interface.
3. The community [typescript-language-server](https://github.com/typescript-language-server/typescript-language-server/blob/19fce01d47963b0e24a77682bc41cc71171f6a83/README.md) translates LSP requests to `tsserver`. Its README explicitly says it is not the server used by VS Code and describes the native TS7 LSP transition.

The [Language Server Protocol](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/) standardizes operations such as hover, completion, symbols, references, and signature help.
Those results primarily contain names, locations, labels, and display text.
They do not define the complete TypeScript symbol/type graph needed for our artifacts.
Recovering types by parsing hover strings would introduce fragile custom logic and lose semantic identity.

**Assessment:** do not use LSP or `tsserver` presentation results as the extraction foundation.
An in-process language service can be useful for incremental TS6 workloads, but accessing its program/checker returns to the compiler-API option.
The TS7 semantic API is more appropriate than LSP for native analysis, subject to its separate constraints.

### API Extractor and declaration bundlers

API Extractor remains the mature reference implementation for the combined workflow.
Keeping it temporarily or contributing upstream fixes can be lower risk than replacing its analysis with custom traversal.
However, the current package's TS5.9 dependency, existing patches, and recorded defects mean that continued use does not establish compliance with the replacement requirements.

Declaration bundlers can reduce custom work for W5, but do not replace the analysis or documentation layers:

- [rollup-plugin-dts](https://github.com/Swatinem/rollup-plugin-dts) is established and recommends existing declaration inputs. It is in maintenance mode. Its advertised TS7 support falls back to `@typescript/typescript6`, rather than using native TS7 semantics. Its LGPL-3.0-only license needs normal repository approval before adoption.
- [dts-bundle-generator](https://github.com/timocov/dts-bundle-generator) supports declaration tree-shaking and configurable dependency inclusion. The observed release is 9.5.1, and its recent activity is less substantial than the primary candidates. The broad TypeScript dependency range is not evidence that the native API works.

Ordinary compiler declaration emit does not by itself implement release-filtered ESM roll-ups.
Bundling also needs to preserve nominal identity, namespace structure, and import closure.
Do not replace that work with concatenation or assume that a printer can repair it.

Syntax-only alternatives, such as Babel's TypeScript parser or a tree-sitter grammar, can recognize declarations.
They do not supply TypeScript's checker semantics for inherited generic members, inferred types, or utility types.
They are not suitable as the primary semantic engine for these requirements.

### TSDoc as a separate dependency

Use `@microsoft/tsdoc` for strict TSDoc parsing and diagnostics.
It is already relevant to the current workflow and is independent of the compiler API.
Its [documented design](https://tsdoc.org/pages/intro/approach/) accepts comment strings and produces a documentation AST.

This avoids a custom TSDoc parser and works with either compiler generation.
It does not supply a package API graph, resolve our suite models, or enforce Fluid-specific policy.
Those responsibilities still require an extractor integration and configuration.

## Declaration files versus source files

**Prefer untrimmed, comment-preserving declarations for the initial package-surface evaluation. Keep source input as a supported candidate, not a prohibited alternative.**

| Consideration | Declaration inputs | Source inputs |
| --- | --- | --- |
| Published contract | Closely matches what package consumers receive. | Must prove that source-selected exports match the published contract and resolution conditions. |
| Implementation detail | Omits function bodies and most implementation-only declarations. | More code and inferred types to analyze; compiler semantics remain available. |
| Type computation | Still needs a checker for aliases, generics, intersections, and utilities. | Checker can compute types directly from implementation. |
| Documentation | Works if emit preserves required comments and declarations. | Best access to original comments, overloads, and source locations. |
| Dependencies | Natural fit for installed dependencies and prebuilt packages. | Workspace source redirects can change the surface relative to installed packages. |
| Build integration | Requires current declaration artifacts, or an internal declaration-emit stage. | Can avoid a separate prebuild for the package being analyzed. |
| Tool support | Natural fit for API Extractor and declaration bundlers. | Natural fit for TypeDoc and source-manipulation tooling. |

A declaration-first approach has conditions:

- Do not analyze already release-trimmed input when validation needs excluded targets.
- Do not strip internal declarations before mixed-overload and reference-policy analysis.
- Preserve TSDoc comments. Declaration maps help source navigation but do not restore erased documentation.
- Preserve origin package and declaration identity through re-exports. A flattened declaration file can lose context needed by F2.
- Load the correct dependency declarations, standard libraries, compiler options, and resolution conditions.
- Validate comment survival for overloads, inferred declarations, and dependency aliases before choosing declarations exclusively.
- Treat suite documentation models as documentation inputs, not automatically as substitutes for dependency type declarations.

A source-input implementation could use official declaration emit as an internal normalization stage.
That still involves more than syntax parsing and can require a second program over the emitted declarations.
Measure reuse and fidelity before choosing this route.

### The TS6 compatibility route

The official `@typescript/typescript6` package makes a TS6 engine available beside a project using TS7.
The rollup plugin uses this strategy and states that TS6 declaration behavior is compatible for its use case.
That claim is useful evidence for a limited prototype, not a guarantee for our broader workflows.

Our required outcomes include module resolution, effective members, modifiers, reference validation, and generated declarations.
Successfully parsing a TS7-produced declaration file proves only syntax compatibility.
It does not prove agreement on all those semantics, compiler options, or future TS7 minors.

A TS6 analysis engine for TS7-produced declarations must therefore remain an explicitly scoped compatibility option.
It must not be presented as full native TS7 support or silently substituted for W4.

## Feasibility and decision points

The process and compiler-version interpretations are now clarified. The remaining questions concern capability, reuse, and maintenance:

| Constraint | Evidence and implication |
| --- | --- |
| Mature, low-maintenance semantic tooling | TS6 has established interfaces and higher-level consumers. TS7's inspected semantic interface is unstable. |
| TS6 and TS7 package compatibility | One TS7 engine using TS7 semantics is acceptable. Test supported inputs and resolution configurations, and compile generated declarations with each supported build compiler. |
| Reuse analysis across tasks | A compiler child process is permitted. Verify that requested outputs and validations reuse applicable analysis instead of triggering a complete analysis rerun for each task. |
| No custom extraction maintenance | Compiler APIs and ts-morph still require graph construction. TypeDoc reduces that work but does not yet demonstrate all required policies or TS7 support. |

No evaluated option is currently a proven match for all four constraints because the proposed checks have not run.
Native TS7 is no longer blocked by process count, and supporting TS6-built packages does not itself require a separate TS6 engine.
The subsequent decision selects native TS7 as the planned backend, but does not establish capability coverage or remove unstable-API risk.

The reverse compatibility route, analyzing TS7 output with TS6, remains a separate, bounded option that needs explicit agreement and testing.

There is also a maintenance decision: how much generic export traversal and artifact modeling is acceptable to own?
If that work is also outside the acceptable maintenance budget, prioritize TypeDoc extension feasibility and upstream collaboration over a compiler-only replacement.

## Selected-direction evaluation sequence

1. Follow Stage 0 of the implementation plan: document expected behavior and write fixture assertions before integrating a pinned published native TS7 API version.
2. Analyze both TS6- and TS7-built fixtures with TS7. Verify input compatibility, effective members, export identity, and analysis reuse across tasks.
3. Test required public queries and declaration-generation capabilities early. Do not use development-only methods as published functionality.
4. Evaluate declaration generation separately from semantic extraction. Require consumer-compilation tests before selecting a W5 component.
5. Record blockers and maintenance costs before stabilizing public APIs or model formats. A missing capability requires an explicit decision, not an automatic switch to TypeDoc, ts-morph, or TS6.

If separate compiler integrations are needed, keep compiler-specific objects inside their respective integrations.
Share policy and artifact code where practical.
This is a containment principle, not a recommendation to recreate the entire compiler API behind a large abstraction.

## Focused prototype gates

These checks are proposed. None has passed as part of this research.
Build the same fixtures with both supported compiler majors and validate generated declarations with the corresponding compiler.
One TS7 analysis engine may serve both fixture sets; matching TS6 checker behavior is not required.
Record the actual analysis engine separately from the project's build compiler.

| Gate | Required evidence | Requirement coverage |
| --- | --- | --- |
| Analysis reuse and lifecycle | Instrument analysis setup and execution across reports, declarations, models, and validation for unchanged inputs. Verify that each task does not trigger a complete rerun of the same analysis. Permit compiler child processes; test resource disposal and invalidation after relevant input changes. | W6; TS7 feasibility. |
| Effective member view | Check generic inheritance, ordinary intersections, `Pick`, `Omit`, `Readonly`, combinations, modifiers, call/index signatures, and original expressions on unsupported expansion. | F1, W4, W7. |
| Export identity | Preserve dependency aliases with and without consumer re-export; distinguish type-only and value exports through multiple paths and entrypoints. | B1, B2, W1, W4. |
| Documentation resolution | Resolve same-package and direct/peer/transitive suite references before model output; preserve origin after re-export; reject out-of-suite targets and missing/incompatible selected models even when unused. | F2, W3, W7, W8. |
| Documentation inheritance | Any local comment stops automatic inheritance; preserve derived signatures; match overloads or diagnose ambiguity; reject cycles and conflicting bases. | F3, W3. |
| Policy and overloads | Select callable overloads independently, including internal/public mixtures; omit implementation signatures; enforce directional custom rules and non-internal-to-internal documentation restrictions; allow public-to-beta documentation links. | F4, B3, W2, W3, W10. |
| Declaration closure | Remove excluded-only imports and collision aliases; preserve required imports and namespace exports; compile generated included-dependency and external-reference variants as consumers. | B4, B5, B6, W5. |
| Build and artifact fidelity | Compare source and declaration inputs; retain comments and identity; round-trip portable models; verify clean/incremental agreement and Node/browser/custom-condition selection. | W4, W6, W8, W9, W11. |

For each candidate, record which checks use an existing public capability and which need custom logic.
Reject an integration that requires reimplementing the TypeScript type system or relying on private APIs for required behavior.
Treat a large custom reconstruction layer over a documentation model as a maintenance cost, not as successful delegation.

## Conclusion

The language-semantic foundation should remain TypeScript itself.
TypeDoc is the strongest higher-level reuse candidate evaluated here; ts-morph is a convenience layer, and IntelliSense protocols are the wrong abstraction for complete API artifacts.
Declaration-first analysis is the preferred initial experiment, with explicit documentation and identity checks.

The immediate blocker is not choosing between `.ts` and `.d.ts`.
The remaining work is to verify input compatibility, interface maturity, cross-task analysis reuse, and the acceptable amount of custom extraction code.
The clarified requirements permit one TS7 engine and a reusable native compiler child process.
The next step should be the focused evaluations above, not implementation of a new parser or compiler bridge.

# Dependency suite inputs

[suite.test.ts](../../suite.test.ts) copies these declaration inputs into temporary installed-package layouts.
It generates dependency models through the public API before analyzing consumers.
The transitive freshness test uses these same inputs in a three-package chain.
Regenerating only the leaf model must invalidate inherited content stored in the intermediate model.
Reformatting model JSON without changing its content must remain valid.
Package manifests, TypeScript project configurations, and intentional artifact corruption are test-owned runtime data.
Tests do not update accepted baselines or modify production package inputs.

## Portable model snapshots

The [dependency model](../../snapshots/dependency.api.json) and [consumer model](../../snapshots/consumer.api.json) preserve complete version 1 artifacts generated from `dependency.d.ts` and `consumer.d.ts`.
Version markers stay at 1 during initial development, including incompatible schema or identity changes; regenerate snapshots without maintaining compatibility with earlier development artifacts.
The test `resolves explicit and automatic dependency documentation with original link origins` compares the exact encoded text, including package-relative identities, source offsets, input hashes, and dependency fingerprints.
It checks link origins and inherited content before comparing snapshots.
No paths, identities, or hashes are normalized for comparison.
The test `consumes checked-in model snapshots without declarations or compiler imports` reads the pair in a fresh process, blocks compiler imports, and follows aliases, inherited documentation, and cross-package link targets using only the artifacts.

Normal tests never rewrite these files.
To update the pair intentionally, generate the dependency first through `analyzeAPIs` using the test's fixture layout and configuration, then generate the consumer with that dependency model installed.
Write the exact `generateModel()` outputs to the snapshot files and review the semantic changes before accepting them.
Do not run a JSON formatter on these generated baselines; their formatting is part of the encoder contract.
Regenerate both artifacts when dependency content changes because the consumer records its fingerprint.

## Fixtures

| Fixture | Validation role |
| --- | --- |
| [dependency.d.ts](dependency.d.ts) | Public-to-beta links, internal reference policy, and a generic automatic-inheritance source. |
| [package-overview.d.ts](package-overview.d.ts) | One package-owned comment independent of exports. Native tests also emit it from a temporary TypeScript source file; suite tests verify ownership, malformed model records, and freshness. |
| [compound-consumer.d.ts](compound-consumer.d.ts) | Compound declaration identities, selected callable overload documentation, namespace members, and recursive paths through sibling namespace cycles. |
| [consumer.d.ts](consumer.d.ts) | Qualified inheritance and links, dependency aliases, automatic implementation documentation, and original-package lookup despite a same-named internal consumer API. |
| [selectors-consumer.d.ts](selectors-consumer.d.ts) | Member-side, declaration-kind, label, and constructor selectors; quoted names; enum and symbol members; mismatches and ambiguity; recursive paths; and visibility through serialized dependency data. |
| [self-references-consumer.d.ts](self-references-consumer.d.ts) | Self-qualified dependency re-exports, qualified model subpaths, retained inherited provenance, and missing-suite and internal-link rejection. |
| [merged-inheritance-consumer.d.ts](merged-inheritance-consumer.d.ts) | Explicit generic interface and repeated-property inheritance through qualified and imported model targets, multi-source merged requests, combined section provenance, parameter-name checks, and original dependency link scope. |
| [merged-namespace-consumer.d.ts](merged-namespace-consumer.d.ts) | Links and inherited member documentation through combined namespace exports and recursive aliases, with dependency provenance and unchanged receiver metadata. |
| [module-namespace.ts](module-namespace.ts) and [module-namespace-dependency.ts](module-namespace-dependency.ts) | TS6/TS7 namespace-export comments, matching member release levels, selectors, type-only members, aliases, defaults, atomic tag selection, and exact report snapshots. |
| [module-namespace-forward.d.ts](module-namespace-forward.d.ts) | Ordinary forwarding preserves namespace identity and documentation; qualified namespace selectors resolve through selected dependency models. |
| [module-namespace-recursive.d.ts](module-namespace-recursive.d.ts) | Recursive and empty namespace wrappers terminate traversal and retain portable back-references. The empty target reuses the repository's empty-module fixture. |
| [reexport-source.d.ts](reexport-source.d.ts) and [reexport-forward.d.ts](reexport-forward.d.ts) | Absent and matching re-export tags preserve source metadata; conflicting tags fail for named, type-only, star, overloaded, and intermediate export paths. Other re-export documentation and links are ignored. |
| [inherited-accessors-base.ts](inherited-accessors-base.ts), [inherited-accessors.ts](inherited-accessors.ts), and [inherited-accessors-consumer.ts](inherited-accessors-consumer.ts) | TS6/TS7 producers and consumers verify generic getter/setter views, read-only and write-only accessors, mapped mutable/readonly/optional properties, protected/private visibility, local overrides, original documentation identities, model corruption rejection, and heritage fallbacks. |
| [accessor-documentation.d.ts](accessor-documentation.d.ts) | Getter-only, setter-only, both, absent, empty, and metadata-only documentation; reciprocal pair identities; static/instance and computed-name boundaries; declaration-order independence; inherited reports; and malformed-pair rejection. |
| [unused.d.ts](unused.d.ts) | Missing and incompatible selected dependencies must fail even when no documentation references them. |
| [conditional-entry.d.ts](conditional-entry.d.ts) | The same package import resolves through actual Node and browser export conditions. |
| [platform.d.ts](platform.d.ts) | Equal platform contracts produce equal reports; an intentional browser-only return-type change produces a parity failure. |

Ordinary inline comments explain each declaration's role separately from the TSDoc under test.
Suite tests also reuse the native ambient-module inputs to check namespace-export documentation inheritance and original link provenance without compiler lookup of the qualified reference.
The namespace wrapper's statement documentation is separate from the merged ambient module's documentation.
Keep absent, empty, and tag-only comments unchanged when editing fixture explanations.
The suite tests intentionally substitute reference text and return literals in copied files.
Preserve those exact replacement anchors.

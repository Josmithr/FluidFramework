# Dependency suite inputs

[suite.test.ts](../../suite.test.ts) copies these declaration inputs into temporary installed-package layouts.
It generates dependency models through the public API before analyzing consumers.
The transitive freshness test uses these same inputs in a three-package chain.
Regenerating only the leaf model must invalidate inherited content stored in the intermediate model.
Reformatting model JSON without changing its content must remain valid.
Package manifests, TypeScript project configurations, and intentional artifact corruption are test-owned runtime data.
Tests do not update accepted baselines or modify production package inputs.

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
| [unused.d.ts](unused.d.ts) | Missing and incompatible selected dependencies must fail even when no documentation references them. |
| [conditional-entry.d.ts](conditional-entry.d.ts) | The same package import resolves through actual Node and browser export conditions. |
| [platform.d.ts](platform.d.ts) | Equal platform contracts produce equal reports; an intentional browser-only return-type change produces a parity failure. |

Ordinary inline comments explain each declaration's role separately from the TSDoc under test.
Suite tests also reuse the native ambient-module inputs to check inherited merged documentation and original link provenance without compiler lookup of the qualified reference.
Keep absent, empty, and tag-only comments unchanged when editing fixture explanations.
The suite tests intentionally substitute reference text and return literals in copied files.
Preserve those exact replacement anchors.

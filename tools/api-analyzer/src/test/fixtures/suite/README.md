# Dependency suite inputs

[suite.test.ts](../../suite.test.ts) copies these declaration inputs into temporary installed-package layouts.
It generates dependency models through the public API before analyzing consumers.
Package manifests, TypeScript project configurations, and intentional artifact corruption are test-owned runtime data.
Tests do not update accepted baselines or modify production package inputs.

| Fixture | Validation role |
| --- | --- |
| [dependency.d.ts](dependency.d.ts) | Public-to-beta links, internal reference policy, and a generic automatic-inheritance source. |
| [consumer.d.ts](consumer.d.ts) | Qualified inheritance and links, dependency aliases, automatic implementation documentation, and original-package lookup despite a same-named internal consumer API. |
| [unused.d.ts](unused.d.ts) | Missing and incompatible selected dependencies must fail even when no documentation references them. |
| [conditional-entry.d.ts](conditional-entry.d.ts) | The same package import resolves through actual Node and browser export conditions. |
| [platform.d.ts](platform.d.ts) | Equal platform contracts produce equal reports; an intentional browser-only return-type change produces a parity failure. |

Ordinary inline comments explain each declaration's role separately from the TSDoc under test.
Keep absent, empty, and tag-only comments unchanged when editing fixture explanations.
The suite tests intentionally substitute reference text and return literals in copied files.
Preserve those exact replacement anchors.

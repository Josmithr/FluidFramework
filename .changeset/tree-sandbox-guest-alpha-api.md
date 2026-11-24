---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Sandbox guests support the existing alpha tree operations

Use `asAlpha(guest.tree)` to export the guest's content or stored schema, read its stored schema version, or fork an independent branch.
Disposing a view leaves the guest's synchronization branch available for another view.

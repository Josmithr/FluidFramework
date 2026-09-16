# Shared API inputs

The native-capability, session, and lifecycle suites copy these files into the temporary project's `src` directory.
Suite-specific files are copied separately.

- [api.ts](api.ts) defines generic inheritance, intersections, utility types, readonly properties, callable overloads, and a class with private state.
- [index.ts](index.ts) exposes renamed exports, type-only exports, and a namespace export.
- [reportFunctions.ts](reportFunctions.ts) supplies overloads and an alias for report snapshots and release selection.

The overload-reordering test depends on the adjacent overload declarations and their comments in [api.ts](api.ts).
Keep each comment attached to its overload when changing that fixture.
The report fixture uses the configured custom modifier `@partner`.

These inputs test selected compiler capabilities, not complete support for every TypeScript declaration form.

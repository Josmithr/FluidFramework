/*
 * Validates type-only status through a second re-export and a renamed binding.
 * Renamed and star-exported types must retain the export restrictions established in extra.ts.
 */

// This statement has no type keyword, but its target is already restricted to type-only use.
export { OnlyIdentity as Renamed } from "./extra.js";
// Preserve upstream type-only APIs while retaining the merged namespace's value export.
export * from "./extra.js";

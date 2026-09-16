/*
 * Validates type-only status through a second re-export and a renamed binding.
 * Renamed and star-exported types must retain the export restrictions established in extra.ts.
 */

export { OnlyIdentity as Renamed } from "./extra.js";
export * from "./extra.js";

/*
 * Validates original-scope API link lookup through a re-export.
 * Unqualified links resolve base in documentation-links.ts; example#base resolves the exported variable here.
 */

export { linked } from "./documentation-links.js";
// This unrelated variable makes an incorrect lookup in the entrypoint observably different.
export declare const base: boolean;

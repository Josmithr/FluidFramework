/*
 * Validates original-scope API link lookup through a re-export.
 * Links in linked must resolve base in documentation-links.ts, not the variable declared here.
 */

export { linked } from "./documentation-links.js";
export declare const base: boolean;

/*
 * Validates inheritance lookup in the original declaration scope after a re-export.
 * Derived must bind to base in inheritance.ts, not the incompatible function declared here.
 */

export { derived } from "./inheritance.js";
// This incompatible same-named function exposes an incorrect switch to the re-exporting module's scope.
export declare function base(wrong: number): number;

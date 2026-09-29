/* Supplies a mixed-release overload set whose package reference cannot select one signature. */

import type { Result as ImportedResult } from "./types.js";
export { Result as ResultValue } from "./types.js";
export type { Result as Output } from "./types.js";

/**
 * Public callable signature.
 * @privateRemarks Producer-only detail.
 * @public
 */
export declare function convert(value: string): string;

/** Single-signature syntax uses the same source facts. @public */
export declare function single(value: string): string;

/** Another selected callable signature. @public */
export declare function convert(value: boolean): boolean;

/** Preview callable signature. @beta */
export declare function convert(value: number): number;

/** Preserves a generic nominal constraint. @public */
export declare function preserve<Value extends ImportedResult>(value: Value): Value;

/** Preview nominal overload. @beta */
export declare function preserve(value: number): ImportedResult;

/** Atomic compound function. @public */
export declare function compound(value: string): string;
/** Another atomic overload. @public */
export declare function compound(value: number): number;
/** Atomic namespace; members are not selected independently. @public */
export declare namespace compound {
	const version: string;
}

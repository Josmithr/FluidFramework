/*
 * Validates inheritance through an imported alias from another module in the same package.
 * Lookup must resolve imported to the original base function in inheritance.ts.
 */

import { base as imported } from "./inheritance.js";
export { imported };
/** {@inheritDoc imported} @public */
export declare function derived(value: string): string;

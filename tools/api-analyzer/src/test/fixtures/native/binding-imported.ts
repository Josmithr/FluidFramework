/*
 * Validates inheritance through an imported alias from another module in the same package.
 * Lookup must resolve imported to the original base function in inheritance.ts.
 */

import { base as imported } from "./inheritance.js";
// Keep the alias in emitted declarations; its use in TSDoc alone does not retain the import.
export { imported };
/** {@inheritDoc imported} @public */
// The local alias must resolve to the declaration in the original module before parameter validation.
export declare function derived(value: string): string;

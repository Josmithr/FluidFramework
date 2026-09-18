/*
 * A normal re-export must preserve a target's type-only restriction.
 * The star export also makes the original value aliases type-only on this surface.
 */
export { TypeMode as ChainedMode, typeVersion as chainedVersion } from "./type-only-values.js";
export type * from "./type-only-values.js";

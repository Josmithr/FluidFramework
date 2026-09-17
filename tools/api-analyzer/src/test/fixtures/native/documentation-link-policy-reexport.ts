/*
 * Re-exports a linked function while exposing a different internal function named base.
 * Link policy must use the original beta target, not this entrypoint's internal target.
 */

// The exported alias still owns the original declaration's comment and link lookup scope.
export { linked as renamed } from "./documentation-link-policy.js";
/** Unrelated entrypoint target. @internal */
// Using this internal target would incorrectly reject the original public-to-beta link.
export declare function base(): void;

/*
 * Re-exports a linked function while exposing a different internal function named base.
 * Link policy must use the original beta target, not this entrypoint's internal target.
 */

export { linked as renamed } from "./documentation-link-policy.js";
/** Unrelated entrypoint target. @internal */
export declare function base(): void;

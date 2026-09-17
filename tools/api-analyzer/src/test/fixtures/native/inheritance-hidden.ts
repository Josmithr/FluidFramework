/*
 * Validates inheritance from a function that is not exported and retention of its detached facts.
 * KeepHidden forces declaration emit to retain hidden; a documentation reference alone does not.
 */

/** Hidden summary. @internal */
declare function hidden(value: string): string;
// The type query retains hidden in emitted declarations without exporting its value.
export type KeepHidden = typeof hidden;
/** {@inheritDoc hidden} @public */
// The hidden source must be collected for resolution even though it is not an entrypoint export.
export declare function derived(value: string): string;

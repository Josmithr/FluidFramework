/*
 * Validates inheritance from a function that is not exported and retention of its detached facts.
 * KeepHidden forces declaration emit to retain hidden; a documentation reference alone does not.
 */

/** Hidden summary. @internal */
declare function hidden(value: string): string;
export type KeepHidden = typeof hidden;
/** {@inheritDoc hidden} @public */
export declare function derived(value: string): string;

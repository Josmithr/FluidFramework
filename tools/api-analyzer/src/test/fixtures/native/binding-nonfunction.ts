/*
 * Validates that successful name lookup does not establish a valid inheritance target.
 * Lookup resolves base, but binding rejects it because it is a variable, not a standalone function.
 */

export declare const base: string;
/** {@inheritDoc base} @public */
export declare function derived(value: string): string;

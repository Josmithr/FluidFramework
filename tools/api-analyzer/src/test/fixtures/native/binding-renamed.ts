/*
 * Validates rejection of parameter names that do not match.
 * Equal parameter types do not authorize renaming inherited parameter documentation.
 */

export declare function base(input: string): string;
/** {@inheritDoc base} @public */
// The binder must not adapt documentation from input to value, despite identical types.
export declare function derived(value: string): string;

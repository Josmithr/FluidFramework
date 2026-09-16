/*
 * Validates rejection of rest parameter flags that do not match.
 * Both parameters have the same name and array type, but only base uses a rest parameter.
 */

export declare function base(...value: string[]): string;
/** {@inheritDoc base} @public */
export declare function derived(value: string[]): string;

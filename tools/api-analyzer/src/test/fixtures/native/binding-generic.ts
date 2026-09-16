/*
 * Validates rejection of type parameter lists that do not match.
 * The target has a type parameter, but derived has no corresponding type parameter.
 */

export declare function base<Value>(value: Value): string;
/** {@inheritDoc base} @public */
export declare function derived(value: string): string;

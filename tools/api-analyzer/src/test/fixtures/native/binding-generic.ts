/*
 * Validates rejection of type parameter lists that do not match.
 * The target has a type parameter, but derived has no corresponding type parameter.
 */

export declare function base<Value>(value: Value): string;
/** {@inheritDoc base} @public */
// The value parameter keeps the same name; the missing type parameter is the incompatibility under test.
export declare function derived(value: string): string;

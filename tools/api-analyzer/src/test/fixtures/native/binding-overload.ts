/*
 * Validates rejection of a target with multiple callable signatures.
 * Even though one overload matches derived, binding must not select it implicitly.
 */

export declare function base(value: string): string;
export declare function base(value: number): number;
/** {@inheritDoc base} @public */
// Matching the string overload is insufficient without an explicit one-based selector.
export declare function derived(value: string): string;

/*
 * Validates rejection of a target with multiple callable signatures.
 * Even though one overload matches derived, binding must not select it implicitly.
 */

export declare function base(value: string): string;
export declare function base(value: number): number;
/** {@inheritDoc base} @public */
export declare function derived(value: string): string;

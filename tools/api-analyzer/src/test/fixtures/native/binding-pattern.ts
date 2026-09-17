/*
 * Validates rejection of a destructured target parameter.
 * The property named value must not be treated as a parameter identifier matching derived.
 */

// The binding pattern has no single parameter identifier; value names a destructured property.
export declare function base({ value }: { value: string }): string;
/** {@inheritDoc base} @public */
export declare function derived(value: string): string;

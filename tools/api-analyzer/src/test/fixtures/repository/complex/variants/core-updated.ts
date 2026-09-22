/* Changes only source documentation to test transitive model invalidation. */
/**
 * Core target documentation.
 * @beta
 */
export function target(value: string): string { return value; }
/**
 * Updated core documentation. See {@link target}.
 * @public
 */
export function source(value: string): string { return value; }
/**
 * Generic conversion contract.
 * @public
 */
export interface Contract<TValue> {
    /** Converts a value. */
    convert(value: TValue): TValue;
}

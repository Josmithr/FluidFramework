/* Origin package for cross-package type references and inherited documentation. */
/**
 * Core target documentation.
 * @beta
 */
export function target(value: string): string { return value; }
/**
 * Core source documentation. See {@link target}.
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

/* Internal metadata does not permit a public documentation link to this target. */
/**
 * Internal target.
 * @internal
 */
export function target(value: string): string { return value; }
/**
 * Invalid beta link, excluded from a public-only report. See {@link target}.
 * @beta
 */
export function source(value: string): string { return value; }
/**
 * Generic contract.
 * @public
 */
export interface Contract<TValue> {
    /** Converts a value. */
    convert(value: TValue): TValue;
}

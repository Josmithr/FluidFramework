/*
 * Supplies documented overloads and an alias for release selection and complete report snapshots.
 * Public and internal signatures must remain independently selectable.
 * The custom partner modifier and type-only alias exercise metadata display and exported binding names.
 */

/** @public @partner */
// Public reports include only this overload and can display its configured partner modifier.
export function convert(value: string): string;
/** @internal */
// Complete reports also include this independently classified internal overload.
export function convert(value: number): number;
// The implementation must not add an extra callable signature to the report.
export function convert(value: string | number): string | number {
	return value;
}

// The type-only alias shares the declaration without exposing a second function implementation.
export type { convert as alias };

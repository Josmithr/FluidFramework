/*
 * Supplies documented overloads and an alias for release selection and complete report snapshots.
 * Public and internal signatures must remain independently selectable.
 * The custom partner modifier and type-only alias exercise metadata display and exported binding names.
 */

/** @public @partner */
export function convert(value: string): string;
/** @internal */
export function convert(value: number): number;
export function convert(value: string | number): string | number {
	return value;
}

export type { convert as alias };

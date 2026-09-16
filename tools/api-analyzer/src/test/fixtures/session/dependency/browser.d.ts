/*
 * Supplies the dependency declaration selected by the browser package export condition.
 * Its literal property type distinguishes browser resolution from default Node resolution.
 */

export interface Environment {
	value: "browser";
}

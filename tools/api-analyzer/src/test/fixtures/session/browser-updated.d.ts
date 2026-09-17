/*
 * Replaces the browser dependency declaration after an initial analysis.
 * Fresh analysis must expose the updated literal type instead of reusing stale dependency facts.
 */

export interface Environment {
	value: "updated";
}

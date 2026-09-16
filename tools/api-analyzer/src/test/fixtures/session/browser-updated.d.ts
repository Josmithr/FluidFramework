/*
 * Replaces the browser dependency declaration after an initial analysis.
 * Session invalidation must expose the updated literal type instead of reusing cached dependency facts.
 */

export interface Environment {
	value: "updated";
}

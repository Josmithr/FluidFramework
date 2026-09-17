/*
 * Retains declaration references to unexported targets independently of report selection.
 * Source spelling must survive alias resolution.
 */

/** Less stable contract. @beta @legacy */
// This unexported target exercises release compatibility and a directional custom-tag rule.
interface HiddenContract {
	/** Value content. @beta */
	// Keep member metadata valid so policy tests reach the intended type-reference checks.
	value: string;
}

/** Public operation with a less stable reference. @public */
// Parameter and return annotations retain separate occurrences of the same unexported target.
export declare function useHidden(value: HiddenContract): HiddenContract;

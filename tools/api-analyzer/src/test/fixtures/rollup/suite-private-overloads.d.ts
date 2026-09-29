/* Requires a diagnostic instead of copying a private dependency class into a facade. */

/** Unexported nominal result. @public */
declare class Hidden {
	private state;
}

/** Public overload referencing an inaccessible nominal type. @public */
declare function convert(value: string): Hidden;

/** Preview overload. @beta */
declare function convert(value: number): Hidden;

export { convert };

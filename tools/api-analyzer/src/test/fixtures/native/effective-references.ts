/*
 * Effective inherited members must retain references introduced by generic substitution.
 * Named targets are preserved while anonymous structures are traversed by the compiler type graph.
 */
/**
 * Contract retained through substitution.
 * @beta
 */
export interface Preview { value: string; }
/**
 * Generic source.
 * @public
 */
export interface Base<Value> {
	/**
	 * Structured result.
	 */
	result: { nested: readonly Value[] };
	/**
	 * Callable result.
	 */
	get(): Value | undefined;
	/**
	 * Tuple substitution.
	 */
	tuple: [Value, ...Value[]];
	/**
	 * Dictionary substitution.
	 */
	dictionary: { [key: string]: Value };
	/**
	 * Callback substitution.
	 */
	callback: (value: Value) => Value;
	/**
	 * Reduced conditional substitution.
	 */
	conditional: Value extends string ? never : Value;
}
/**
 * Instantiated view.
 * @beta
 */
export interface Derived extends Base<Preview> {}

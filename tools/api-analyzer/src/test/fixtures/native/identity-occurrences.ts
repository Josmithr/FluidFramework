/*
 * Distinguishes lexical occurrences that share compiler names or printed signatures.
 * Reversed links must preserve destinations, and substitution must not merge overloads.
 */

/**
 * Nested property owners.
 * @public
 */
export interface Outer {
	first: {
		/** First nested value. */
		value: string;
	};
	second: {
		/** Second nested value. */
		value: number;
	};
}

/**
 * See {@link Outer.first.value} and {@link Outer.second.value}.
 * @public
 */
export declare function forward(): void;

/**
 * See {@link Outer.second.value} and {@link Outer.first.value}.
 * @public
 */
export declare function reverse(): void;

/**
 * Overloads with different original parameter types.
 * @public
 */
export interface Base<TValue> {
	/** Generic overload. */
	method(value: TValue): string;
	/** String overload. */
	method(value: string): string;
}

/**
 * Both effective signatures accept strings.
 * @public
 */
export interface Derived extends Base<string> {}

/**
 * Identical syntax still has separate original documentation.
 * @public
 */
export interface Repeated {
	/** First call. */
	(value: string): string;
	/** Second call. */
	(value: string): string;
}

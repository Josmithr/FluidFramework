/*
 * Separates authored declarations, instantiated signatures, and reduced report syntax.
 * Named types and parameter shape remain meaningful even when their types can be reduced further.
 */

/**
 * A named text value.
 * @public
 */
// Reducing this alias to string must not erase its name from the report signature.
export type Label = string;

/**
 * A branded text value.
 * @public
 */
// Both resolved views must retain the brand rather than widen it to plain string.
export type Token = string & { readonly brand: "Token" };

/**
 * An application-defined utility name.
 * @public
 */
// This is not the standard library's Pick type; name-based utility detection would misclassify it.
export type Pick<Value> = { value: Value };

/**
 * A receiver with a text value.
 * @public
 */
export interface View {
	/**
	 * The receiver's text.
	 * @public
	 */
	value: string;
}

/**
 * Reads the argument type of a local helper.
 * @public
 */
// The report needs the resolved string type, not a utility expression containing a private helper.
export declare function computed(value: Parameters<typeof helper>[0]): ReturnType<typeof helper>;
declare function helper(value: string): string;

/**
 * Preserves a named argument and result.
 * @public
 */
export declare function named(value: Label): Label;

/**
 * Preserves a branded argument and result.
 * @public
 */
export declare function branded(value: Token): Token;

/**
 * Uses an application-defined utility alias.
 * @public
 */
export declare function shadow(value: Pick<string>): Pick<string>;

/**
 * Uses a generic compiler utility.
 * @public
 */
// A generic mapped type can remain symbolic after resolution.
export declare function mapped<Value>(value: Readonly<{ value: Value }>): Readonly<{ value: Value }>;

/**
 * Accepts an optional nullable argument.
 * @public
 */
// Resolution adds undefined to the value type; report syntax should keep the existing question token.
export declare function optional(value?: string | null): void;

/**
 * Accepts a fixed tuple of arguments.
 * @public
 */
// One authored rest parameter can expand into two parameters in a compiler-printed signature.
export declare function tuple(...values: [first: string, second?: number]): void;

/**
 * Returns a generic argument tuple.
 * @public
 */
// A rest parameter's array type must not be replaced with its first argument's element type.
export declare function genericRest<Args extends readonly unknown[]>(...args: Args): Args;

/**
 * Reads a property from a generic input.
 * @public
 */
// This indexed access must remain symbolic because the type parameter is not instantiated.
export declare function genericReturn<Value extends View>(value: Value): Value["value"];

/**
 * Uses an explicit receiver.
 * @public
 */
// The this parameter is separate from the compiler's ordinary parameter-symbol list.
export declare function receiver(this: View, value: Parameters<typeof helper>[0]): string;

/**
 * Checks a receiver shape.
 * @public
 */
// The ordinary return type is boolean; retaining the predicate is necessary for narrowing.
export declare function predicate(value: unknown): value is View;

/**
 * Requires a receiver shape.
 * @public
 */
// The ordinary return type is void; retaining the assertion is necessary for narrowing.
export declare function assertion(value: unknown): asserts value is View;

/**
 * Requires a present value.
 * @public
 */
// An assertion without a target type must not become an ordinary void return.
export declare function present(value: unknown): asserts value;
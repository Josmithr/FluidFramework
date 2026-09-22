/* Exercises named and computed type aliases while retaining unexported supporting declarations. */
/**
 * Unexported shape required by an exported alias.
 * @public
 */
interface Support { readonly text: string; }
/**
 * Primitive alias.
 * @public
 */
export type Label = string;
/**
 * Literal union.
 * @public
 */
export type Choice = "on" | "off";
/**
 * Intersection with an unexported shape.
 * @public
 */
export type RecordValue = Support & {
	/**
	 * Stored count.
	 * @public
	 */
	readonly count: number;
};
/**
 * Generic mapped view.
 * @public
 */
export type Flags<TValue> = { readonly [TKey in keyof TValue]?: boolean };
/**
 * Conditional element view.
 * @public
 */
export type Element<TValue> = TValue extends readonly (infer TItem)[] ? TItem : TValue;
/**
 * Indexed lookup.
 * @public
 */
export type Text = Support["text"];
/**
 * Standard utility composition.
 * @public
 */
export type OptionalRecord = Readonly<Partial<RecordValue>>;
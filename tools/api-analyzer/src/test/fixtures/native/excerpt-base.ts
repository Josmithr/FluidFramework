/*
 * Supplies generic source declarations and a same-named type for cross-file excerpt references.
 * Receivers in excerpt-references.ts must not link substituted types to this file's Value.
 */

/**
 * Base-file value, distinct from the receiver's value.
 * @public
 */
export interface Value { base: number; }

/**
 * Generic source whose printed members must retain the receiver's substituted targets.
 * @public
 */
export interface GenericBase<Item> {
	/**
	 * Converts one item.
	 */
	convert(value: Item): Item;
	/**
	 * Stores one item.
	 */
	item: Item;
	/**
	 * Stores a substitution inside an anonymous type-literal symbol.
	 */
	boxed: { value: Item };
	/**
	 * Returns a substitution inside an anonymous type-literal symbol.
	 */
	box(): { value: Item };
}

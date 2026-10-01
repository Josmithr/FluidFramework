/* Supplies a tagged nominal class and an untagged public API for package-export selection. */

/**
 * Stores a text value.
 * @public
 * @sealed
 */
export declare class Store {
	// Private state requires both entrypoints to share the same declaration identity.
	private state;

	/**
	 * Reads the stored text.
	 */
	// Members remain available when their container is selected, without their own sealed tag.
	read(): string;
}

/**
 * Returns the supplied text.
 * @param value - Text to return.
 * @returns The supplied text.
 * @public
 */
export declare function ordinary(value: string): string;

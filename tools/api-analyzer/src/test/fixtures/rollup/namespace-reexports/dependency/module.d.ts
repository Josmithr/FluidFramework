/* Supplies beta module exports with the same consumer shape as the named namespace. */

/**
 * A preview value.
 * @beta
 */
// Private state makes a copied declaration incompatible with the dependency type.
export declare class Value {
	private brand;
	value: string;
}

/**
 * Preview options.
 * @beta
 */
export interface Shape {
	value: string;
}

/**
 * Preview marker.
 * @beta
 */
export declare const marker: "namespace";

/**
 * Nested preview tools.
 * @beta
 */
export declare namespace Nested {
	class Local {
		private brand;
		value: string;
	}
	// The original name must stay hidden while the alias retains both type and value sides.
	export { Local as Alias };
}

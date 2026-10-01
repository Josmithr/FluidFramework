/* Supplies a beta named namespace with type, value, and nested export-list members. */

/**
 * Preview tools.
 * @beta
 */
export declare namespace Tools {
	// Private state makes a copied declaration incompatible with the dependency type.
	export class Value {
		private brand;
		value: string;
	}
	export interface Shape {
		value: string;
	}
	export const marker: "namespace";
	export namespace Nested {
		class Local {
			private brand;
			value: string;
		}
		// The original name must stay hidden while the alias retains both type and value sides.
		export { Local as Alias };
	}
}

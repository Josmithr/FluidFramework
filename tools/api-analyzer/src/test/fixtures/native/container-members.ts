/*
 * Containers retain all supported members regardless of member tags used by output filters.
 * Untagged members inherit release levels, but not descriptive comments or custom tags.
 */

/**
 * Public base declaration.
 * @public
 */
export interface BaseContainer {
	// This original public member remains public in the beta derived view.
	inherited: string;
}

/**
 * A beta derived declaration.
 * @beta
 */
export interface DerivedContainer extends BaseContainer {
	// This local member inherits beta, independently of the inherited member's public classification.
	local: string;
}

/**
 * A class with complete construction and static contracts.
 * @public
 * @selected
 */
export declare class WholeClass {
	// Constructor overloads are indivisible and retain their declared accessibility.
	private constructor(value: string);
	private constructor(value: number);
	/**
	 * Keep constructor accessibility independently of release tags.
	 * @omit
	 */
	private constructor();
	/**
	 * A required static factory.
	 * @omit
	 */
	static create(): WholeClass;
	/**
	 * A property excluded by a tag filter must remain with its class.
	 * @omit
	 */
	value: string;
	get label(): string;
	set label(value: string);
	method(value: string): string;
	method(value: number): number;
}

/**
 * A contract with special signatures.
 * @public
 * @selected
 */
export interface WholeInterface {
	// These signatures have no individual member symbol but still inherit the interface release level.
	(value: string): string;
	new (value: string): WholeClass;
	[key: string]: unknown;
	/**
	 * Retain this property even when its custom tag is excluded.
	 * @omit
	 */
	property: string;
}

/**
 * An enum whose values remain together.
 * @public
 * @selected
 */
export declare enum WholeEnum {
	First = 1,
	/**
	 * This value must not be filtered separately.
	 * @omit
	 */
	Second = 2,
}

/**
 * A recursively selected namespace.
 * @public
 * @selected
 */
export declare namespace WholeNamespace {
	// Both the namespace and its nested declarations inherit public release metadata.
	namespace Nested {
		/**
		 * A tagged export still belongs to the selected namespace.
		 * @omit
		 */
		function operation(): void;
		class Child {
			value: string;
		}
	}
	// A recursive alias must terminate without dropping other namespace exports.
	export import self = WholeNamespace;
}

/**
 * The public standalone overload stays independently selectable.
 * @public
 */
export declare function standalone(value: string): string;
/**
 * The beta standalone overload is excluded from a public report.
 * @beta
 */
export declare function standalone(value: number): number;

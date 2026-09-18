/*
 * Resolves explicit member sides and numeric callable selectors without conflating identities.
 * All class members share the container release level; standalone overloads have separate levels.
 */

/**
 * Source members with distinct static and instance documentation.
 * @public
 */
export declare class ReferenceSource {
	/**
	 * Static operation documentation.
	 */
	static operation(value: string): string;
	/**
	 * Instance operation documentation.
	 */
	operation(value: string): string;
	/**
	 * An unambiguous static operation.
	 */
	static unique(value: string): string;
}

/**
 * Public overload documentation.
 * @public
 */
export declare function overloaded(value: string): string;
/**
 * Internal overload documentation.
 * @internal
 */
export declare function overloaded(value: number): number;

/**
 * Links to {@link ReferenceSource.(operation:static)}, {@link ReferenceSource.(operation:instance)},
 * {@link ReferenceSource.unique}, and {@link (overloaded:1)}.
 * @public
 */
// Member selectors retain separate targets even though both declarations have the same name.
export declare function links(): void;

/**
 * {@inheritDoc ReferenceSource.(operation:static)}
 * @public
 */
export declare function fromStatic(value: string): string;

/**
 * {@inheritDoc ReferenceSource.(operation:instance)}
 * @public
 */
export declare function fromInstance(value: string): string;

/**
 * Recursive exported operations.
 * @public
 */
export declare namespace Group {
	/**
	 * Operation retained through recursive aliases.
	 */
	export function run(): void;
	// Models must represent this as a finite alias rather than unrolling every possible path.
	export import self = Group;
}

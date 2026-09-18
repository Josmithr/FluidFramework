/*
 * Supplies a dependency model with a linked function and an original beta target.
 */

// Keep the module overview separate from the first tested documentation block.
export {};

/** Original target. @beta */
// This target's original release level permits links from public APIs.
export declare function target(value: string): string;

/** Source documentation. See {@link target}. @public */
// Models must preserve the unqualified link's original package through inheritance and re-exports.
export declare function source(value: string): string;

/** Internal documentation source. @internal */
// Used by negative link tests and the configurable explicit-inheritance visibility rule.
export declare function internalSource(value: string): string;

/**
 * Preview representation.
 *
 * @beta
 */
// Import-type references must retain this release level without a named import in the consumer.
export type Preview = string;

/** Generic source contract. @public */
// Consumer implementations substitute string without replacing their own signature text.
export interface Contract<Value> {
	/** Original operation. @public */
	// This descriptive content supplies automatic inheritance through the selected dependency model.
	operation(value: Value): Value;
}

// Consumers reference this exported alias, not the original interface name.
export type { Contract as AliasContract };

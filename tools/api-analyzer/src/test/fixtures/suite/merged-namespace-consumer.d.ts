/*
 * Resolves combined namespace and nested-member targets from a serialized dependency model.
 * The recursive alias must expose members contributed by either namespace declaration.
 */

/**
 * Links to {@link dependency#Services} and {@link dependency#Services.self.Nested.left}.
 * @public
 */
export declare function links(): void;

/**
 * {@inheritDoc dependency#Services.self.second}
 * @public
 */
export declare function fromSecond(): void;

/**
 * {@inheritDoc dependency#Services.self.Nested.right}
 * @public
 */
export declare function fromNested(): void;

/*
 * Supplies a documentation inheritance chain with a link in the original module.
 * Public receivers may inherit the internal base's link to the beta target.
 */

/** Target. @beta */
export declare function target(): void;
/** See {@link target}. @internal */
export declare function base(): void;
/** {@inheritDoc base} @beta */
export declare function middle(): void;

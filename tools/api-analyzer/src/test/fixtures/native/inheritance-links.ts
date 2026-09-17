/*
 * Supplies a documentation inheritance chain with a link in the original module.
 * Public receivers may inherit the internal base's link to the beta target.
 */

/** Target. @beta */
// This beta declaration is the original link target even when a re-exporting module defines target.
export declare function target(): void;
/** See {@link target}. @internal */
// Inherited content may include this link, but must not copy the internal release tag.
export declare function base(): void;
/** {@inheritDoc base} @beta */
// The intermediate receiver extends the inheritance path before re-exporting tests add another receiver.
export declare function middle(): void;

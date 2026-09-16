/*
 * Validates source-based extraction of absent, empty, ordinary, and attached documentation comments.
 * Only documentation comments become signature documentation, without the function declaration text.
 */

export declare function absent(): void;
/** */
export declare function empty(): void;
/* Ordinary comment. */
export declare function ordinary(): void;
/** Documented. @public */
export declare function documented(): void;

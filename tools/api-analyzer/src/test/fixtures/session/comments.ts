/*
 * Validates source-based extraction of absent, empty, ordinary, and attached documentation comments.
 * Only documentation comments become signature documentation, without the function declaration text.
 */

// No attached comment must remain different from the explicit empty TSDoc below.
export declare function absent(): void;
/** */
// Do not fill in this comment: an empty local TSDoc is the input being tested.
export declare function empty(): void;
// The ordinary block is intentionally not TSDoc and must yield no signature documentation.
/* Ordinary comment. */
export declare function ordinary(): void;
/** Documented. @public */
// Extraction retains this comment without including the declaration source text.
export declare function documented(): void;

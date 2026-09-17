/*
 * Validates comment retention through declaration emit and compiler disposal.
 * Absent and ordinary comments yield no documentation; an empty documentation comment stays empty.
 * Of two attached documentation comments, only the closest comment is retained.
 */

// No TSDoc must remain different from the explicitly empty comment on empty.
export declare function absent(): void;
/** */
// Preserve this empty TSDoc; it is present documentation and suppresses automatic inheritance.
export declare function empty(): void;
// A non-TSDoc block must not become signature documentation.
/* Ordinary comment. */
export declare function ordinary(): void;
/** Earlier. @internal */
/** Closest. @public */
// Keep the two comments adjacent: extraction must retain only the closest attached TSDoc.
export declare function documented(): void;

/*
 * Validates comment retention through declaration emit and analysis-session disposal.
 * Absent and ordinary comments yield no documentation; an empty documentation comment stays empty.
 * Of two attached documentation comments, only the closest comment is retained.
 */

export declare function absent(): void;
/** */
export declare function empty(): void;
/* Ordinary comment. */
export declare function ordinary(): void;
/** Earlier. @internal */
/** Closest. @public */
export declare function documented(): void;

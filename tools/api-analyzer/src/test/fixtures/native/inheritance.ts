/*
 * Validates explicit same-package inheritance between compatible function signatures.
 * Derived receives the summary, parameter, and return documentation without the target's release tag.
 * Both declaration-build compilers must produce the shared resolved-comment snapshot.
 */

/** Converts a value.
 * @param value - Input value.
 * @returns The input.
 * @internal
 */
// This internal function supplies inherited content but must not make the public receiver internal.
export declare function base(value: string): string;
/** {@inheritDoc base} @public */
// Matching parameter names and flags allow copying the param and returns sections unchanged.
export declare function derived(value: string): string;

/*
 * Validates same-package API links independently of public report selection.
 * Aliases, repeated links, self-links, and mutual links retain their original targets.
 * Parameter shapes differ deliberately: links do not copy parameter documentation.
 * KeepHidden retains the unexported beta target through declaration emission.
 */

/** Back reference: {@link linked}. @beta */
// The number parameter differs from linked's string parameter; links require no parameter compatibility.
export declare function base(other: number): number;
// Both spellings must resolve to the same target declaration.
export { base as alias };
/** Hidden target. @beta */
declare function hidden(): void;
// Retain the unexported target in emitted declarations without exporting it as a value.
export type KeepHidden = typeof hidden;
/** {@link base} {@link alias} {@link hidden} {@link linked}
 * {@link https://example.invalid | Website}
 * @remarks See {@link base | Base function}.
 * @public
 */
// This comment combines valid public-to-beta links, a self-link, repeated targets, and a URL.
export declare function linked(value: string): string;

/*
 * Validates same-package API links independently of public report selection.
 * Aliases, repeated links, self-links, and mutual links retain their original targets.
 * Parameter shapes differ deliberately: links do not copy parameter documentation.
 * KeepHidden retains the unexported beta target through declaration emission.
 */

/** Back reference: {@link linked}. @beta */
export declare function base(other: number): number;
export { base as alias };
/** Hidden target. @beta */
declare function hidden(): void;
export type KeepHidden = typeof hidden;
/** {@link base} {@link alias} {@link hidden} {@link linked}
 * {@link https://example.invalid | Website}
 * @remarks See {@link base | Base function}.
 * @public
 */
export declare function linked(value: string): string;

/*
 * Validates API link lookup for local names, imported and exported aliases, and hidden targets.
 * Overloads resolve to declarations; missing and unsupported references retain distinct outcomes.
 * Links in blocks and repeated links retain traversal order, while URL links are excluded.
 * Self-links and the base-to-linked cycle must terminate collection without losing target facts.
 * KeepHidden preserves the hidden declaration through emit. Lookup does not validate link policies.
 */

import { base as imported } from "./inheritance.js";
// Re-export the imported alias so declaration emission retains it for documentation lookup.
export { imported };
/** Back reference: {@link linked}. @beta */
// This local base and the imported base have the same original name but different identities.
// Its back reference also forms a collection cycle with linked.
export declare function base(other: number): number;
// This export-only name exercises lookup after lexical name resolution finds no local alias.
export { base as alias };
/** Hidden target. @internal */
// Lookup must retain a resolved non-callable target even though later link validation rejects it.
declare const hidden: string;
// Documentation links alone do not make the compiler retain an unexported declaration.
export type KeepHidden = typeof hidden;
// Lookup identifies the overloaded declaration without choosing an individual signature.
export declare function overloaded(value: string): string;
export declare function overloaded(value: number): number;
/** {@link base} {@link imported} {@link alias} {@link hidden} {@link overloaded}
 * {@link missing} {@link example#base} {@link (base:1)} {@link linked}
 * {@link https://example.com | Website}
 * @remarks See {@link imported | Imported target}.
 * @param value - See {@link base}.
 * @public
 */
// Link order includes nested blocks and repeats; missing names, unsupported syntax, and URLs stay distinct.
export declare function linked(value: string): string;

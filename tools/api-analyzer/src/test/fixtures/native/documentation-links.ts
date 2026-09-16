/*
 * Validates API link lookup for local names, imported and exported aliases, and hidden targets.
 * Overloads resolve to declarations; missing and unsupported references retain distinct outcomes.
 * Links in blocks and repeated links retain traversal order, while URL links are excluded.
 * Self-links and the base-to-linked cycle must terminate collection without losing target facts.
 * KeepHidden preserves the hidden declaration through emit. Lookup does not validate link policies.
 */

import { base as imported } from "./inheritance.js";
export { imported };
/** Back reference: {@link linked}. @beta */
export declare function base(other: number): number;
export { base as alias };
/** Hidden target. @internal */
declare const hidden: string;
export type KeepHidden = typeof hidden;
export declare function overloaded(value: string): string;
export declare function overloaded(value: number): number;
/** {@link base} {@link imported} {@link alias} {@link hidden} {@link overloaded}
 * {@link missing} {@link example#base} {@link (base:1)} {@link linked}
 * {@link https://example.com | Website}
 * @remarks See {@link imported | Imported target}.
 * @param value - See {@link base}.
 * @public
 */
export declare function linked(value: string): string;

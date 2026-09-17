/*
 * Validates inheritance through an export alias that is not a local declaration name.
 * Lookup must fall back to the module's exports and bind alias to base.
 */

export declare function base(value: string): string;
// An export alias does not declare a local binding named alias.
export { base as alias };
/** {@inheritDoc alias} @public */
// Resolving this name requires the module-export fallback, not lexical lookup alone.
export declare function derived(value: string): string;

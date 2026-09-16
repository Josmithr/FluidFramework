/*
 * Validates inheritance through an export alias that is not a local declaration name.
 * Lookup must fall back to the module's exports and bind alias to base.
 */

export declare function base(value: string): string;
export { base as alias };
/** {@inheritDoc alias} @public */
export declare function derived(value: string): string;

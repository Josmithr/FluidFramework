/*
 * Validates shared custom modifier configuration across classification, binding, and resolution.
 * Derived inherits the summary but retains its own release and custom tags, not the target's tags.
 * Missing custom tag definitions must produce documentation syntax diagnostics.
 */

/** Summary. @internal @sourceOnly */
export declare function base(value: string): string;
/** {@inheritDoc base} @public @localOnly */
export declare function derived(value: string): string;

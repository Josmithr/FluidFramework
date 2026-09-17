/*
 * Validates shared custom modifier configuration across classification, binding, and resolution.
 * Derived inherits the summary but retains its own release and custom tags, not the target's tags.
 * Missing custom tag definitions must produce documentation syntax diagnostics.
 */

/** Summary. @internal @sourceOnly */
// The parser must recognize sourceOnly even when the ancestor is excluded from public selections.
export declare function base(value: string): string;
/** {@inheritDoc base} @public @localOnly */
// Only descriptive content is inherited; localOnly and public remain the receiver's own metadata.
export declare function derived(value: string): string;

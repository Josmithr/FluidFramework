/*
 * Validates rejection of an unsupported overload selector even when the target exists.
 * Binding must not ignore the selector and accept the single signature of base.
 */

export declare function base(value: string): string;
/** {@inheritDoc (base:1)} @public */
export declare function derived(value: string): string;

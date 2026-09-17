/*
 * Validates rejection when the target parameter is optional and the source parameter is required.
 * Matching parameter names alone do not establish a compatible documentation binding.
 */

export declare function base(value?: string): string;
/** {@inheritDoc base} @public */
// This required parameter must not receive documentation for an optional argument.
export declare function derived(value: string): string;

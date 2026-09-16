/*
 * Supplies descriptive inheritance from an unexported internal ancestor.
 * The report must use inherited content without copying the ancestor's deprecated annotation.
 * A type query keeps the documentation-only target in emitted declarations.
 */

/** Converts a value. @deprecated Target only. @internal */
declare function base(value: string): string;
declare const keepBase: typeof base;
/** {@inheritDoc base} @public */
export declare function convert(value: Parameters<typeof keepBase>[0]): string;

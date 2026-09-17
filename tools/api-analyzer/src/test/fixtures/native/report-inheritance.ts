/*
 * Supplies descriptive inheritance from an unexported internal ancestor.
 * The report must use inherited content without copying the ancestor's deprecated annotation.
 * A type query keeps the documentation-only target in emitted declarations.
 */

/** Converts a value. @deprecated Target only. @internal */
// The summary can be inherited, but the ancestor's deprecated and internal tags must stay local.
declare function base(value: string): string;
// The exported parameter's type query reaches keepBase, which in turn keeps base in emitted declarations.
declare const keepBase: typeof base;
/** {@inheritDoc base} @public */
// This query preserves a string parameter without exporting the internal documentation source.
export declare function convert(value: Parameters<typeof keepBase>[0]): string;

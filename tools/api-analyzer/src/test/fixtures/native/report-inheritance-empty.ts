/*
 * Supplies explicit inheritance with no descriptive target content.
 * Successful resolution must leave the public function undocumented.
 * A type query keeps the documentation-only target in emitted declarations.
 */

/** @internal */
// A release tag alone supplies no descriptive content, even when inheritance resolves successfully.
declare function base(value: string): string;
// The exported parameter's type query retains both this declaration and the unexported base.
declare const keepBase: typeof base;
/** {@inheritDoc base} @public */
// An inheritDoc request alone must not cause the public report to mark this function as documented.
export declare function convert(value: Parameters<typeof keepBase>[0]): string;

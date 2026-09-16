/*
 * Supplies explicit inheritance with no descriptive target content.
 * Successful resolution must leave the public function undocumented.
 * A type query keeps the documentation-only target in emitted declarations.
 */

/** @internal */
declare function base(value: string): string;
declare const keepBase: typeof base;
/** {@inheritDoc base} @public */
export declare function convert(value: Parameters<typeof keepBase>[0]): string;

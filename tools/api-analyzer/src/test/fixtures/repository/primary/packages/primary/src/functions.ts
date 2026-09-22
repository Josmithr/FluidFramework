/* Exercises callable declarations, overload selection, and signature display forms. */
/**
 * Copies a value.
 * @public
 * @exampleTag
 */
export function identity<TValue>(value: TValue): TValue { return value; }

/**
 * Formats text.
 * @public
 */
export function format(value: string): string;
/**
 * Formats a preview numeric value.
 * @beta
 */
export function format(value: number): string;
export function format(value: string | number): string { return String(value); }

/**
 * Accepts optional and rest arguments.
 * @public
 */
export function collect(first?: string, ...rest: string[]): string[] { return first === undefined ? rest : [first, ...rest]; }

/**
 * Identifies text.
 * @public
 */
export function isText(value: unknown): value is string { return typeof value === "string"; }

/**
 * Requires text.
 * @public
 */
export function assertText(value: unknown): asserts value is string { if (typeof value !== "string") throw new Error("Expected text"); }

/**
 * A callable value.
 * @public
 */
export const callback: (value: string) => string = value => value;

/**
 * Experimental operation.
 * @alpha
 */
export function experiment(): void {}

/**
 * Implementation-only operation.
 * @internal
 */
export function hidden(): void {}
import assert from "node:assert/strict";

/**
 * Returns a value that is expected to be defined.
 *
 * @param value - The value to check.
 * @param message - The assertion message when the value is undefined.
 * @returns The unchanged value, with undefined excluded from its type.
 * @throws An assertion error if the value is undefined.
 */
export function assertDefined<T>(
	value: T | undefined,
	message = "Expected a defined value.",
): T {
	assert.ok(value !== undefined, message);
	return value;
}

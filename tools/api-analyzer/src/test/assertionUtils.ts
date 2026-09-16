import assert from "node:assert/strict";

/**
 * Checks the assertion type and exact authored message, excluding Node's generated value diff.
 *
 * @param action - The operation expected to throw an assertion error.
 * @param message - The complete single-line message supplied by the assertion's author.
 */
export function assertAssertionError(action: () => unknown, message: string): void {
	assert.throws(action, (error: unknown) => {
		assert.ok(error instanceof assert.AssertionError);
		assert.equal(error.message.split("\n", 1)[0], message);
		return true;
	});
}

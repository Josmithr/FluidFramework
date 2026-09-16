import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Compares generated text with a checked-in snapshot and returns the expected text.
 *
 * @remarks
 * Reads UTF-8 text without changing whitespace or line endings.
 * Missing files and unequal text fail the test. This function never creates or updates files.
 * Tests can share a snapshot by using the same name.
 *
 * @param actual - The complete generated text.
 * @param name - A file name within the snapshot directory, without path separators.
 * @param directory - The snapshot directory URL, with a trailing slash.
 * Defaults to the package's source test snapshot directory.
 * @returns The expected text for additional assertions.
 */
export function assertSnapshot(
	actual: string,
	name: string,
	directory: URL = new URL("../../src/test/snapshots/", import.meta.url),
): string {
	assert.match(name, /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, "Expected a snapshot file name");
	const file = new URL(name, directory);
	const expected = readFileSync(file, "utf8");
	assert.equal(actual, expected, `Snapshot differs: ${file.pathname}`);
	return expected;
}

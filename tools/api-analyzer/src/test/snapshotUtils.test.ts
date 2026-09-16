import assert from "node:assert/strict";
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, it } from "mocha";
import { assertAssertionError } from "./assertionUtils.js";
import { assertSnapshot } from "./snapshotUtils.js";

describe("Snapshot assertions", () => {
	let directory: URL;
	const expected = "Summary.\n\n  Details.\n";

	beforeEach(() => {
		directory = pathToFileURL(
			`${mkdtempSync(path.join(tmpdir(), "api-analyzer-snapshots-"))}/`,
		);
		writeFileSync(new URL("example.txt", directory), expected);
	});

	afterEach(() => {
		rmSync(directory, { recursive: true, force: true });
	});

	it("compares a shared snapshot repeatedly without changing the file", () => {
		for (let attempt = 0; attempt < 2; attempt++) {
			assert.equal(assertSnapshot(expected, "example.txt", directory), expected);
		}
		assert.equal(readFileSync(new URL("example.txt", directory), "utf8"), expected);
		assert.deepEqual(readdirSync(directory), ["example.txt"]);
	});

	it("rejects content and whitespace differences without updating the snapshot", () => {
		for (const actual of [
			expected.replace("Summary", "Changed"),
			expected.trimEnd(),
			expected.replaceAll("\n", "\r\n"),
			expected.replace("  Details", "Details"),
			` ${expected}`,
			`${expected}\n`,
		]) {
			assertAssertionError(
				() => assertSnapshot(actual, "example.txt", directory),
				`Snapshot differs: ${new URL("example.txt", directory).pathname}`,
			);
		}
		assert.equal(readFileSync(new URL("example.txt", directory), "utf8"), expected);
		assert.deepEqual(readdirSync(directory), ["example.txt"]);
	});

	it("fails on a missing snapshot without creating it", () => {
		assert.throws(() => assertSnapshot(expected, "missing.txt", directory), {
			code: "ENOENT",
		});
		assert.equal(existsSync(new URL("missing.txt", directory)), false);
	});

	it("rejects names that can escape or alter the snapshot path", () => {
		for (const name of [
			"",
			"..",
			"../example.txt",
			"/example.txt",
			String.raw`dir\example.txt`,
			"file?x",
			"file#x",
		]) {
			assertAssertionError(
				() => assertSnapshot(expected, name, directory),
				"Expected a snapshot file name",
			);
		}
	});
});

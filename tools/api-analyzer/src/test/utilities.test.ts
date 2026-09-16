/* eslint-disable unicorn/no-null -- Null is a defined value that this helper must preserve. */

import assert from "node:assert/strict";
import { describe, it } from "mocha";
import { assertDefined } from "../utilities.js";

describe("Utilities", () => {
	it("returns an indexed value with a non-optional type", () => {
		const values: number[] = [42];
		const value: number = assertDefined(values[0]);
		assert.equal(value, 42);
	});

	it("preserves defined falsy values and object identity", () => {
		assert.equal(assertDefined(false), false);
		assert.equal(assertDefined(0), 0);
		assert.equal(assertDefined(""), "");
		assert.equal(assertDefined(null), null);
		const value = { name: "example" };
		assert.equal(assertDefined(value), value);
	});

	it("throws an assertion error for undefined", () => {
		assert.throws(() => assertDefined(undefined), {
			name: "AssertionError",
			message: "Expected a defined value.",
		});
	});

	it("uses the supplied assertion message", () => {
		assert.throws(() => assertDefined(undefined, "Missing corresponding parameter."), {
			name: "AssertionError",
			message: "Missing corresponding parameter.",
		});
	});
});

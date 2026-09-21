import assert from "node:assert/strict";
import { describe, it } from "mocha";
import { createCodeExcerpt } from "../structuredExcerpt.js";

describe("Structured excerpt construction", () => {
	it("preserves exact text and repeated reference identities without changing inputs", () => {
		const text = "(value: Item): Item;";

		// Identical spellings can have different targets; token construction must use supplied spans, not names.
		const references = Object.freeze([
			Object.freeze({ start: 8, end: 12, target: "first" }),
			Object.freeze({ start: 15, end: 19, target: "second" }),
		]);
		const excerpt = createCodeExcerpt(text, references);
		assert.deepEqual(excerpt, {
			tokens: [
				{ kind: "Content", text: "(value: " },
				{ kind: "Reference", text: "Item", target: "first" },
				{ kind: "Content", text: "): " },
				{ kind: "Reference", text: "Item", target: "second" },
				{ kind: "Content", text: ";" },
			],
			tokenRange: { startIndex: 0, endIndex: 5 },
		});
		assert.equal(excerpt.tokens.map((token) => token.text).join(""), text);
		assert.deepEqual(createCodeExcerpt(text, references), excerpt);
		assert.deepEqual(createCodeExcerpt("", []), {
			tokens: [],
			tokenRange: { startIndex: 0, endIndex: 0 },
		});
	});

	it("rejects overlapping, reversed, and out-of-bounds reference spans", () => {
		for (const references of [
			[{ start: -1, end: 2, target: "target" }],
			[{ start: 1, end: 1, target: "target" }],
			[{ start: 0, end: 99, target: "target" }],
			[
				{ start: 0, end: 3, target: "first" },
				{ start: 2, end: 4, target: "second" },
			],
		]) {
			assert.throws(() => createCodeExcerpt("type", references));
		}
	});
});

import assert from "node:assert/strict";
import { describe, it } from "mocha";
import { compareReviewBaseline } from "../reviewBaseline.js";

describe("Review baseline handling", () => {
	it("compares exact text and distinguishes missing from empty baselines", () => {
		assert.deepEqual(compareReviewBaseline("", ""), { ok: true, value: undefined });
		assert.deepEqual(compareReviewBaseline("report\n", "report\n"), {
			ok: true,
			value: undefined,
		});
		for (const [expected, code] of [
			[undefined, "baseline-missing"],
			["", "baseline-stale"],
			["report", "baseline-stale"],
			["report\r\n", "baseline-stale"],
		] as const) {
			const result = compareReviewBaseline("report\n", expected);
			assert.equal(result.ok, false);
			if (!result.ok) {
				assert.equal(result.diagnostics[0]?.code, code);
				assert.equal("value" in result, false);
				assert.ok(Object.isFrozen(result.diagnostics[0]));
			}
			assert.ok(Object.isFrozen(result));
		}
	});
});

import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "mocha";
import { checkReviewBaseline, compareReviewBaseline, updateReviewBaseline } from "../index.js";

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

	// Design requirements: W1, W4, W6. This tests baseline handling, not report generation.
	it("checks without accepting changes and updates only through an explicit operation", async () => {
		const directory = await mkdtemp(path.join(tmpdir(), "api-analyzer-baseline-"));
		const baselinePath = path.join(directory, "public.api.md");
		try {
			const missing = await checkReviewBaseline("new\n", baselinePath);
			assert.equal(missing.ok, false);
			if (!missing.ok) {
				assert.equal(missing.diagnostics[0]?.code, "baseline-missing");
				assert.ok(missing.diagnostics[0]?.message.includes(baselinePath));
			}
			await assert.rejects(readFile(baselinePath), { code: "ENOENT" });
			await writeFile(baselinePath, "accepted\n");
			const stale = await checkReviewBaseline("new\n", baselinePath);
			assert.equal(stale.ok, false);
			if (!stale.ok) {
				assert.equal(stale.diagnostics[0]?.code, "baseline-stale");
			}
			assert.equal(await readFile(baselinePath, "utf8"), "accepted\n");
			const updated = await updateReviewBaseline("new\n", baselinePath);
			assert.equal(updated.ok, true);
			assert.equal(await readFile(baselinePath, "utf8"), "new\n");
			const checked = await checkReviewBaseline("new\n", baselinePath);
			assert.equal(checked.ok, true);
			assert.equal(compareReviewBaseline("different\n", "new\n").ok, false);
			assert.equal(await readFile(baselinePath, "utf8"), "new\n");
			await rm(baselinePath);
			const emptyUpdated = await updateReviewBaseline("", baselinePath);
			assert.equal(emptyUpdated.ok, true);
			const emptyChecked = await checkReviewBaseline("", baselinePath);
			assert.equal(emptyChecked.ok, true);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("rejects relative paths and propagates unexpected filesystem errors", async () => {
		for (const operation of [checkReviewBaseline, updateReviewBaseline]) {
			const result = await operation("report", "relative.api.md");
			assert.equal(result.ok, false);
			if (!result.ok) {
				assert.equal(result.diagnostics[0]?.code, "baseline-configuration");
			}
		}
		const directory = await mkdtemp(path.join(tmpdir(), "api-analyzer-baseline-"));
		try {
			await assert.rejects(checkReviewBaseline("report", directory), { code: "EISDIR" });
			await assert.rejects(updateReviewBaseline("report", directory), { code: "EISDIR" });
			await assert.rejects(
				updateReviewBaseline("report", path.join(directory, "absent", "report.api.md")),
				{ code: "ENOENT" },
			);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
});

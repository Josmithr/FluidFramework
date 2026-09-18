import assert from "node:assert/strict";
import { describe, it } from "mocha";
import { DiagnosticCode, reportFailure, type Result } from "../analysis-types/result.js";

/**
 * Narrows a validation-only result without permitting access to a payload.
 * @param result - Success without a value, or failure diagnostics.
 * @returns Whether validation succeeded.
 */
function checkValidationResult(result: Result): boolean {
	if (result.ok) {
		// @ts-expect-error Validation-only success has no value property.
		assert.equal(result.value, undefined);
		assert.equal("value" in result, false);
		return true;
	}
	assert.equal(result.diagnostics.length, 1);
	return false;
}

/**
 * Preserves a union payload without distributing the success branch into separate results.
 * @param value - A string or number whose specific member is not known to the function.
 * @returns A success that retains the union-typed value.
 */
function createUnionResult(value: string | number): Result<string | number> {
	return { ok: true, value };
}

describe("Operation results", () => {
	it("supports success without a value type or property", () => {
		assert.equal(checkValidationResult({ ok: true }), true);

		// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-arguments -- Verify explicit never has the same no-payload contract as the default.
		const explicitDefault: Result<never> = { ok: true };
		assert.equal(checkValidationResult(explicitDefault), true);

		// @ts-expect-error A validation-only success must not declare a value, even undefined.
		const invalid: Result = { ok: true, value: undefined };
		assert.equal("value" in invalid, true);
	});

	it("preserves explicit undefined and union payloads", () => {
		const absent: Result<undefined> = { ok: true, value: undefined };
		const optional: Result<string | undefined> = absent;
		const text: Result<string | number> = { ok: true, value: "text" };
		const unknown: Result<unknown> = { ok: true, value: undefined };
		assert.equal("value" in absent, true);
		assert.equal(optional.value, undefined);
		assert.equal(text.value, "text");
		assert.equal(unknown.value, undefined);
		assert.deepEqual(createUnionResult(42), { ok: true, value: 42 });
		assert.deepEqual(createUnionResult("text"), { ok: true, value: "text" });

		// @ts-expect-error An explicit value type requires a payload, even when it includes undefined.
		const missing: Result<string | undefined> = { ok: true };
		assert.equal("value" in missing, false);
	});

	it("assigns failures to value-bearing and validation-only results", () => {
		const failed = reportFailure(DiagnosticCode.ReferencePolicy, "Rejected by policy.");
		const validation: Result = failed;
		const valued: Result<string> = failed;
		assert.equal(checkValidationResult(validation), false);
		assert.equal(valued.ok, false);
		assert.equal("value" in valued, false);
		assert(Object.isFrozen(failed));
		assert(Object.isFrozen(failed.diagnostics));

		// @ts-expect-error Failure narrowing must not permit a partial value.
		assert.equal(failed.value, undefined);
	});
});

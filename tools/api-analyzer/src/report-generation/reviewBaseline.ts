import { DiagnosticCode, reportFailure, type Result } from "../analysis-types/result.js";

/**
 * Compares generated review text with an accepted baseline or another generated surface.
 *
 * @remarks
 * Compares strings exactly, including whitespace and line endings. Does not parse report syntax.
 * An absent baseline differs from an existing empty baseline.
 * Performs no compiler queries or filesystem operations. The result is frozen.
 * For surface parity, render both inputs with the same review identity and options.
 *
 * @param actual - Generated review text to check.
 * @param expected - Accepted or expected text, or `undefined` if no baseline exists.
 * @returns Success when the texts match, or a missing or stale baseline diagnostic.
 */
export function compareReviewBaseline(actual: string, expected: string | undefined): Result {
	if (expected === undefined) {
		return reportFailure(
			DiagnosticCode.BaselineMissing,
			"No review baseline exists. Review the generated API and explicitly update the baseline.",
		);
	}
	if (actual !== expected) {
		return reportFailure(
			DiagnosticCode.BaselineStale,
			"Review text differs from the expected baseline. Review the differences; correct the API or explicitly accept the intended change.",
		);
	}
	return Object.freeze({ ok: true });
}

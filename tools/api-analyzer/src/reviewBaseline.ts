import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { DiagnosticCode, failure, freezeData, type Result } from "./result.js";

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
export function compareReviewBaseline(
	actual: string,
	expected: string | undefined,
): Result<void> {
	if (expected === undefined) {
		return failure(
			DiagnosticCode.BaselineMissing,
			"No review baseline exists. Review the generated API and explicitly update the baseline.",
		);
	}
	if (actual !== expected) {
		return failure(
			DiagnosticCode.BaselineStale,
			"Review text differs from the expected baseline. Review the differences; correct the API or explicitly accept the intended change.",
		);
	}
	return Object.freeze({ ok: true, value: undefined });
}

/**
 * Checks generated review text against a UTF-8 baseline file without writing.
 *
 * @remarks
 * A missing file produces a diagnostic. Other filesystem errors propagate as exceptions.
 * Does not create directories, update baselines, or repeat analysis. The result is frozen.
 *
 * @param actual - Generated review text to check.
 * @param baselinePath - Absolute path of the accepted baseline file.
 * @returns Success for an exact match, or diagnostics identifying the invalid path or baseline.
 * @throws If reading the baseline fails for a reason other than a missing file.
 */
export async function checkReviewBaseline(
	actual: string,
	baselinePath: string,
): Promise<Result<void>> {
	if (!path.isAbsolute(baselinePath)) {
		return failure(DiagnosticCode.BaselineConfiguration, "Supply an absolute baseline path.");
	}
	let expected: string | undefined;
	try {
		expected = await readFile(baselinePath, "utf8");
	} catch (error) {
		if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
			throw error;
		}
	}
	const result = compareReviewBaseline(actual, expected);
	if (!result.ok) {
		return freezeData({
			ok: false,
			diagnostics: result.diagnostics.map((diagnostic) => ({
				...diagnostic,
				message: `${baselinePath}: ${diagnostic.message}`,
			})),
		});
	}
	return result;
}

/**
 * Explicitly accepts generated review text by writing a UTF-8 baseline file.
 *
 * @remarks
 * Creates or replaces the file. The parent directory must already exist.
 * Call only after generation and required validation and parity checks succeed.
 * This operation does not validate the API or repeat analysis.
 * Writes one file; it does not provide transactional or atomic publication guarantees.
 * The result is frozen.
 *
 * @param actual - Reviewed text to accept as the new baseline.
 * @param baselinePath - Absolute path of the baseline file to create or replace.
 * @returns Success after writing, or a diagnostic for a relative path.
 * @throws If the baseline cannot be written.
 */
export async function updateReviewBaseline(
	actual: string,
	baselinePath: string,
): Promise<Result<void>> {
	if (!path.isAbsolute(baselinePath)) {
		return failure(DiagnosticCode.BaselineConfiguration, "Supply an absolute baseline path.");
	}
	await writeFile(baselinePath, actual, "utf8");
	return Object.freeze({ ok: true, value: undefined });
}

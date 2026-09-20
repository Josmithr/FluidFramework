/*
 * Generates or checks a complete API review report for api-analyzer's exports.
 * Execution starts when the module loads; it exports no API.
 *
 * From the package root, invoke the compiled script with `node lib/generateApiReport.js`.
 * With no arguments, it creates or replaces `api-report/api-analyzer.api.md`.
 * Add `--check` to compare generated text with the existing report without writing files.
 * No other arguments are accepted.
 *
 * Analysis reads `lib/index.d.ts` using `tsconfig.api-reports.json`.
 * Declaration inputs must already exist; this script does not compile them.
 * Paths are anchored to the script's location, not the caller's working directory.
 *
 * Invalid arguments, analysis or report diagnostics, and file errors cause a nonzero exit.
 * Check mode also fails if the report is missing or differs from the generated text.
 * Analysis and report generation must succeed before any output is written.
 */

import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { analyzeAPIs } from "./api.js";
import { ReleaseLevel } from "./analysis-types/classification.js";

const args = process.argv.slice(2);
assert(
	args.length === 0 || (args.length === 1 && args[0] === "--check"),
	"Only --check is supported.",
);

/**
 * Package root relative to this script's compiled location in `lib`.
 * Keeps analysis inputs and output paths independent of the caller's working directory.
 */
const root = new URL("../", import.meta.url);
const analysis = await analyzeAPIs(
	{
		packageName: "api-analyzer",
		project: "tsconfig.api-reports.json",
		entrypoints: [{ name: ".", path: "lib/index.d.ts" }],
	},
	fileURLToPath(root),
);
assert(analysis.ok, JSON.stringify(analysis));

/**
 * Complete named export surface with every release level and no modifier-tag filters.
 * Analysis requires release tags, so untagged APIs are not silently included.
 * The report is a review artifact, not a self-contained declaration rollup.
 */
const report = analysis.value.generateReport(".", {
	name: "complete",
	releaseLevels: [
		ReleaseLevel.Public,
		ReleaseLevel.Beta,
		ReleaseLevel.Alpha,
		ReleaseLevel.Internal,
	],
});
assert(report.ok, JSON.stringify(report));

/**
 * Report file replaced in write mode or read for exact text comparison in check mode.
 * Check mode does not create the file or its directory.
 */
const destination = new URL("api-report/api-analyzer.api.md", root);
if (args[0] === "--check") {
	assert.equal(
		await readFile(destination, "utf8"),
		report.value,
		"API report is stale. Run pnpm build:api-reports and review the changes.",
	);
} else {
	await mkdir(new URL("api-report/", root), { recursive: true });
	await writeFile(destination, report.value, "utf8");
}

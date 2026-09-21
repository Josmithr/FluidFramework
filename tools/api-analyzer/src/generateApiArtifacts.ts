/*
 * Generates or checks api-analyzer's complete API report and portable model.
 * Execution starts when the module loads; it exports no API.
 *
 * From the package root, invoke the compiled script with `node lib/generateApiArtifacts.js`.
 * With no arguments, it replaces both checked-in artifacts using one analysis.
 * Select only one artifact with --report or --model; add --check for read-only comparison.
 * Duplicate, conflicting, and unknown arguments are rejected.
 *
 * Analysis reads the root and model entrypoint declarations using tsconfig.api-reports.json.
 * Declaration inputs must already exist; this script does not compile them.
 * Paths are anchored to the script's location, not the caller's working directory.
 *
 * Invalid arguments, analysis or report diagnostics, and file errors cause a nonzero exit.
 * Check mode also fails if a selected artifact is missing or differs from the generated text.
 * All selected artifacts must be generated successfully before any output is written.
 */

import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { analyzeAPIs } from "./api.js";
import { ReleaseLevel } from "./analysis-types/classification.js";

/**
 * Generated content and the information needed to write or check its baseline.
 */
interface GeneratedArtifact {
	/**
	 * Human-readable artifact name used in stale-baseline errors.
	 */
	readonly name: string;

	/**
	 * Absolute file URL, independent of the caller's working directory.
	 */
	readonly destination: URL;

	/**
	 * Exact generator output, including its final newline.
	 */
	readonly content: string;

	/**
	 * Package command that regenerates this artifact from compiled declarations.
	 */
	readonly buildCommand: string;
}

const args = process.argv.slice(2);
assert(
	args.every((argument) => ["--check", "--report", "--model"].includes(argument)) &&
		new Set(args).size === args.length &&
		!(args.includes("--report") && args.includes("--model")),
	"Supported arguments are --check and at most one of --report or --model.",
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
		entrypoints: [
			{ name: ".", path: "lib/index.d.ts" },
			{ name: "./model", path: "lib/model.d.ts" },
		],
	},
	fileURLToPath(root),
);
assert(analysis.ok, JSON.stringify(analysis));

const artifacts: GeneratedArtifact[] = [];
if (!args.includes("--model")) {
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
	artifacts.push({
		name: "API report",
		destination: new URL("api-report/api-analyzer.api.md", root),
		content: report.value,
		buildCommand: "build:api-reports",
	});
}
if (!args.includes("--report")) {
	artifacts.push({
		name: "API model",
		destination: new URL("api-model/api-analyzer.api.json", root),
		content: analysis.value.generateModel(),
		buildCommand: "build:api-models",
	});
}

for (const artifact of artifacts) {
	if (args.includes("--check")) {
		assert.equal(
			await readFile(artifact.destination, "utf8"),
			artifact.content,
			`${artifact.name} is stale. Run pnpm ${artifact.buildCommand} and review the changes.`,
		);
	} else {
		await mkdir(new URL(".", artifact.destination), { recursive: true });
		await writeFile(artifact.destination, artifact.content, "utf8");
	}
}

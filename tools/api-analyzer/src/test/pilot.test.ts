import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "mocha";
import { analyzeAPIs, ReleaseLevel } from "../index.js";
import { decodeDependencyModel } from "../model-generation/dependencyModel.js";

describe("Repository pilot", () => {
	it("analyzes core-utils declarations with configured legacy policy and detached outputs", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "api-analyzer-pilot-"));
		const packageRoot = fileURLToPath(
			new URL("../../../../packages/common/core-utils/", import.meta.url),
		);
		const input = path.join(packageRoot, "lib/compare.d.ts");
		try {
			const project = path.join(directory, "tsconfig.json");
			writeFileSync(
				project,
				JSON.stringify({
					compilerOptions: { strict: true, module: "NodeNext", types: [] },
					files: [input],
				}),
			);
			const levels = [
				ReleaseLevel.Public,
				ReleaseLevel.Beta,
				ReleaseLevel.Alpha,
				ReleaseLevel.Internal,
			];
			const result = await analyzeAPIs({
				packageName: "@fluidframework/core-utils",
				packageRoot,
				project,
				entrypoints: [{ name: "./compare", path: input }],
				customModifierTags: ["@legacy"],
				referencePolicies: {
					releaseCompatibility: true,
					entrypointExposure: true,
					directional: [
						{
							name: "no-current-to-legacy",
							source: { releaseLevels: levels, excludeTags: ["@legacy"] },
							target: { releaseLevels: levels, requireTags: ["@legacy"] },
						},
					],
				},
			});
			assert.equal(result.ok, true, JSON.stringify(result));
			const current = result.value.generateReport("./compare", {
				name: "current",
				releaseLevels: levels,
				excludeTags: ["@legacy"],
			});
			const legacy = result.value.generateReport("./compare", {
				name: "legacy",
				releaseLevels: levels,
				requireTags: ["@legacy"],
			});
			assert.equal(current.ok, true);
			assert.equal(legacy.ok, true);
			assert.equal(current.value.includes("compareArrays"), false);
			assert.equal(legacy.value.includes("compareArrays"), true);
			assert.equal(
				decodeDependencyModel(result.value.generateModel(), "@fluidframework/core-utils").ok,
				true,
			);
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});
});

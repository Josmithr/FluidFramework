import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "mocha";

describe("Directory dependency boundaries", () => {
	it("accepts permitted imports and rejects cross-layer and test-helper access", () => {
		const directory = mkdtempSync(path.join(tmpdir(), "api-analyzer-fences-"));
		const sourceRoot = fileURLToPath(new URL("../../src/", import.meta.url));
		const checker = createRequire(import.meta.url).resolve("good-fences/bin/good-fences");
		try {
			// Copy the real rules into an isolated project; the probes test the checker, not compiler semantics.
			for (const layer of [
				"",
				"analysis",
				"analysis-types",
				"report-generation",
				"utilities",
				"test",
				"analysis/test",
			]) {
				const target = path.join(directory, "src", layer);
				mkdirSync(target, { recursive: true });
				copyFileSync(
					path.join(sourceRoot, layer, "fence.json"),
					path.join(target, "fence.json"),
				);
			}
			writeFileSync(
				path.join(directory, "tsconfig.json"),
				JSON.stringify({
					compilerOptions: { moduleResolution: "node", target: "es2022" },
					include: ["src/**/*.ts"],
				}),
			);
			const modules = [
				"analysis/nativeAdapter",
				"analysis/documentation",
				"analysis-types/facts",
				"utilities/assertDefined",
				"report-generation/reviewReport",
				"test/contextUtils",
				"index",
			];
			for (const module of modules) {
				writeFileSync(
					path.join(directory, "src", `${module}.ts`),
					"export const value = 1;\nexport interface Shape { value: number; }\n",
				);
			}
			const probes = [
				["analysis/permitted.ts", 'import { value } from "../analysis-types/facts.js";'],
				["analysis/test/permitted.ts", 'import { value } from "../../test/contextUtils.js";'],
				["composition.ts", 'import { value } from "./analysis/nativeAdapter.js";'],
			] as const;
			for (const [file, text] of probes) {
				writeFileSync(path.join(directory, "src", file), text);
			}
			const run = (): ReturnType<typeof spawnSync> =>
				spawnSync(
					process.execPath,
					[
						checker,
						"--project",
						path.join(directory, "tsconfig.json"),
						"--rootDir",
						path.join(directory, "src"),
					],
					{ encoding: "utf8", timeout: 10000 },
				);
			const permitted = run();
			assert.equal(permitted.status, 0, String(permitted.stdout) + String(permitted.stderr));
			const forbidden = [
				[
					"analysis/typesOnly.ts",
					'import type { Shape } from "../report-generation/reviewReport.js";',
				],
				[
					"report-generation/crossLayer.ts",
					'export { value } from "../analysis/nativeAdapter.js";',
				],
				["report-generation/rootBypass.ts", 'import { value } from "../index.js";'],
				["analysis/testHelper.ts", 'import { value } from "../test/contextUtils.js";'],
				["utilities/upward.ts", 'import { value } from "../analysis-types/facts.js";'],
			] as const;
			for (const [file, text] of forbidden) {
				writeFileSync(path.join(directory, "src", file), text);
			}
			const rejected = run();
			assert.equal(rejected.status, 1);
			for (const [file] of forbidden) {
				assert.equal(
					(String(rejected.stdout) + String(rejected.stderr)).includes(path.basename(file)),
					true,
					`${file}: ${String(rejected.stdout)} ${String(rejected.stderr)}`,
				);
			}
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});
});

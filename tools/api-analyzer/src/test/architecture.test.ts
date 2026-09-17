import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "mocha";
import { ESLint } from "eslint";

describe("Package coding conventions", () => {
	it("enforces braces and spacing before standalone comments", async () => {
		const root = fileURLToPath(new URL("../../", import.meta.url));
		const eslint = new ESLint({ cwd: root });

		// These in-memory probes test the actual configuration without adding compiler fixtures.
		const invalid = await eslint.lintText(
			"const enabled = true;\n// Standalone explanation.\nif (enabled) console.log(enabled);\n/** A declaration comment. */\nexport const value = enabled;\n",
			{ filePath: path.join(root, "src/api.ts") },
		);
		const rules = invalid.flatMap((result) =>
			result.messages.map((message) => message.ruleId),
		);
		assert.equal(rules.includes("curly"), true);
		assert.equal(rules.filter((rule) => rule === "@stylistic/lines-around-comment").length, 2);
		const valid = await eslint.lintText(
			"export function run(enabled: boolean): void {\n\t// An opening block needs no extra blank line.\n\tif (enabled) {\n\t\tconsole.log(enabled); // Trailing comments stay attached.\n\t}\n\n\t// A grouped explanation stays together.\n\t// Its second line needs no separator.\n\tconsole.log(enabled);\n}\n",
			{ filePath: path.join(root, "src/api.ts") },
		);
		assert.equal(
			valid
				.flatMap((result) => result.messages)
				.some(
					(message) =>
						message.ruleId === "curly" || message.ruleId === "@stylistic/lines-around-comment",
				),
			false,
		);
	});

	it("excludes compiler fixtures from linting and formatting", async () => {
		const root = fileURLToPath(new URL("../../", import.meta.url));
		const fixture = "src/test/fixtures/native/report-members.ts";
		assert.equal(
			await new ESLint({ cwd: root }).isPathIgnored(path.join(root, fixture)),
			true,
		);

		// No-match mode verifies real-file exclusion without writing to a checked-in fixture.
		const biome = spawnSync(
			path.join(root, "node_modules/.bin/biome"),
			["check", fixture, "--no-errors-on-unmatched", "--verbose"],
			{ cwd: root, encoding: "utf8" },
		);
		assert.equal(biome.status, 0, `${biome.stdout}${biome.stderr}`);
		assert.match(biome.stdout, /Checked 0 files/);
	});
});

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
				"model-generation",
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
				"model-generation/dependencyModel",
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
				// Model codecs may use shared contracts, but must remain independent of analysis and reports.
				[
					"model-generation/permitted.ts",
					'import type { Shape } from "../analysis-types/facts.js";',
				],
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
					"analysis/modelBypass.ts",
					'import { value } from "../model-generation/dependencyModel.js";',
				],
				[
					"report-generation/modelPeer.ts",
					'import type { Shape } from "../model-generation/dependencyModel.js";',
				],
				[
					"model-generation/analysisPeer.ts",
					'export { value } from "../analysis/nativeAdapter.js";',
				],
				[
					"model-generation/reportPeer.ts",
					'import { value } from "../report-generation/reviewReport.js";',
				],
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

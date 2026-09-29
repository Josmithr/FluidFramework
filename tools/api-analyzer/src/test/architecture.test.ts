import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "mocha";
import { ESLint } from "eslint";
import {
	flattenDiagnosticMessageText,
	getParsedCommandLineOfConfigFile,
	sys,
} from "typescript6";

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

	it("excludes fixtures and snapshots from linting, formatting, and compilation", async () => {
		const root = fileURLToPath(new URL("../../", import.meta.url));
		const configuration = getParsedCommandLineOfConfigFile(
			path.join(root, "tsconfig.json"),
			{},
			{
				...sys,
				onUnRecoverableConfigFileDiagnostic: (diagnostic) =>
					assert.fail(flattenDiagnosticMessageText(diagnostic.messageText, "\n")),
			},
		);
		assert(configuration !== undefined);
		assert.deepEqual(configuration.errors, []);
		const eslint = new ESLint({ cwd: root });
		for (const file of [
			"src/test/fixtures/native/report-members.ts",
			"src/test/snapshots/rollup-public-__api.d.ts",
		]) {
			const absolute = path.join(root, file);
			assert.equal(await eslint.isPathIgnored(absolute), true, file);
			assert.equal(configuration.fileNames.includes(absolute), false, file);
			const biome = spawnSync(
				path.join(root, "node_modules/.bin/biome"),
				["check", file, "--no-errors-on-unmatched", "--verbose"],
				{ cwd: root, encoding: "utf8" },
			);
			assert.equal(biome.status, 0, `${biome.stdout}${biome.stderr}`);
			assert.match(biome.stdout, /Checked 0 files/);
		}
	});
});

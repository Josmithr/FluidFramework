/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { assert } from "chai";
import { afterEach, describe, it } from "mocha";

import { resolveApiReportConfig } from "../../library/apiExtractorConfig.js";

describe("resolveApiReportConfig", () => {
	const temporaryDirectories: string[] = [];

	afterEach(() => {
		for (const directory of temporaryDirectories.splice(0)) {
			fs.rmSync(directory, { force: true, recursive: true });
		}
	});

	function createProject(): { packageJsonPath: string; projectFolder: string } {
		const projectFolder = fs.mkdtempSync(path.join(os.tmpdir(), "api-extractor-config-test-"));
		temporaryDirectories.push(projectFolder);
		const packageJsonPath = path.join(projectFolder, "package.json");
		fs.writeFileSync(packageJsonPath, '{ "name": "@scope/example", "version": "1.0.0" }');
		fs.writeFileSync(path.join(projectFolder, "tsconfig.json"), "{}");
		return { packageJsonPath, projectFolder };
	}

	it("resolves JSON5 inheritance and report tokens without declaration output", () => {
		const { packageJsonPath, projectFolder } = createProject();
		const configFolder = path.join(projectFolder, "api-extractor");
		fs.mkdirSync(configFolder);
		fs.writeFileSync(
			path.join(projectFolder, "base.json"),
			`{
				mainEntryPointFilePath: "<projectFolder>/lib/index.d.ts",
				compiler: { tsconfigFilePath: "<projectFolder>/tsconfig.json" },
				apiReport: {
					enabled: true,
					reportFileName: "<unscopedPackageName>.api.md",
					reportFolder: "<projectFolder>/api-report",
					reportVariants: ["public", "beta"],
				},
				docModel: { enabled: false },
				dtsRollup: { enabled: false },
				tsdocMetadata: { enabled: false },
			}`,
		);
		const leafPath = path.join(configFolder, "report.json");
		fs.writeFileSync(
			leafPath,
			`{
				extends: "../base.json",
				apiReport: { reportVariants: ["alpha"] },
			}`,
		);

		assert.deepEqual(resolveApiReportConfig(leafPath, packageJsonPath), {
			enabled: true,
			reportConfigs: [{ fileName: "example.alpha.api.md", variant: "alpha" }],
			reportFolder: path.join(projectFolder, "api-report"),
		});
	});

	it("resolves config-relative inheritance", () => {
		const { packageJsonPath, projectFolder } = createProject();
		const basePath = path.join(projectFolder, "base.json");
		const leafPath = path.join(projectFolder, "leaf.json");
		fs.writeFileSync(
			basePath,
			'{ mainEntryPointFilePath: "<projectFolder>/lib/index.d.ts", compiler: { tsconfigFilePath: "<projectFolder>/tsconfig.json" }, apiReport: { enabled: true, reportFileName: "example", reportFolder: "reports", reportVariants: ["public"] }, docModel: { enabled: false }, dtsRollup: { enabled: false }, tsdocMetadata: { enabled: false } }',
		);
		fs.writeFileSync(leafPath, '{ extends: "./base.json" }');

		assert.equal(
			resolveApiReportConfig(leafPath, packageJsonPath).reportFolder,
			path.join(projectFolder, "reports"),
		);
	});

	it("rejects inheritance cycles", () => {
		const { packageJsonPath, projectFolder } = createProject();
		const firstPath = path.join(projectFolder, "first.json");
		fs.writeFileSync(firstPath, '{ extends: "./second.json" }');
		fs.writeFileSync(path.join(projectFolder, "second.json"), '{ extends: "./first.json" }');

		assert.throws(
			() => resolveApiReportConfig(firstPath, packageJsonPath),
			"contains a cycle",
		);
	});
});

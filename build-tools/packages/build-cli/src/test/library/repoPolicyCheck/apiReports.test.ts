/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assert } from "chai";
import { afterEach, describe, it } from "mocha";

import {
	classifyReportDeclaration,
	evaluateApiReportCoverage,
	getRequiredReportEntrypoints,
	handler,
} from "../../../library/repoPolicyCheck/apiReports.js";

describe("API report entrypoint discovery", () => {
	it("classifies current and legacy declaration filename forms", () => {
		assert.deepEqual(classifyReportDeclaration("lib/public.d.ts"), {
			level: "current.public",
		});
		assert.deepEqual(classifyReportDeclaration("lib/example.beta.d.mts"), {
			channel: "example",
			level: "current.beta",
		});
		assert.deepEqual(classifyReportDeclaration("lib/example.alpha.d.cts"), {
			channel: "example",
			level: "current.alpha",
		});
		assert.deepEqual(classifyReportDeclaration("lib/legacy.d.ts"), { level: "legacy.beta" });
		assert.deepEqual(classifyReportDeclaration("lib/browser.legacy.alpha.d.ts"), {
			channel: "browser",
			level: "legacy.alpha",
		});
		assert.deepEqual(classifyReportDeclaration("lib/legacyPublic.d.ts"), {
			level: "legacy.public",
		});
		assert.isUndefined(classifyReportDeclaration("lib/index.d.ts"));
	});

	it("treats top-level types as the current public entrypoint", () => {
		assert.deepEqual(getRequiredReportEntrypoints({ types: "./lib/domain-name.d.ts" }), [
			{ declarationPath: "./lib/domain-name.d.ts", level: "current.public" },
		]);
	});

	it("rejects ambiguous top-level declaration metadata", () => {
		assert.throws(
			() =>
				getRequiredReportEntrypoints({
					types: "./lib/index.d.ts",
					typings: "./lib/index.d.ts",
				}),
			'must not specify both "types" and "typings"',
		);
	});

	it("uses explicit exports declarations instead of top-level types", () => {
		const packageJson = {
			types: "./lib/index.d.ts",
			exports: {
				".": { types: "./lib/public.d.ts", default: "./lib/index.js" },
				"./beta": { types: "./lib/beta.d.ts", default: "./lib/beta.js" },
				"./internal": { types: "./lib/internal.d.ts", default: "./lib/internal.js" },
			},
		};

		assert.deepEqual(getRequiredReportEntrypoints(packageJson), [
			{ declarationPath: "./lib/public.d.ts", level: "current.public" },
			{ declarationPath: "./lib/beta.d.ts", level: "current.beta" },
		]);
	});

	it("deduplicates ESM and CommonJS references to a declaration", () => {
		const packageJson = {
			exports: {
				".": {
					import: { types: "./lib/public.d.ts", default: "./lib/index.js" },
					require: { types: "./lib/public.d.ts", default: "./dist/index.js" },
				},
			},
		};

		assert.deepEqual(getRequiredReportEntrypoints(packageJson), [
			{ declarationPath: "./lib/public.d.ts", level: "current.public" },
		]);
	});

	it("deduplicates ESM and CommonJS output paths for one logical rollup", () => {
		const packageJson = {
			exports: {
				".": {
					import: { types: "./lib/public.d.ts", default: "./lib/index.js" },
					require: { types: "./dist/public.d.ts", default: "./dist/index.js" },
				},
			},
		};

		assert.deepEqual(getRequiredReportEntrypoints(packageJson), [
			{ declarationPath: "./lib/public.d.ts", level: "current.public" },
		]);
	});

	it("uses an unclassified root export as the public fallback", () => {
		const packageJson = {
			exports: {
				".": { types: "./lib/index.d.ts", default: "./lib/index.js" },
				"./feature": { types: "./lib/feature.d.ts", default: "./lib/feature.js" },
			},
		};

		assert.deepEqual(getRequiredReportEntrypoints(packageJson), [
			{ declarationPath: "./lib/index.d.ts", level: "current.public" },
		]);
	});

	it("uses non-internal typed subpaths as public channels when no root is exported", () => {
		const packageJson = {
			exports: {
				"./states": {
					import: { types: "./lib/states/index.d.ts" },
					require: { types: "./dist/states/index.d.ts" },
				},
				"./workspace": { types: "./lib/workspace/index.d.ts" },
				"./internal/protocol": { types: "./lib/runtime/protocol.d.ts" },
			},
		};

		assert.deepEqual(getRequiredReportEntrypoints(packageJson), [
			{
				channel: "states",
				declarationPath: "./lib/states/index.d.ts",
				level: "current.public",
			},
			{
				channel: "workspace",
				declarationPath: "./lib/workspace/index.d.ts",
				level: "current.public",
			},
		]);
	});

	it("rejects exports without a reportable declaration", () => {
		assert.throws(
			() =>
				getRequiredReportEntrypoints({
					exports: { ".": { default: "./lib/index.js" } },
				}),
			"does not expose a reportable TypeScript entrypoint",
		);
	});
});

describe("API report coverage policy", () => {
	const temporaryDirectories: string[] = [];

	afterEach(() => {
		for (const directory of temporaryDirectories.splice(0)) {
			fs.rmSync(directory, { force: true, recursive: true });
		}
	});

	function createPackage(
		options: {
			private?: boolean;
			reportVariants?: readonly string[];
			writeReport?: boolean;
		} = {},
	): { configPath: string; packageJsonPath: string; projectFolder: string } {
		const projectFolder = fs.mkdtempSync(path.join(os.tmpdir(), "api-report-policy-test-"));
		temporaryDirectories.push(projectFolder);
		const configFolder = path.join(projectFolder, "api-extractor");
		fs.mkdirSync(configFolder);
		const configPath = path.join(configFolder, "api-extractor-report.json");
		fs.writeFileSync(
			configPath,
			`{
				// Keep this comment when policy-check fixes the variants.
				mainEntryPointFilePath: "<projectFolder>/lib/public.d.ts",
				compiler: { tsconfigFilePath: "<projectFolder>/tsconfig.json" },
				apiReport: {
					enabled: true,
					reportFileName: "example",
					reportFolder: "<projectFolder>/api-report",
					reportVariants: ${JSON.stringify(options.reportVariants ?? ["public"])},
				},
				docModel: { enabled: false },
				dtsRollup: { enabled: false },
				tsdocMetadata: { enabled: false },
			}`,
		);
		const packageJsonPath = path.join(projectFolder, "package.json");
		fs.writeFileSync(
			packageJsonPath,
			JSON.stringify({
				name: "@scope/example",
				version: "1.0.0",
				...(options.private === undefined ? {} : { private: options.private }),
				exports: {
					".": { types: "./lib/public.d.ts", default: "./lib/index.js" },
					"./beta": { types: "./lib/beta.d.ts", default: "./lib/beta.js" },
				},
				scripts: {
					"build:api-reports":
						"api-extractor run --local --config api-extractor/api-extractor-report.json",
					"ci:build:api-reports":
						"api-extractor run --config api-extractor/api-extractor-report.json",
				},
			}),
		);
		fs.writeFileSync(path.join(projectFolder, "tsconfig.json"), "{}");
		if (options.writeReport === true) {
			const reportFolder = path.join(projectFolder, "api-report");
			fs.mkdirSync(reportFolder);
			fs.writeFileSync(path.join(reportFolder, "example.public.api.md"), "public report");
			fs.writeFileSync(path.join(reportFolder, "example.beta.api.md"), "beta report");
		}
		return { configPath, packageJsonPath, projectFolder };
	}

	it("reports a missing configured variant", () => {
		const { packageJsonPath } = createPackage({ writeReport: true });
		const failures = evaluateApiReportCoverage(packageJsonPath).failures;

		assert.isTrue(
			failures.some(
				({ kind, level }) => kind === "missing-config-variant" && level === "current.beta",
			),
		);
	});

	it("reports every missing generated report", () => {
		const { packageJsonPath } = createPackage({ reportVariants: ["public", "beta"] });
		const failures = evaluateApiReportCoverage(packageJsonPath).failures;

		assert.equal(failures.filter(({ kind }) => kind === "missing-report-file").length, 2);
	});

	it("reports an extraneous configured variant", () => {
		const { packageJsonPath } = createPackage({
			reportVariants: ["public", "beta", "alpha"],
			writeReport: true,
		});
		const failures = evaluateApiReportCoverage(packageJsonPath).failures;

		assert.isTrue(
			failures.some(
				({ kind, level }) => kind === "extraneous-config-variant" && level === "current.alpha",
			),
		);
	});

	it("reports only recognized stale report variants", () => {
		const { packageJsonPath, projectFolder } = createPackage({
			reportVariants: ["public", "beta"],
			writeReport: true,
		});
		fs.writeFileSync(path.join(projectFolder, "api-report", "example.alpha.api.md"), "stale");
		fs.writeFileSync(path.join(projectFolder, "api-report", "notes.md"), "unrelated");
		const failures = evaluateApiReportCoverage(packageJsonPath).failures;

		assert.equal(failures.filter(({ kind }) => kind === "extraneous-report-file").length, 1);
	});

	it("ignores private packages", () => {
		const { packageJsonPath } = createPackage({ private: true });
		assert.deepEqual(evaluateApiReportCoverage(packageJsonPath).failures, []);
	});

	it("adds a missing variant while preserving comments", async () => {
		const { configPath, packageJsonPath } = createPackage({ writeReport: true });
		assert.isDefined(handler.resolver);

		const result = await handler.resolver(packageJsonPath, "unused");

		assert.isTrue(result.resolved);
		const updatedConfig = fs.readFileSync(configPath, "utf8");
		assert.include(updatedConfig, "// Keep this comment");
		assert.include(updatedConfig, 'reportVariants: ["public", "beta"]');
	});

	it("materializes an apiReport override when variants are inherited", async () => {
		const { configPath, packageJsonPath, projectFolder } = createPackage({
			writeReport: true,
		});
		const basePath = path.join(projectFolder, "api-extractor-base.json");
		fs.writeFileSync(
			basePath,
			'{ compiler: { tsconfigFilePath: "<projectFolder>/tsconfig.json" }, apiReport: { enabled: true, reportFileName: "example", reportFolder: "<projectFolder>/api-report", reportVariants: ["public"] }, docModel: { enabled: false }, dtsRollup: { enabled: false }, tsdocMetadata: { enabled: false } }',
		);
		fs.writeFileSync(
			configPath,
			`{
				"extends": "../api-extractor-base.json",
				"mainEntryPointFilePath": "<projectFolder>/lib/beta.d.ts"
			}`,
		);
		assert.isDefined(handler.resolver);

		const result = await handler.resolver(packageJsonPath, "unused");

		assert.isTrue(result.resolved);
		assert.include(
			fs.readFileSync(configPath, "utf8"),
			'"reportVariants": ["public", "beta"]',
		);
	});
});

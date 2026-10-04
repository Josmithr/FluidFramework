/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import type { PackageJson } from "../common/npmPackage.js";
import {
	getTaskDefinitions,
	normalizeGlobalTaskDefinitions,
	type TaskConfig,
	type TaskConfigOnDisk,
	type TaskDefinitionsOnDisk,
} from "../fluidBuild/fluidTaskDefinitions.js";

describe("Task Definitions", () => {
	describe("Programmatic analyzer tasks", () => {
		it("requires analyzer discrimination at the type and runtime boundaries", () => {
			const invalid: TaskConfigOnDisk[] = [
				// @ts-expect-error Analyzer settings require an explicit analyzer kind.
				{ analyzer: {} },
				// @ts-expect-error A programmatic task cannot also be a script task.
				{ kind: "api-analyzer", script: true },
				// @ts-expect-error The alias execution flag is not an analyzer setting either.
				{ kind: "api-analyzer", script: false },
			];
			for (const config of invalid) {
				assert.throws(
					() => normalizeGlobalTaskDefinitions({ api: config }),
					/api-analyzer|Analyzer/,
				);
			}
			const ordinary: TaskConfig = {
				dependsOn: [],
				before: [],
				after: [],
				children: [],
				script: true,
				files: undefined,
			};
			// @ts-expect-error Ordinary task configuration does not expose analyzer settings.
			assert.equal(ordinary.analyzer, undefined);
		});

		it("preserves the normalized shape of legacy scripts and aliases", () => {
			const definitions = getTaskDefinitions(
				{
					name: "test-package",
					version: "1.0.0",
					scripts: { compile: "tsc", check: "echo check" },
					fluidBuild: {
						tasks: {
							compile: [],
							check: { dependsOn: ["compile"] },
							build: { script: false, dependsOn: ["check"] },
						},
					},
				},
				{},
				{ isReleaseGroupRoot: false },
			);
			assert.deepEqual(definitions, {
				compile: {
					dependsOn: [],
					before: [],
					after: [],
					children: [],
					script: true,
					files: undefined,
				},
				check: {
					dependsOn: ["compile"],
					before: [],
					after: [],
					children: [],
					script: true,
					files: undefined,
				},
				build: {
					dependsOn: ["check"],
					before: [],
					after: [],
					children: [],
					script: false,
					files: undefined,
				},
			});
		});

		it("still rejects unknown task kinds supplied by parsed JSON", () => {
			for (const kind of ["unsupported", false, 1]) {
				const definitions = JSON.parse(
					JSON.stringify({ api: { kind } }),
				) as TaskDefinitionsOnDisk;
				assert.throws(
					() => normalizeGlobalTaskDefinitions(definitions),
					/Unsupported task kind/,
				);
			}
		});

		it("retains an explicitly configured task without a package script", () => {
			const analyzerTask = {
				kind: "api-analyzer" as const,
				dependsOn: ["tsc"],
				analyzer: {
					packageName: "test-package",
					project: "tsconfig.json",
					entrypoints: [{ name: ".", path: "lib/index.d.ts" }],
				},
				profiles: { validate: [] },
			};
			const definitions = getTaskDefinitions(
				{
					name: "test-package",
					version: "1.0.0",
					scripts: { tsc: "tsc" },
					fluidBuild: { tasks: { api: analyzerTask } },
				},
				{},
				{ isReleaseGroupRoot: false },
			);
			assert(definitions.api.kind === "api-analyzer");
			const script: false = definitions.api.script;
			const files = definitions.api.files;
			assert.equal(script, false);
			assert.equal(files, undefined);
			assert.deepStrictEqual(definitions.api.analyzer, analyzerTask.analyzer);
			assert.deepStrictEqual(definitions.api.dependsOn, ["tsc"]);
		});

		it("does not activate global analyzer defaults without package opt-in", () => {
			const defaults = normalizeGlobalTaskDefinitions({
				api: { dependsOn: [], kind: "api-analyzer" },
			});
			const definitions = getTaskDefinitions(
				{ name: "test-package", version: "1.0.0", scripts: {} },
				defaults,
				{ isReleaseGroupRoot: false },
			);
			assert.equal(definitions.api, undefined);
		});

		it("merges analysis layers and named profiles without mutating defaults", () => {
			const defaults = normalizeGlobalTaskDefinitions({
				api: {
					kind: "api-analyzer",
					analyzer: { rules: { requireReleaseLevel: true } },
					profiles: { docs: ["model"], validate: [] },
					outputs: { rollups: [{ selection: "public", directory: "types" }] },
				},
				build: { script: false, dependsOn: ["api"] },
			});
			const original = structuredClone(defaults);
			const definitions = getTaskDefinitions(
				{
					name: "test-package",
					version: "1.0.0",
					scripts: {},
					fluidBuild: {
						tasks: {
							api: {
								kind: "api-analyzer",
								analyzer: { packageName: "test-package" },
								profiles: { docs: ["model", "reports"] },
								outputs: { rollups: [] },
							},
						},
					},
				},
				defaults,
				{ isReleaseGroupRoot: false },
			);
			assert(definitions.api.kind === "api-analyzer");
			assert.deepEqual(definitions.api.analyzer, {
				extends: [{ rules: { requireReleaseLevel: true } }, { packageName: "test-package" }],
			});
			assert.deepEqual(definitions.api.profiles, { docs: ["model", "reports"], validate: [] });
			assert.deepEqual(definitions.api.outputs?.rollups, []);
			assert.deepEqual(definitions.build.dependsOn, ["api"]);
			assert.deepEqual(defaults, original);
		});

		it("rejects ambiguous script settings and package scripts", () => {
			for (const script of [true, false]) {
				const invalid = JSON.parse(
					JSON.stringify({ api: { kind: "api-analyzer", script } }),
				) as TaskDefinitionsOnDisk;
				assert.throws(
					() => normalizeGlobalTaskDefinitions(invalid),
					/Unsupported api-analyzer task setting 'script'/,
				);
			}
			assert.throws(
				() =>
					getTaskDefinitions(
						{
							name: "test-package",
							version: "1.0.0",
							scripts: { api: "echo no" },
							fluidBuild: { tasks: { api: { kind: "api-analyzer" } } },
						},
						{},
						{ isReleaseGroupRoot: false },
					),
				/cannot also have a package script/,
			);
		});

		it("rejects unknown output fields and invalid release selections", () => {
			const invalidSettings = [
				{
					outputs: {
						model: { file: "types/api.json" },
						rollups: [{ selection: "public", directory: "types" }],
					},
				},
				{ outputs: { model: { file: "../outside.json" } } },
				{ outputs: { models: { file: "model.json" } } },
				{ outputs: { model: { file: "model.json", typo: true } } },
				{
					outputs: {
						reports: [
							{ file: "api.md", selection: "public", entrypoint: ".", mode: "overwrite" },
						],
					},
				},
				{ selections: { public: { releaseLevels: ["preview"] } } },
				{ selections: { public: { releaseLevels: ["public"], typo: true } } },
			];
			for (const invalid of invalidSettings) {
				// Parsed package JSON is untrusted at runtime; bypass static typing to exercise the actual validation boundary.
				const config = JSON.parse(
					JSON.stringify({ api: { kind: "api-analyzer", ...invalid } }),
				) as TaskDefinitionsOnDisk;
				assert.throws(() => normalizeGlobalTaskDefinitions(config), /api-analyzer/);
			}
		});
	});

	describe("File Dependencies Extension", () => {
		it("extends inputGlobs from global config when using '...'", () => {
			const globalTaskDefinitionsOnDisk: TaskDefinitionsOnDisk = {
				myTask: {
					dependsOn: [],
					files: {
						inputGlobs: ["src/**/*.ts", "package.json"],
						outputGlobs: ["dist/**/*.js"],
					},
				},
			};

			const globalTaskDefinitions = normalizeGlobalTaskDefinitions(
				globalTaskDefinitionsOnDisk,
			);

			const packageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				scripts: {
					myTask: "echo test",
				},
				fluidBuild: {
					tasks: {
						myTask: {
							dependsOn: [],
							files: {
								inputGlobs: ["...", "extra/**/*.ts"],
								outputGlobs: ["..."],
							},
						},
					},
				},
			};

			const taskDefinitions = getTaskDefinitions(packageJson, globalTaskDefinitions, {
				isReleaseGroupRoot: false,
			});

			assert.deepStrictEqual(taskDefinitions.myTask.files?.inputGlobs, [
				"extra/**/*.ts",
				"src/**/*.ts",
				"package.json",
			]);
			assert.deepStrictEqual(taskDefinitions.myTask.files?.outputGlobs, ["dist/**/*.js"]);
		});

		it("extends outputGlobs from global config when using '...'", () => {
			const globalTaskDefinitionsOnDisk: TaskDefinitionsOnDisk = {
				myTask: {
					dependsOn: [],
					files: {
						inputGlobs: ["src/**/*.ts"],
						outputGlobs: ["dist/**/*.js", "dist/**/*.d.ts"],
					},
				},
			};

			const globalTaskDefinitions = normalizeGlobalTaskDefinitions(
				globalTaskDefinitionsOnDisk,
			);

			const packageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				scripts: {
					myTask: "echo test",
				},
				fluidBuild: {
					tasks: {
						myTask: {
							dependsOn: [],
							files: {
								inputGlobs: ["..."],
								outputGlobs: ["...", "dist/**/*.map"],
							},
						},
					},
				},
			};

			const taskDefinitions = getTaskDefinitions(packageJson, globalTaskDefinitions, {
				isReleaseGroupRoot: false,
			});

			assert.deepStrictEqual(taskDefinitions.myTask.files?.inputGlobs, ["src/**/*.ts"]);
			assert.deepStrictEqual(taskDefinitions.myTask.files?.outputGlobs, [
				"dist/**/*.map",
				"dist/**/*.js",
				"dist/**/*.d.ts",
			]);
		});

		it("supports extending both inputGlobs and outputGlobs", () => {
			const globalTaskDefinitionsOnDisk: TaskDefinitionsOnDisk = {
				myTask: {
					dependsOn: [],
					files: {
						inputGlobs: ["src/**/*.ts"],
						outputGlobs: ["dist/**/*.js"],
					},
				},
			};

			const globalTaskDefinitions = normalizeGlobalTaskDefinitions(
				globalTaskDefinitionsOnDisk,
			);

			const packageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				scripts: {
					myTask: "echo test",
				},
				fluidBuild: {
					tasks: {
						myTask: {
							dependsOn: [],
							files: {
								inputGlobs: ["...", "config/*.json"],
								outputGlobs: ["...", "dist/**/*.d.ts"],
							},
						},
					},
				},
			};

			const taskDefinitions = getTaskDefinitions(packageJson, globalTaskDefinitions, {
				isReleaseGroupRoot: false,
			});

			assert.deepStrictEqual(taskDefinitions.myTask.files?.inputGlobs, [
				"config/*.json",
				"src/**/*.ts",
			]);
			assert.deepStrictEqual(taskDefinitions.myTask.files?.outputGlobs, [
				"dist/**/*.d.ts",
				"dist/**/*.js",
			]);
		});

		it("works without global file dependencies", () => {
			const globalTaskDefinitionsOnDisk: TaskDefinitionsOnDisk = {
				myTask: {
					dependsOn: [],
				},
			};

			const globalTaskDefinitions = normalizeGlobalTaskDefinitions(
				globalTaskDefinitionsOnDisk,
			);

			const packageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				scripts: {
					myTask: "echo test",
				},
				fluidBuild: {
					tasks: {
						myTask: {
							dependsOn: [],
							files: {
								inputGlobs: ["...", "src/**/*.ts"],
								outputGlobs: ["...", "dist/**/*.js"],
							},
						},
					},
				},
			};

			const taskDefinitions = getTaskDefinitions(packageJson, globalTaskDefinitions, {
				isReleaseGroupRoot: false,
			});

			// "..." expands to empty when there are no inherited values
			assert.deepStrictEqual(taskDefinitions.myTask.files?.inputGlobs, ["src/**/*.ts"]);
			assert.deepStrictEqual(taskDefinitions.myTask.files?.outputGlobs, ["dist/**/*.js"]);
		});

		it("replaces file dependencies when '...' is not used", () => {
			const globalTaskDefinitionsOnDisk: TaskDefinitionsOnDisk = {
				myTask: {
					dependsOn: [],
					files: {
						inputGlobs: ["src/**/*.ts"],
						outputGlobs: ["dist/**/*.js"],
					},
				},
			};

			const globalTaskDefinitions = normalizeGlobalTaskDefinitions(
				globalTaskDefinitionsOnDisk,
			);

			const packageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				scripts: {
					myTask: "echo test",
				},
				fluidBuild: {
					tasks: {
						myTask: {
							dependsOn: [],
							files: {
								inputGlobs: ["lib/**/*.ts"], // No "..." - replaces instead of extends
								outputGlobs: ["build/**/*.js"],
							},
						},
					},
				},
			};

			const taskDefinitions = getTaskDefinitions(packageJson, globalTaskDefinitions, {
				isReleaseGroupRoot: false,
			});

			// Without "...", the package-level definition completely replaces the global one
			assert.deepStrictEqual(taskDefinitions.myTask.files?.inputGlobs, ["lib/**/*.ts"]);
			assert.deepStrictEqual(taskDefinitions.myTask.files?.outputGlobs, ["build/**/*.js"]);
		});
	});

	describe("Additional Config Files", () => {
		it("extends additionalConfigFiles from global config when using '...'", () => {
			const globalTaskDefinitionsOnDisk: TaskDefinitionsOnDisk = {
				eslint: {
					dependsOn: [],
					files: {
						inputGlobs: [],
						outputGlobs: [],
						additionalConfigFiles: ["../../.eslintrc.cjs", "../../eslint-common.json"],
					},
				},
			};

			const globalTaskDefinitions = normalizeGlobalTaskDefinitions(
				globalTaskDefinitionsOnDisk,
			);

			const packageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				scripts: {
					eslint: "eslint src",
				},
				fluidBuild: {
					tasks: {
						eslint: {
							dependsOn: [],
							files: {
								inputGlobs: [],
								outputGlobs: [],
								additionalConfigFiles: ["...", ".eslintrc.local.json"],
							},
						},
					},
				},
			};

			const taskDefinitions = getTaskDefinitions(packageJson, globalTaskDefinitions, {
				isReleaseGroupRoot: false,
			});

			assert.deepStrictEqual(taskDefinitions.eslint.files?.additionalConfigFiles, [
				".eslintrc.local.json",
				"../../.eslintrc.cjs",
				"../../eslint-common.json",
			]);
		});

		it("works without global additionalConfigFiles", () => {
			const globalTaskDefinitionsOnDisk: TaskDefinitionsOnDisk = {
				eslint: {
					dependsOn: [],
				},
			};

			const globalTaskDefinitions = normalizeGlobalTaskDefinitions(
				globalTaskDefinitionsOnDisk,
			);

			const packageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				scripts: {
					eslint: "eslint src",
				},
				fluidBuild: {
					tasks: {
						eslint: {
							dependsOn: [],
							files: {
								inputGlobs: [],
								outputGlobs: [],
								additionalConfigFiles: ["...", "../../.eslintrc.cjs"],
							},
						},
					},
				},
			};

			const taskDefinitions = getTaskDefinitions(packageJson, globalTaskDefinitions, {
				isReleaseGroupRoot: false,
			});

			// "..." expands to empty when there are no inherited values
			assert.deepStrictEqual(taskDefinitions.eslint.files?.additionalConfigFiles, [
				"../../.eslintrc.cjs",
			]);
		});

		it("replaces additionalConfigFiles when '...' is not used", () => {
			const globalTaskDefinitionsOnDisk: TaskDefinitionsOnDisk = {
				eslint: {
					dependsOn: [],
					files: {
						inputGlobs: [],
						outputGlobs: [],
						additionalConfigFiles: ["../../.eslintrc.cjs"],
					},
				},
			};

			const globalTaskDefinitions = normalizeGlobalTaskDefinitions(
				globalTaskDefinitionsOnDisk,
			);

			const packageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				scripts: {
					eslint: "eslint src",
				},
				fluidBuild: {
					tasks: {
						eslint: {
							dependsOn: [],
							files: {
								inputGlobs: [],
								outputGlobs: [],
								additionalConfigFiles: [".eslintrc.local.json"], // No "..." - replaces
							},
						},
					},
				},
			};

			const taskDefinitions = getTaskDefinitions(packageJson, globalTaskDefinitions, {
				isReleaseGroupRoot: false,
			});

			// Without "...", the package-level definition completely replaces the global one
			assert.deepStrictEqual(taskDefinitions.eslint.files?.additionalConfigFiles, [
				".eslintrc.local.json",
			]);
		});
	});

	describe("Global Task Definition Validation", () => {
		it("throws error when '...' is used in global additionalConfigFiles", () => {
			const globalTaskDefinitionsOnDisk: TaskDefinitionsOnDisk = {
				eslint: {
					dependsOn: [],
					files: {
						inputGlobs: [],
						outputGlobs: [],
						additionalConfigFiles: ["...", "some-config.json"],
					},
				},
			};

			assert.throws(
				() => normalizeGlobalTaskDefinitions(globalTaskDefinitionsOnDisk),
				/Invalid 'files.additionalConfigFiles' dependencies '...' for global task definition eslint/,
			);
		});

		it("throws error when '...' is used in global inputGlobs", () => {
			const globalTaskDefinitionsOnDisk: TaskDefinitionsOnDisk = {
				myTask: {
					dependsOn: [],
					files: {
						inputGlobs: ["...", "src/**/*.ts"],
						outputGlobs: [],
					},
				},
			};

			assert.throws(
				() => normalizeGlobalTaskDefinitions(globalTaskDefinitionsOnDisk),
				/Invalid 'files.inputGlobs' dependencies '...' for global task definition myTask/,
			);
		});

		it("throws error when '...' is used in global outputGlobs", () => {
			const globalTaskDefinitionsOnDisk: TaskDefinitionsOnDisk = {
				myTask: {
					dependsOn: [],
					files: {
						inputGlobs: [],
						outputGlobs: ["...", "dist/**/*.js"],
					},
				},
			};

			assert.throws(
				() => normalizeGlobalTaskDefinitions(globalTaskDefinitionsOnDisk),
				/Invalid 'files.outputGlobs' dependencies '...' for global task definition myTask/,
			);
		});

		it("allows valid global task definitions without '...'", () => {
			const globalTaskDefinitionsOnDisk: TaskDefinitionsOnDisk = {
				eslint: {
					dependsOn: [],
					files: {
						inputGlobs: ["src/**/*.ts"],
						outputGlobs: ["dist/**/*.js"],
						additionalConfigFiles: ["${repoRoot}/.eslintrc.cjs"],
					},
				},
			};

			// Should not throw
			const result = normalizeGlobalTaskDefinitions(globalTaskDefinitionsOnDisk);
			assert.deepStrictEqual(result.eslint.files?.additionalConfigFiles, [
				"${repoRoot}/.eslintrc.cjs",
			]);
		});

		it("rejects backslashes in global input globs instead of silently normalizing them", () => {
			assert.throws(
				() =>
					normalizeGlobalTaskDefinitions({
						myTask: {
							dependsOn: [],
							files: {
								inputGlobs: ["${repoRoot}\\src\\**\\*.ts"],
								outputGlobs: [],
							},
						},
					}),
				/contains backslashes; use '\/' in fluidBuild configuration\./,
			);
		});

		it("rejects backslashes in additional config files", () => {
			assert.throws(
				() =>
					normalizeGlobalTaskDefinitions({
						myTask: {
							dependsOn: [],
							files: {
								inputGlobs: [],
								outputGlobs: [],
								additionalConfigFiles: ["${repoRoot}\\common\\config.json"],
							},
						},
					}),
				/contains backslashes; use '\/' in fluidBuild configuration\./,
			);
		});
	});

	describe("Task Definition Resolution", () => {
		it("returns additionalConfigFiles from resolved task definition", () => {
			const globalTaskDefinitionsOnDisk: TaskDefinitionsOnDisk = {
				eslint: {
					dependsOn: [],
					files: {
						inputGlobs: ["src/**/*.ts"],
						outputGlobs: [],
						additionalConfigFiles: ["${repoRoot}/.eslintrc.cjs"],
					},
				},
			};

			const globalTaskDefinitions = normalizeGlobalTaskDefinitions(
				globalTaskDefinitionsOnDisk,
			);

			const packageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				scripts: {
					eslint: "eslint src",
				},
			};

			const taskDefinitions = getTaskDefinitions(packageJson, globalTaskDefinitions, {
				isReleaseGroupRoot: false,
			});

			// Verify the task definition contains the additionalConfigFiles
			assert.deepStrictEqual(taskDefinitions.eslint.files?.additionalConfigFiles, [
				"${repoRoot}/.eslintrc.cjs",
			]);
		});

		it("returns empty array when no additionalConfigFiles defined", () => {
			const globalTaskDefinitionsOnDisk: TaskDefinitionsOnDisk = {
				eslint: {
					dependsOn: [],
				},
			};

			const globalTaskDefinitions = normalizeGlobalTaskDefinitions(
				globalTaskDefinitionsOnDisk,
			);

			const packageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				scripts: {
					eslint: "eslint src",
				},
			};

			const taskDefinitions = getTaskDefinitions(packageJson, globalTaskDefinitions, {
				isReleaseGroupRoot: false,
			});

			// additionalConfigFiles should be undefined when not specified
			assert.strictEqual(taskDefinitions.eslint.files?.additionalConfigFiles, undefined);
		});

		it("preserves ${repoRoot} tokens in additionalConfigFiles for later resolution", () => {
			const globalTaskDefinitionsOnDisk: TaskDefinitionsOnDisk = {
				eslint: {
					dependsOn: [],
					files: {
						inputGlobs: [],
						outputGlobs: [],
						additionalConfigFiles: [
							"${repoRoot}/.eslintrc.cjs",
							"${repoRoot}/common/eslint-config.json",
							"./local-config.json",
						],
					},
				},
			};

			const globalTaskDefinitions = normalizeGlobalTaskDefinitions(
				globalTaskDefinitionsOnDisk,
			);

			const packageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				scripts: {
					eslint: "eslint src",
				},
			};

			const taskDefinitions = getTaskDefinitions(packageJson, globalTaskDefinitions, {
				isReleaseGroupRoot: false,
			});

			// Tokens should be preserved - they're resolved later by the task handler
			assert.deepStrictEqual(taskDefinitions.eslint.files?.additionalConfigFiles, [
				"${repoRoot}/.eslintrc.cjs",
				"${repoRoot}/common/eslint-config.json",
				"./local-config.json",
			]);
		});

		it("combines package additionalConfigFiles with global using '...'", () => {
			const globalTaskDefinitionsOnDisk: TaskDefinitionsOnDisk = {
				eslint: {
					dependsOn: [],
					files: {
						inputGlobs: [],
						outputGlobs: [],
						additionalConfigFiles: ["${repoRoot}/.eslintrc.cjs"],
					},
				},
			};

			const globalTaskDefinitions = normalizeGlobalTaskDefinitions(
				globalTaskDefinitionsOnDisk,
			);

			const packageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				scripts: {
					eslint: "eslint src",
				},
				fluidBuild: {
					tasks: {
						eslint: {
							dependsOn: [],
							files: {
								inputGlobs: [],
								outputGlobs: [],
								additionalConfigFiles: ["...", "./package-local.json"],
							},
						},
					},
				},
			};

			const taskDefinitions = getTaskDefinitions(packageJson, globalTaskDefinitions, {
				isReleaseGroupRoot: false,
			});

			// Package-local files come first, then inherited global files
			assert.deepStrictEqual(taskDefinitions.eslint.files?.additionalConfigFiles, [
				"./package-local.json",
				"${repoRoot}/.eslintrc.cjs",
			]);
		});

		it("rejects backslashes in package output globs instead of silently normalizing them", () => {
			const packageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				scripts: { build: "build" },
				fluidBuild: {
					tasks: {
						build: {
							dependsOn: [],
							files: {
								inputGlobs: [],
								outputGlobs: ["dist\\**\\*.js"],
							},
						},
					},
				},
			};

			assert.throws(
				() =>
					getTaskDefinitions(
						packageJson,
						{},
						{
							isReleaseGroupRoot: false,
						},
					),
				/contains backslashes; use '\/' in fluidBuild configuration\./,
			);
		});
	});
});

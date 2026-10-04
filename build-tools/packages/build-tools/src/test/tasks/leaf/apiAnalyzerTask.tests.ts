/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { GitRepo } from "../../../common/gitRepo.js";
import { Package } from "../../../common/npmPackage.js";
import type { ApiAnalyzerTaskSettings } from "../../../fluidBuild/apiAnalyzerTaskConfig.js";
import { BuildGraph } from "../../../fluidBuild/buildGraph.js";
import { BuildResult } from "../../../fluidBuild/buildResult.js";
import { options, parseOptions } from "../../../fluidBuild/options.js";
import {
	type ApiAnalyzerModule,
	runApiAnalyzer,
} from "../../../fluidBuild/tasks/apiAnalyzerRunner.js";

describe("Programmatic API analyzer execution", () => {
	const settings: ApiAnalyzerTaskSettings = {
		kind: "api-analyzer",
		analyzer: {},
		selections: { public: { releaseLevels: ["public"] } },
		profiles: { docs: ["model"], validate: [] },
		outputs: {
			model: { file: "model/api.json" },
			rollups: [{ selection: "public", directory: "types" }],
			reports: [{ entrypoint: ".", selection: "public", file: "reports/api.md" }],
		},
	};
	let directory: string;
	let calls: string[];
	let analyzer: ApiAnalyzerModule;
	beforeEach(async () => {
		directory = await mkdtemp(path.join(tmpdir(), "fluid-api-runner-"));
		calls = [];
		analyzer = {
			ReleaseLevel: { Public: 0, Beta: 1, Alpha: 2, Internal: 3 },
			async analyzeAPIs() {
				calls.push("analysis");
				return {
					ok: true,
					value: {
						configuration: {
							packageRoot: directory,
							project: path.join(directory, "tsconfig.json"),
							entrypoints: [{ name: ".", path: path.join(directory, "lib/index.d.ts") }],
						},
						generateModel() {
							calls.push("model");
							return "{}";
						},
						generateRollups(selection) {
							calls.push("rollups");
							assert.deepEqual(selection.releaseLevels, [0]);
							return { ok: true, value: { "index.d.ts": "export {};" } };
						},
						generateReport() {
							calls.push("report");
							return { ok: true, value: "report" };
						},
					},
				};
			},
		};
	});
	afterEach(async () => {
		await rm(directory, { recursive: true, force: true });
	});

	it("generates all configured outputs from one analysis", async () => {
		assert.deepEqual(
			await runApiAnalyzer(
				settings,
				{ reportMode: "update", profile: "all" },
				directory,
				analyzer,
			),
			[],
		);
		assert.deepEqual(calls, ["analysis", "model", "rollups", "report"]);
		assert.equal(await readFile(path.join(directory, "reports/api.md"), "utf8"), "report");
		assert.equal(
			await readFile(path.join(directory, "types/index.d.ts"), "utf8"),
			"export {};",
		);
	});

	it("reuses each generated variant across multiple destinations", async () => {
		const repeated = {
			...settings,
			outputs: {
				model: { file: "model/api.json" },
				rollups: [
					{ selection: "public", directory: "types" },
					{ selection: "public", directory: "other-types" },
				],
				reports: [
					{ entrypoint: ".", selection: "public", file: "api.md" },
					{ entrypoint: ".", selection: "public", file: "other-api.md" },
				],
			},
		};
		assert.deepEqual(
			await runApiAnalyzer(
				repeated,
				{ reportMode: "update", profile: "all" },
				directory,
				analyzer,
			),
			[],
		);
		assert.deepEqual(calls, ["analysis", "model", "rollups", "report"]);
	});

	it("publishes valid artifacts but reports a missing check baseline", async () => {
		assert.deepEqual(
			await runApiAnalyzer(
				settings,
				{ reportMode: "check", profile: "all" },
				directory,
				analyzer,
			),
			["API report missing: reports/api.md"],
		);
		assert.equal(await readFile(path.join(directory, "model/api.json"), "utf8"), "{}");
		await assert.rejects(readFile(path.join(directory, "reports/api.md")), { code: "ENOENT" });
	});

	it("does not generate or compare reports in a documentation-only profile", async () => {
		assert.deepEqual(
			await runApiAnalyzer(
				settings,
				{ reportMode: "update", profile: "docs" },
				directory,
				analyzer,
			),
			[],
		);
		assert.deepEqual(calls, ["analysis", "model"]);
	});

	it("generates its model even when the selected profile requests no other artifacts", async () => {
		assert.deepEqual(
			await runApiAnalyzer(
				settings,
				{ reportMode: "check", profile: "validate" },
				directory,
				analyzer,
			),
			[],
		);
		assert.deepEqual(calls, ["analysis", "model"]);
		assert.equal(await readFile(path.join(directory, "model/api.json"), "utf8"), "{}");
		await assert.rejects(readFile(path.join(directory, "reports/api.md")), { code: "ENOENT" });
		await assert.rejects(readFile(path.join(directory, "types/index.d.ts")), {
			code: "ENOENT",
		});
	});

	it("rejects a task without a model destination before analysis", async () => {
		await assert.rejects(
			runApiAnalyzer(
				{ ...settings, outputs: {} },
				{ reportMode: "check", profile: "validate" },
				directory,
				analyzer,
			),
			/model destination/,
		);
		assert.deepEqual(calls, []);
	});

	it("keeps check-only reports read-only in update mode", async () => {
		const checkOnly = {
			...settings,
			outputs: {
				model: { file: "model/api.json" },
				reports: [
					{ entrypoint: ".", selection: "public", file: "api.md", mode: "check" as const },
				],
			},
		};
		assert.deepEqual(
			await runApiAnalyzer(
				checkOnly,
				{ reportMode: "update", profile: "all" },
				directory,
				analyzer,
			),
			["API report missing: api.md"],
		);
		await assert.rejects(readFile(path.join(directory, "api.md")), { code: "ENOENT" });
	});

	it("writes nothing when generation fails after preparing the model", async () => {
		const original = analyzer.analyzeAPIs;
		analyzer.analyzeAPIs = async (...args) => {
			const result = await original(...args);
			assert(result.ok);
			result.value.generateRollups = () => ({ ok: false, diagnostics: ["unsupported"] });
			return result;
		};
		await assert.rejects(
			runApiAnalyzer(settings, { reportMode: "update", profile: "all" }, directory, analyzer),
			/unsupported/,
		);
		await assert.rejects(readFile(path.join(directory, "model/api.json")), { code: "ENOENT" });
		await assert.rejects(readFile(path.join(directory, ".fluid-build-api.lock")), {
			code: "ENOENT",
		});
	});

	it("preserves unrequested files and removes files from a removed output group", async () => {
		await runApiAnalyzer(
			settings,
			{ reportMode: "update", profile: "all" },
			directory,
			analyzer,
		);
		await runApiAnalyzer(
			settings,
			{ reportMode: "check", profile: "docs" },
			directory,
			analyzer,
		);
		assert.equal(
			await readFile(path.join(directory, "types/index.d.ts"), "utf8"),
			"export {};",
		);
		await runApiAnalyzer(
			{ ...settings, outputs: { model: { file: "model/api.json" } } },
			{ reportMode: "check", profile: "all" },
			directory,
			analyzer,
		);
		await assert.rejects(readFile(path.join(directory, "types/index.d.ts")), {
			code: "ENOENT",
		});
		assert.equal(await readFile(path.join(directory, "reports/api.md"), "utf8"), "report");
	});

	it("refuses input overlap, symlink outputs, and unowned generated files", async () => {
		for (const file of ["lib/index.d.ts", "../escape", "src/source.ts"]) {
			await assert.rejects(
				runApiAnalyzer(
					{ ...settings, outputs: { model: { file } } },
					{ reportMode: "update", profile: "all" },
					directory,
					analyzer,
				),
				/output/,
			);
		}
		await mkdir(path.join(directory, "destination"));
		await symlink("destination", path.join(directory, "linked"));
		await assert.rejects(
			runApiAnalyzer(
				{ ...settings, outputs: { model: { file: "linked/model.json" } } },
				{ reportMode: "update", profile: "all" },
				directory,
				analyzer,
			),
			/symlink/,
		);
		await writeFile(path.join(directory, "unowned.json"), "original");
		await assert.rejects(
			runApiAnalyzer(
				{ ...settings, outputs: { model: { file: "unowned.json" } } },
				{ reportMode: "update", profile: "all" },
				directory,
				analyzer,
			),
			/unowned/,
		);
		assert.equal(await readFile(path.join(directory, "unowned.json"), "utf8"), "original");
	});

	it("rejects concurrent ownership without removing another invocation's lock", async () => {
		await writeFile(path.join(directory, ".fluid-build-api.lock"), "owner");
		await assert.rejects(
			runApiAnalyzer(settings, { reportMode: "check", profile: "all" }, directory, analyzer),
			/lock exists/,
		);
		assert.equal(
			await readFile(path.join(directory, ".fluid-build-api.lock"), "utf8"),
			"owner",
		);
		assert.deepEqual(calls, []);
	});
});

describe("API analyzer build graph", () => {
	let directory: string;
	const fixture = fileURLToPath(
		new URL("../../../../src/test/data/api-analyzer/", import.meta.url),
	);
	const originalOptions = { ...options };
	beforeEach(async () => {
		directory = await mkdtemp(path.join(tmpdir(), "fluid-api-graph-"));
		await cp(path.join(fixture, "package"), directory, { recursive: true });
		await cp(path.join(fixture, "tool"), path.join(directory, "node_modules/api-analyzer"), {
			recursive: true,
		});
		options.apiReportMode = "update";
		options.apiOutputProfile = "all";
		options.worker = false;
	});
	afterEach(async () => {
		Object.assign(options, originalOptions);
		await rm(directory, { recursive: true, force: true });
	});

	/**
	 * Builds a fresh graph whose aliases all reach the fixture's one programmatic task.
	 *
	 * @returns The graph result after executing with the current test's invocation options.
	 */
	async function build(): Promise<BuildResult> {
		const pkg = new Package(path.join(directory, "package.json"), "test");
		pkg.setMatched();
		const graph = new BuildGraph(
			new Map([[pkg.name, pkg]]),
			[],
			{
				fluidBuildConfig: {},
				repoRoot: directory,
				gitRepo: new GitRepo(directory),
			},
			["compile", "build:docs", "api"],
			undefined,
			() => () => true,
		);
		return graph.build();
	}
	it("executes one shared leaf and skips unchanged inputs and outputs on the next build", async () => {
		assert.equal(await build(), BuildResult.Success);
		assert.equal(await readFile(path.join(directory, "calls.txt"), "utf8"), "analysis\n");
		assert.equal(await build(), BuildResult.UpToDate);
		assert.equal(await readFile(path.join(directory, "calls.txt"), "utf8"), "analysis\n");
	});

	it("keeps dependency-only aliases non-executing with optional caret prerequisites", async () => {
		const dependentDirectory = path.join(directory, "dependent");
		await cp(path.join(fixture, "dependent"), dependentDirectory, { recursive: true });
		const manifestPath = path.join(dependentDirectory, "package.json");
		const manifest = new Package(manifestPath, "test").packageJson;
		await writeFile(
			manifestPath,
			JSON.stringify({
				...manifest,
				fluidBuild: { tasks: { optional: { script: false, dependsOn: ["^missing-task"] } } },
			}),
		);
		const producer = new Package(path.join(directory, "package.json"), "test");
		const dependent = new Package(manifestPath, "test");
		dependent.setMatched();
		const graph = new BuildGraph(
			new Map([
				[producer.name, producer],
				[dependent.name, dependent],
			]),
			[],
			{ fluidBuildConfig: {}, repoRoot: directory, gitRepo: new GitRepo(directory) },
			["optional"],
			undefined,
			() => () => true,
		);
		assert.equal(await graph.build(), BuildResult.UpToDate);
		await assert.rejects(readFile(path.join(directory, "calls.txt")), { code: "ENOENT" });
		await assert.rejects(readFile(path.join(dependentDirectory, "calls.txt")), {
			code: "ENOENT",
		});
	});

	for (const changedFile of [
		"inputs/index.d.ts",
		"tsconfig.json",
		"types/index.d.ts",
		"model/api.json",
		"reports/api.md",
		"node_modules/api-analyzer/index.mjs",
	]) {
		it(`reruns after ${changedFile} changes`, async () => {
			assert.equal(await build(), BuildResult.Success);
			const file = path.join(directory, changedFile);
			await writeFile(file, `${await readFile(file, "utf8")}\n`);
			assert.equal(await build(), BuildResult.Success);
			assert.equal(
				await readFile(path.join(directory, "calls.txt"), "utf8"),
				"analysis\nanalysis\n",
			);
		});
	}

	it("regenerates a missing model and notices newly added inputs", async () => {
		assert.equal(await build(), BuildResult.Success);
		await rm(path.join(directory, "model/api.json"));
		assert.equal(await build(), BuildResult.Success);
		await writeFile(path.join(directory, "inputs/added.d.ts"), "export {};\n");
		assert.equal(await build(), BuildResult.Success);
		assert.equal(
			await readFile(path.join(directory, "calls.txt"), "utf8"),
			"analysis\nanalysis\nanalysis\n",
		);
	});

	it("tracks profile and report mode independently and never caches a failed comparison", async () => {
		options.apiOutputProfile = "validate";
		assert.equal(await build(), BuildResult.Success);
		assert.equal(await build(), BuildResult.UpToDate);
		options.apiOutputProfile = "all";
		assert.equal(await build(), BuildResult.Success);
		options.apiReportMode = "check";
		assert.equal(await build(), BuildResult.Success);
		assert.equal(await build(), BuildResult.UpToDate);
		await writeFile(path.join(directory, "reports/api.md"), "restored old baseline");
		assert.equal(await build(), BuildResult.Failed);
		await assert.rejects(readFile(path.join(directory, ".fluid-build-api.done.build.log")), {
			code: "ENOENT",
		});
		assert.equal(await build(), BuildResult.Failed);
	});

	it("runs conservatively when file tracking is not configured", async () => {
		const file = path.join(directory, "package.json");
		const manifest = new Package(file, "test").packageJson;
		const api = manifest.fluidBuild?.tasks?.api;
		assert(api !== undefined);
		const withoutTracking = Object.fromEntries(
			Object.entries(api).filter(([key]) => key !== "files"),
		);
		await writeFile(
			file,
			JSON.stringify({
				...manifest,
				fluidBuild: {
					...manifest.fluidBuild,
					tasks: { ...manifest.fluidBuild?.tasks, api: withoutTracking },
				},
			}),
		);
		assert.equal(await build(), BuildResult.Success);
		assert.equal(await build(), BuildResult.Success);
		assert.equal(
			await readFile(path.join(directory, "calls.txt"), "utf8"),
			"analysis\nanalysis\n",
		);
	});
	it("fails the graph when the report is missing while still publishing generated artifacts", async () => {
		options.apiReportMode = "check";
		assert.equal(await build(), BuildResult.Failed);
		assert.equal(
			await readFile(path.join(directory, "types/index.d.ts"), "utf8"),
			"export {};",
		);
		await assert.rejects(readFile(path.join(directory, "reports/api.md")), { code: "ENOENT" });
	});

	it("generates producer and consumer models in dependency order for validation", async () => {
		const dependentDirectory = path.join(directory, "dependent");
		await cp(path.join(fixture, "dependent"), dependentDirectory, { recursive: true });
		await mkdir(path.join(dependentDirectory, "node_modules"), { recursive: true });
		await symlink(
			directory,
			path.join(dependentDirectory, "node_modules/analyzer-pilot"),
			"dir",
		);
		const producer = new Package(path.join(directory, "package.json"), "test");
		const dependent = new Package(path.join(dependentDirectory, "package.json"), "test");
		dependent.setMatched();
		options.apiReportMode = "check";
		options.apiOutputProfile = "validate";
		const createGraph = (): BuildGraph =>
			new BuildGraph(
				new Map([
					[producer.name, producer],
					[dependent.name, dependent],
				]),
				[],
				{
					fluidBuildConfig: {},
					repoRoot: directory,
					gitRepo: new GitRepo(directory),
				},
				["api"],
				undefined,
				() => () => true,
			);
		assert.equal(await createGraph().build(), BuildResult.Success);
		assert.equal(await createGraph().build(), BuildResult.UpToDate);
		assert.equal(await readFile(path.join(directory, "calls.txt"), "utf8"), "analysis\n");
		assert.equal(
			await readFile(path.join(dependentDirectory, "calls.txt"), "utf8"),
			"analysis\n",
		);
		const producerModel: unknown = JSON.parse(
			await readFile(path.join(directory, "model/api.json"), "utf8"),
		);
		const dependentModel: unknown = JSON.parse(
			await readFile(path.join(dependentDirectory, "model/api.json"), "utf8"),
		);
		assert.deepEqual(producerModel, { packageName: producer.name });
		assert.deepEqual(dependentModel, { packageName: dependent.name });
		for (const file of [
			"types/index.d.ts",
			"reports/api.md",
			"dependent/types/index.d.ts",
			"dependent/reports/api.md",
		]) {
			await assert.rejects(readFile(path.join(directory, file)), { code: "ENOENT" });
		}
		await rm(path.join(directory, "model/api.json"));
		assert.equal(await createGraph().build(), BuildResult.Success);
		assert.equal(
			await readFile(path.join(directory, "calls.txt"), "utf8"),
			"analysis\nanalysis\n",
		);
		assert.equal(
			await readFile(path.join(dependentDirectory, "calls.txt"), "utf8"),
			"analysis\nanalysis\n",
		);
	});

	for (const missing of ["task", "model"] as const) {
		it(`rejects a local producer with no analyzer ${missing}`, async () => {
			const dependentDirectory = path.join(directory, "dependent");
			await cp(path.join(fixture, "dependent"), dependentDirectory, { recursive: true });
			const manifestPath = path.join(directory, "package.json");
			const manifest = new Package(manifestPath, "test").packageJson;
			const api = manifest.fluidBuild?.tasks?.api;
			assert(api !== undefined && "kind" in api && api.kind === "api-analyzer");
			const withoutModel = {
				...api,
				outputs: Object.fromEntries(
					Object.entries(api.outputs ?? {}).filter(([key]) => key !== "model"),
				),
			};
			const tasks =
				missing === "task" ? {} : { ...manifest.fluidBuild?.tasks, api: withoutModel };
			await writeFile(
				manifestPath,
				JSON.stringify({ ...manifest, fluidBuild: { ...manifest.fluidBuild, tasks } }),
			);
			const producer = new Package(manifestPath, "test");
			const dependent = new Package(path.join(dependentDirectory, "package.json"), "test");
			dependent.setMatched();
			assert.throws(
				() =>
					new BuildGraph(
						new Map([
							[producer.name, producer],
							[dependent.name, dependent],
						]),
						[],
						{
							fluidBuildConfig: {},
							repoRoot: directory,
							gitRepo: new GitRepo(directory),
						},
						["api"],
						undefined,
						() => () => true,
					),
				missing === "task"
					? /required.*api.*analyzer-pilot/
					: /analyzer-pilot.*model destination/,
			);
		});
	}
});

describe("API analyzer invocation options", () => {
	it("defaults to checking all outputs and accepts explicit update and profile options", () => {
		const savedOptions = structuredClone(options);
		const savedArgv = process.argv;
		try {
			assert.equal(options.apiReportMode, "check");
			assert.equal(options.apiOutputProfile, "all");
			process.argv = [
				"node",
				"fluid-build",
				"--api-report-mode",
				"update",
				"--api-output-profile",
				"docs",
			];
			parseOptions(process.argv);
			assert.equal(options.apiReportMode, "update");
			assert.equal(options.apiOutputProfile, "docs");
		} finally {
			process.argv = savedArgv;
			Object.assign(options, savedOptions);
		}
	});
});

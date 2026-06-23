/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert/strict";
import path from "node:path";

import {
	parseMarkdownLintCommand,
	resolveMarkdownLintCli2ConfigChain,
} from "../../../fluidBuild/tasks/leaf/markdownLintTask.js";
import { testDataPath } from "../../init.js";

const fixtureRoot = path.resolve(testDataPath, "markdownlint");

describe("MarkdownLintTask", () => {
	describe("parseMarkdownLintCommand", () => {
		it("parses a bare invocation with a single glob", () => {
			const r = parseMarkdownLintCommand('markdownlint-cli2 "**/*.md"');
			assert.deepEqual(r, {
				positiveEntries: ["**/*.md"],
				negativeEntries: [],
				noGlobs: false,
			});
		});

		it("parses --fix and a `#` negation", () => {
			const r = parseMarkdownLintCommand(
				'markdownlint-cli2 --fix "**/*.md" "#**/node_modules/**"',
			);
			assert.deepEqual(r, {
				positiveEntries: ["**/*.md"],
				negativeEntries: ["**/node_modules/**"],
				noGlobs: false,
			});
		});

		it("parses a `!` negation", () => {
			const r = parseMarkdownLintCommand("markdownlint-cli2 **/*.md !**/lib/**");
			assert.deepEqual(r, {
				positiveEntries: ["**/*.md"],
				negativeEntries: ["**/lib/**"],
				noGlobs: false,
			});
		});

		it("captures --config and --no-globs", () => {
			const r = parseMarkdownLintCommand(
				"markdownlint-cli2 --no-globs --config .markdownlint-cli2.jsonc docs/README.md",
			);
			assert.deepEqual(r, {
				positiveEntries: ["docs/README.md"],
				negativeEntries: [],
				noGlobs: true,
				explicitConfigPath: ".markdownlint-cli2.jsonc",
			});
		});

		it("returns undefined for an unrecognized flag", () => {
			assert.equal(
				parseMarkdownLintCommand("markdownlint-cli2 --unknown-flag *.md"),
				undefined,
			);
		});

		it("returns undefined when --config has no argument", () => {
			assert.equal(parseMarkdownLintCommand("markdownlint-cli2 --config"), undefined);
		});

		it("returns undefined when no positional entries are given", () => {
			assert.equal(parseMarkdownLintCommand("markdownlint-cli2 --fix"), undefined);
		});

		it("returns undefined for the legacy markdownlint binary", () => {
			assert.equal(parseMarkdownLintCommand("markdownlint --fix docs"), undefined);
		});

		it("returns undefined for a non-markdownlint executable", () => {
			assert.equal(parseMarkdownLintCommand("eslint --fix src"), undefined);
		});

		it("respects single-quoted entries", () => {
			const r = parseMarkdownLintCommand("markdownlint-cli2 '**/*.md' '#node_modules'");
			assert.deepEqual(r, {
				positiveEntries: ["**/*.md"],
				negativeEntries: ["node_modules"],
				noGlobs: false,
			});
		});
	});

	describe("resolveMarkdownLintCli2ConfigChain", () => {
		it("walks the require graph for a .cjs config", async () => {
			const dir = path.resolve(fixtureRoot, "cjs-chain");
			const chain = await resolveMarkdownLintCli2ConfigChain(dir, fixtureRoot);
			const relative = chain.map((p) => path.relative(dir, p)).sort();
			assert.deepEqual(relative, ["base.cjs", ".markdownlint-cli2.cjs"].sort());
		});

		it("follows `extends` for a .jsonc config", async () => {
			const dir = path.resolve(fixtureRoot, "jsonc-extends");
			const chain = await resolveMarkdownLintCli2ConfigChain(dir, fixtureRoot);
			const relative = chain.map((p) => path.relative(dir, p)).sort();
			assert.deepEqual(relative, ["base.jsonc", ".markdownlint-cli2.jsonc"].sort());
		});

		it("follows `extends` for a .yaml config", async () => {
			const dir = path.resolve(fixtureRoot, "yaml-extends");
			const chain = await resolveMarkdownLintCli2ConfigChain(dir, fixtureRoot);
			const relative = chain.map((p) => path.relative(dir, p)).sort();
			assert.deepEqual(relative, ["base.yaml", ".markdownlint-cli2.yaml"].sort());
		});

		it("includes the sibling main markdownlint config", async () => {
			const dir = path.resolve(fixtureRoot, "sibling-main");
			const chain = await resolveMarkdownLintCli2ConfigChain(dir, fixtureRoot);
			const relative = chain.map((p) => path.relative(dir, p)).sort();
			assert.deepEqual(relative, [".markdownlint-cli2.cjs", ".markdownlint.json"].sort());
		});

		it("returns an empty list when no config exists", async () => {
			const dir = path.resolve(fixtureRoot, "no-config");
			const chain = await resolveMarkdownLintCli2ConfigChain(dir, fixtureRoot);
			assert.deepEqual(chain, []);
		});

		it("honors an explicit --config path", async () => {
			const dir = path.resolve(fixtureRoot, "no-config");
			// Point at a config that lives outside the lint dir but inside the fixture root.
			const explicit = path.resolve(fixtureRoot, "jsonc-extends/.markdownlint-cli2.jsonc");
			const chain = await resolveMarkdownLintCli2ConfigChain(dir, fixtureRoot, explicit);
			const relative = chain.map((p) => path.relative(fixtureRoot, p)).sort();
			assert.deepEqual(
				relative,
				[
					path.join("jsonc-extends", ".markdownlint-cli2.jsonc"),
					path.join("jsonc-extends", "base.jsonc"),
				].sort(),
			);
		});

		it("ignores files outside the repo root", async () => {
			const dir = path.resolve(fixtureRoot, "cjs-chain");
			// Use the fixture itself as the repo root; everything resolves inside it.
			const chain = await resolveMarkdownLintCli2ConfigChain(dir, dir);
			for (const p of chain) {
				assert.ok(!path.relative(dir, p).startsWith(".."), `expected ${p} to be under ${dir}`);
			}
		});
	});
});

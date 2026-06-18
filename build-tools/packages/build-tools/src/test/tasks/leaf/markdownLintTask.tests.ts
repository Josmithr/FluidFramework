/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert/strict";
import { parseMarkdownLintCommand } from "../../../fluidBuild/tasks/leaf/markdownLintTask.js";

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
});

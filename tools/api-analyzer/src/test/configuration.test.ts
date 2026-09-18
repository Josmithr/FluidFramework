/* eslint-disable unicorn/no-null -- Null is an input normalization case and the explicit unresolved readonly state. */

import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "mocha";
import type { Configuration } from "../analysis-types/configuration.js";
import { resolveConfiguration } from "../configuration.js";

describe("Effective configuration", () => {
	// Design requirement: W11.
	it("merges ordered bases and rules without mutating inputs", () => {
		const base: Configuration = Object.freeze({
			packageName: "example",
			project: "tsconfig.json",
			entrypoints: Object.freeze([{ name: ".", path: "index.d.ts" }]),
			rules: Object.freeze({ requireReleaseLevel: true, validateTsdocSyntax: true }),
			customModifierTags: ["@partner"],
		});
		const result = resolveConfiguration(
			{
				extends: [base, { rules: { validateTsdocSyntax: false } }],
				entrypoints: [{ name: "./other", path: "other.d.ts" }],
			},
			"/workspace",
		);
		assert.equal(result.ok, true);
		if (!result.ok) {
			return;
		}
		assert.equal(result.value.project, path.resolve("/workspace/tsconfig.json"));
		assert.deepEqual(result.value.rules, {
			requireReleaseLevel: true,
			validateTsdocSyntax: false,
		});
		assert.deepEqual(result.value.customModifierTags, ["@partner"]);
		assert.deepEqual(result.value.entrypoints, [
			{ name: "./other", path: path.resolve("/workspace/other.d.ts") },
		]);
		assert.equal(base.rules?.validateTsdocSyntax, true);
		assert(Object.isFrozen(result.value.entrypoints[0]));
		assert(Object.isFrozen(result.value.rules));
	});

	it("allows an inherited package-documentation requirement to be disabled", () => {
		const result = resolveConfiguration(
			{
				extends: [
					{
						packageName: "example",
						project: "tsconfig.json",
						entrypoints: [{ name: ".", path: "index.d.ts" }],
						rules: { requirePackageDocumentation: true },
					},
				],
				rules: { requirePackageDocumentation: false },
			},
			"/workspace",
		);
		assert.equal(result.ok, true, JSON.stringify(result));
		assert.equal(result.value.rules.requirePackageDocumentation, false);
	});

	// Design requirement: W11.
	it("preserves defaults and nested precedence across partial layers", () => {
		const result = resolveConfiguration(
			{
				extends: [
					{ packageName: "base", project: "base.json" },
					{ extends: [{ project: "nested.json" }], packageName: "later" },
				],
				project: "local.json",
				entrypoints: [{ name: ".", path: "index.d.ts" }],
			},
			"/workspace",
		);
		assert.equal(result.ok, true);
		if (!result.ok) {
			return;
		}
		assert.equal(result.value.packageName, "later");
		assert.equal(result.value.project, path.resolve("/workspace/local.json"));
		assert.equal(result.value.packageRoot, path.resolve("/workspace"));
		assert.deepEqual(result.value.rules, {});
	});

	// Design requirement: W11.
	it("rejects an empty replacement entrypoint array", () => {
		const result = resolveConfiguration(
			{
				extends: [
					{
						packageName: "example",
						project: "tsconfig.json",
						entrypoints: [{ name: ".", path: "index.d.ts" }],
					},
				],
				entrypoints: [],
			},
			"/workspace",
		);
		assert.equal(result.ok, false);
		if (!result.ok) {
			assert.equal(result.diagnostics[0]?.code, "configuration-required");
		}
	});

	// Design requirement: W11.
	it("treats nullish layer values as omitted", () => {
		const base: Configuration = {
			packageName: "example",
			project: "tsconfig.json",
			entrypoints: [{ name: ".", path: "index.d.ts" }],
			rules: { requireReleaseLevel: false },
		};
		const configuration = {
			extends: [base],
			packageName: undefined,
			project: null,
			entrypoints: undefined,
			rules: null,
		} as unknown as Configuration;
		assert.deepEqual(
			resolveConfiguration(configuration, "/workspace"),
			resolveConfiguration(base, "/workspace"),
		);
	});

	// Design requirement: W11.
	it("reports schema validation failures as diagnostics", () => {
		const internalError = new assert.AssertionError({
			message: "Internal configuration failure",
		});
		assert.throws(
			() =>
				resolveConfiguration(
					{
						get extends(): readonly Configuration[] {
							throw internalError;
						},
					},
					"/workspace",
				),
			(error: unknown) => error === internalError,
		);

		// Bypass static types to check invalid values supplied at runtime.
		const configuration = { packageName: 42 } as unknown as Configuration;
		const result = resolveConfiguration(configuration, "/workspace");
		assert.equal(result.ok, false);
		if (!result.ok) {
			assert.equal(result.diagnostics[0]?.code, "configuration-invalid");
			assert.match(result.diagnostics[0]?.message ?? "", /packageName/);
		}
	});

	// Design requirement: W11.
	it("validates entrypoint structure and rule values", () => {
		for (const invalid of [
			{ entrypoints: [null] },
			{ entrypoints: [{ name: "." }] },
			{ entrypoints: [{ name: 42, path: "index.d.ts" }] },
			{ rules: [] },
			{ rules: { requireReleaseLevel: "false" } },
			{ rules: { unknown: true } },
			{ customModifierTags: [42] },
			{ suite: ["dependency"] },
		]) {
			const configuration = {
				packageName: "example",
				project: "tsconfig.json",
				entrypoints: [{ name: ".", path: "index.d.ts" }],
				...invalid,
			} as unknown as Configuration;
			const result = resolveConfiguration(configuration, "/workspace");
			assert.equal(result.ok, false);
			if (!result.ok) {
				assert.equal(result.diagnostics[0]?.code, "configuration-invalid");
			}
		}
	});

	// Design requirement: W11.
	it("rejects cycles but permits a shared base", () => {
		const cycle: Configuration = {};
		Object.assign(cycle, { extends: [cycle] });
		const failed = resolveConfiguration(cycle, "/workspace");
		assert.equal(failed.ok, false);
		if (!failed.ok) {
			assert.equal(failed.diagnostics[0]?.code, "configuration-cycle");
		}
		const base = {
			packageName: "example",
			project: "tsconfig.json",
			entrypoints: [{ name: ".", path: "index.d.ts" }],
		};
		assert.equal(
			resolveConfiguration(
				{ extends: [{ extends: [base] }, { extends: [base] }] },
				"/workspace",
			).ok,
			true,
		);
	});

	// Design requirement: W11.
	it("rejects missing settings and duplicate entrypoint names", () => {
		assert.equal(resolveConfiguration({}, "/workspace").ok, false);
		const result = resolveConfiguration(
			{
				packageName: "example",
				project: "tsconfig.json",
				entrypoints: [
					{ name: ".", path: "a.d.ts" },
					{ name: ".", path: "b.d.ts" },
				],
			},
			"/workspace",
		);
		assert.equal(result.ok, false);
		if (!result.ok) {
			assert.equal(result.diagnostics[0]?.code, "duplicate-entrypoint");
		}
	});
});

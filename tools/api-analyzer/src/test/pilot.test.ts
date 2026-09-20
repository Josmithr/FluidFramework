import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
	cpSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "mocha";
import {
	createSourceFile,
	ScriptTarget,
	SyntaxKind,
	isExportDeclaration,
	isNamedExports,
	isFunctionDeclaration,
	isInterfaceDeclaration,
	isEnumDeclaration,
	isTypeAliasDeclaration,
} from "typescript6";
import { analyzeAPIs, ReleaseLevel } from "../index.js";
import { decodeDependencyModel } from "../model-generation/dependencyModel.js";

describe("Repository pilot", () => {
	it("checks the package's complete API report without rewriting the baseline", () => {
		const root = new URL("../../", import.meta.url);
		const reportFile = new URL("api-report/api-analyzer.api.md", root);
		const before = readFileSync(reportFile, "utf8");
		const modified = statSync(reportFile).mtimeMs;
		execFileSync(
			process.execPath,
			[fileURLToPath(new URL("lib/generateApiReport.js", root)), "--check"],
			{ cwd: tmpdir(), stdio: "pipe" },
		);
		assert.equal(readFileSync(reportFile, "utf8"), before);
		assert.equal(statSync(reportFile).mtimeMs, modified);
		const source = createSourceFile(
			"index.d.ts",
			readFileSync(new URL("lib/index.d.ts", root), "utf8"),
			ScriptTarget.Latest,
			true,
		);
		const names = source.statements.flatMap((statement) =>
			isExportDeclaration(statement) &&
			statement.exportClause !== undefined &&
			isNamedExports(statement.exportClause)
				? statement.exportClause.elements.map((element) => element.name.text)
				: [],
		);
		const body = /```ts\n([\S\s]*?)\n```/.exec(before)?.[1];
		assert(body !== undefined);
		const printed = createSourceFile("report.d.ts", body, ScriptTarget.Latest, true);
		const reported = printed.statements.flatMap((statement) => {
			if (
				isExportDeclaration(statement) &&
				statement.exportClause !== undefined &&
				isNamedExports(statement.exportClause)
			) {
				return statement.exportClause.elements.map((element) => element.name.text);
			}
			return (isFunctionDeclaration(statement) ||
				isInterfaceDeclaration(statement) ||
				isEnumDeclaration(statement) ||
				isTypeAliasDeclaration(statement)) &&
				statement.modifiers?.some((modifier) => modifier.kind === SyntaxKind.ExportKeyword) ===
					true &&
				statement.name !== undefined
				? [statement.name.text]
				: [];
		});
		assert.deepEqual(reported.sort(), names.sort());

		// Export coverage alone accepts Thing_1 as Thing. This collision-free surface must also keep its local names.
		const declarations = printed.statements.flatMap((statement) =>
			(isFunctionDeclaration(statement) ||
				isInterfaceDeclaration(statement) ||
				isEnumDeclaration(statement) ||
				isTypeAliasDeclaration(statement)) &&
			statement.name !== undefined
				? [statement.name.text]
				: [],
		);
		assert.deepEqual(declarations.sort(), names.sort());
		assert.doesNotMatch(before, /^ +\/\/[^\n]*@(public|beta|alpha|internal)/m);
		assert.match(before, /\/\/ @public\ndeclare interface APIAnalysis/);
		assert.equal(before.includes("// No selected exports."), false);
	});

	it("rejects stale and missing self-reports without accepting changes", () => {
		const directory = mkdtempSync(path.join(tmpdir(), "api-analyzer-self-report-"));
		const root = new URL("../../", import.meta.url);
		try {
			cpSync(new URL("lib/", root), path.join(directory, "lib"), { recursive: true });
			for (const name of ["package.json", "tsconfig.api-reports.json"]) {
				cpSync(new URL(name, root), path.join(directory, name));
			}
			symlinkSync(
				fileURLToPath(new URL("node_modules/", root)),
				path.join(directory, "node_modules"),
				"dir",
			);
			mkdirSync(path.join(directory, "api-report"));
			const report = path.join(directory, "api-report/api-analyzer.api.md");
			writeFileSync(report, "stale baseline\n");
			const args = [path.join(directory, "lib/generateApiReport.js"), "--check"];
			assert.throws(
				() => execFileSync(process.execPath, args, { cwd: tmpdir(), stdio: "pipe" }),
				/API report is stale/,
			);
			assert.equal(readFileSync(report, "utf8"), "stale baseline\n");
			rmSync(report);
			assert.throws(
				() => execFileSync(process.execPath, args, { cwd: tmpdir(), stdio: "pipe" }),
				/ENOENT/,
			);
			assert.throws(() => readFileSync(report), { code: "ENOENT" });
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	it("analyzes core-utils declarations with configured legacy policy and detached outputs", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "api-analyzer-pilot-"));
		const packageRoot = fileURLToPath(
			new URL("../../../../packages/common/core-utils/", import.meta.url),
		);
		const input = path.join(packageRoot, "lib/compare.d.ts");
		try {
			const project = path.join(directory, "tsconfig.json");
			writeFileSync(
				project,
				JSON.stringify({
					compilerOptions: { strict: true, module: "NodeNext", types: [] },
					files: [input],
				}),
			);
			const levels = [
				ReleaseLevel.Public,
				ReleaseLevel.Beta,
				ReleaseLevel.Alpha,
				ReleaseLevel.Internal,
			];
			const result = await analyzeAPIs({
				packageName: "@fluidframework/core-utils",
				packageRoot,
				project,
				entrypoints: [{ name: "./compare", path: input }],
				customModifierTags: ["@legacy"],
				referencePolicies: {
					releaseCompatibility: true,
					entrypointExposure: true,
					directional: [
						{
							name: "no-current-to-legacy",
							source: { releaseLevels: levels, excludeTags: ["@legacy"] },
							target: { releaseLevels: levels, requireTags: ["@legacy"] },
						},
					],
				},
			});
			assert.equal(result.ok, true, JSON.stringify(result));
			const current = result.value.generateReport("./compare", {
				name: "current",
				releaseLevels: levels,
				excludeTags: ["@legacy"],
			});
			const legacy = result.value.generateReport("./compare", {
				name: "legacy",
				releaseLevels: levels,
				requireTags: ["@legacy"],
			});
			assert.equal(current.ok, true);
			assert.equal(legacy.ok, true);
			assert.equal(current.value.includes("compareArrays"), false);
			assert.equal(legacy.value.includes("compareArrays"), true);
			assert.equal(
				decodeDependencyModel(result.value.generateModel(), "@fluidframework/core-utils").ok,
				true,
			);
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});
});

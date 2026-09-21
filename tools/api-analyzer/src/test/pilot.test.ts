import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
	cpSync,
	existsSync,
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
	it("checks the package's portable model without rewriting the baseline", () => {
		const root = new URL("../../", import.meta.url);
		const modelFile = new URL("api-model/api-analyzer.api.json", root);
		const before = readFileSync(modelFile, "utf8");
		const modified = statSync(modelFile).mtimeMs;
		execFileSync(
			process.execPath,
			[fileURLToPath(new URL("lib/generateApiArtifacts.js", root)), "--model", "--check"],
			{ cwd: tmpdir(), stdio: "pipe" },
		);
		assert.equal(readFileSync(modelFile, "utf8"), before);
		assert.equal(statSync(modelFile).mtimeMs, modified);
		const decoded = decodeDependencyModel(before, "api-analyzer");
		assert(decoded.ok, JSON.stringify(decoded));
		const model = decoded.value;
		assert.equal(model.version, 1);
		assert.equal(model.identityVersion, 1);
		assert.deepEqual(model.dependencyModels, []);
		assert.deepEqual(
			model.graph.surfaces.map((surface) => surface.name),
			[".", "./model"],
		);
		for (const [entrypoint, file] of [
			[".", "lib/index.d.ts"],
			["./model", "lib/model.d.ts"],
		] as const) {
			const source = createSourceFile(
				file,
				readFileSync(new URL(file, root), "utf8"),
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
			const surface = model.graph.surfaces.find((current) => current.name === entrypoint);
			assert(surface !== undefined);
			assert.deepEqual(surface.exports.map((entry) => entry.name).sort(), names.sort());
			assert(model.inputFiles.some((input) => input.file === file));
		}
		const declaration = model.graph.declarations.find(
			(current) => current.name === "ModelDeclaration",
		);
		assert(declaration !== undefined);
		const statementMember = declaration.members.find((member) => member.name === "statement");
		assert(statementMember !== undefined);
		const statementType = model.graph.declarations.find(
			(current) => current.name === "ModelDeclarationStatement",
		);
		assert(statementType !== undefined);
		assert(
			statementMember.typeExcerpt.tokens.some(
				(token) => token.kind === "Reference" && token.target === statementType.id,
			),
		);
	});

	it("checks the package's complete API report without rewriting the baseline", () => {
		const root = new URL("../../", import.meta.url);
		const reportFile = new URL("api-report/api-analyzer.api.md", root);
		const before = readFileSync(reportFile, "utf8");
		const modified = statSync(reportFile).mtimeMs;
		execFileSync(
			process.execPath,
			[fileURLToPath(new URL("lib/generateApiArtifacts.js", root)), "--report", "--check"],
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
		assert.match(before, /\/\/ @public @sealed\ndeclare interface APIAnalysis/);
		assert.equal(before.includes("// No selected exports."), false);
	});

	it("generates selected self-artifacts and checks them without accepting changes", () => {
		const directory = mkdtempSync(path.join(tmpdir(), "api-analyzer-self-artifacts-"));
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
			const script = path.join(directory, "lib/generateApiArtifacts.js");
			const artifacts = [
				{
					flag: "--report",
					file: "api-report/api-analyzer.api.md",
					error: /API report is stale/,
				},
				{
					flag: "--model",
					file: "api-model/api-analyzer.api.json",
					error: /API model is stale/,
				},
			];
			execFileSync(process.execPath, [script], { cwd: tmpdir(), stdio: "pipe" });
			for (const artifact of artifacts) {
				assert.equal(
					readFileSync(path.join(directory, artifact.file), "utf8"),
					readFileSync(new URL(artifact.file, root), "utf8"),
				);
			}
			const baselineModified = artifacts.map(
				(artifact) => statSync(path.join(directory, artifact.file)).mtimeMs,
			);
			execFileSync(process.execPath, [script, "--check"], { cwd: tmpdir(), stdio: "pipe" });
			for (const args of [
				["--unknown"],
				["--report", "--model"],
				["--model", "--model"],
				["--check", "--check"],
			]) {
				assert.throws(
					() =>
						execFileSync(process.execPath, [script, ...args], {
							cwd: tmpdir(),
							stdio: "pipe",
						}),
					/Supported arguments/,
				);
			}
			assert.deepEqual(
				artifacts.map((artifact) => statSync(path.join(directory, artifact.file)).mtimeMs),
				baselineModified,
			);
			for (const artifact of artifacts) {
				const sibling = artifacts.find((current) => current !== artifact);
				assert(sibling !== undefined);
				const siblingFile = path.join(directory, sibling.file);
				const siblingModified = statSync(siblingFile).mtimeMs;
				execFileSync(process.execPath, [script, artifact.flag], {
					cwd: tmpdir(),
					stdio: "pipe",
				});
				assert.equal(statSync(siblingFile).mtimeMs, siblingModified);
			}
			for (const artifact of artifacts) {
				const destination = path.join(directory, artifact.file);
				writeFileSync(destination, "stale baseline\n");
				const modified = statSync(destination).mtimeMs;
				const args = [script, artifact.flag, "--check"];
				assert.throws(
					() => execFileSync(process.execPath, args, { cwd: tmpdir(), stdio: "pipe" }),
					artifact.error,
				);
				assert.equal(readFileSync(destination, "utf8"), "stale baseline\n");
				assert.equal(statSync(destination).mtimeMs, modified);
				rmSync(path.dirname(destination), { recursive: true });
				assert.throws(
					() => execFileSync(process.execPath, args, { cwd: tmpdir(), stdio: "pipe" }),
					/ENOENT/,
				);
				assert.equal(existsSync(path.dirname(destination)), false);
			}
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

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { after, before, describe, it } from "mocha";
import { SyntaxKind } from "typescript/unstable/ast";
import {
	isExportDeclaration,
	isPropertySignatureDeclaration,
	isTypeLiteralNode,
} from "typescript/unstable/ast/is";
import {
	API,
	NodeBuilderFlags,
	SignatureKind,
	SymbolFlags,
	type Project,
	type Snapshot,
	type Symbol as CompilerSymbol,
} from "typescript/unstable/async";

const require = createRequire(import.meta.url);
const fixtureDirectory = fileURLToPath(new URL("../../src/test/fixtures/", import.meta.url));
const compilerOptions = {
	target: "ES2022",
	module: "NodeNext",
	strict: true,
	types: [],
	declaration: true,
	emitDeclarationOnly: true,
	removeComments: false,
	rootDir: "src",
	outDir: "declarations",
};

for (const compilerPackage of ["typescript6", "typescript"] as const) {
	describe(`Native TS7 capabilities: inputs built with ${compilerPackage}`, () => {
		let directory: string;
		let api: API;
		let snapshot: Snapshot;
		let project: Project;
		let exports: readonly CompilerSymbol[];

		before(async () => {
			assert.equal(require("typescript/package.json").version, "7.0.2");
			assert.equal(require("typescript6/package.json").version, "6.0.3");
			directory = mkdtempSync(path.join(tmpdir(), "api-analyzer-"));
			cpSync(fixtureDirectory, path.join(directory, "src"), { recursive: true });
			writeFileSync(path.join(directory, "package.json"), JSON.stringify({ type: "module" }));
			writeFileSync(
				path.join(directory, "build.json"),
				JSON.stringify({ compilerOptions, include: ["src"] }),
			);
			const compilerDirectory = path.dirname(
				require.resolve(`${compilerPackage}/package.json`),
			);
			const version = execFileSync(
				process.execPath,
				[path.join(compilerDirectory, "bin/tsc"), "--version"],
				{ encoding: "utf8" },
			).trim();
			console.log(`Fixture build: ${version}; analysis: TypeScript 7.0.2`);
			execFileSync(
				process.execPath,
				[path.join(compilerDirectory, "bin/tsc"), "-p", "build.json"],
				{
					cwd: directory,
					stdio: "pipe",
					timeout: 15000,
				},
			);
			const configFileName = path.join(directory, "tsconfig.json");
			writeFileSync(
				configFileName,
				JSON.stringify({
					compilerOptions: {
						target: "ES2022",
						module: "NodeNext",
						strict: true,
						types: [],
						noEmit: true,
					},
					include: ["declarations"],
				}),
			);
			api = new API({ cwd: directory, collectTiming: true });
			snapshot = await api.updateSnapshot({ openProjects: [configFileName] });
			const openedProject = snapshot.getProject(configFileName);
			assert.ok(openedProject, "The configured declaration project must be available");
			project = openedProject;
			const source = await project.program.getSourceFile(
				path.join(directory, "declarations/index.d.ts"),
			);
			assert.ok(source);
			const moduleSymbol = await project.checker.getSymbolAtLocation(source);
			assert.ok(moduleSymbol);
			exports = await project.checker.getExportsOfModule(moduleSymbol);
		});

		after(async () => {
			try {
				await api?.close();
			} finally {
				if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
			}
		});

		async function target(name: string): Promise<CompilerSymbol> {
			const exported = exports.find((symbol) => symbol.name === name);
			assert.ok(exported, `Missing export: ${name}`);
			return (exported.flags & SymbolFlags.Alias) !== 0
				? project.checker.getAliasedSymbol(exported)
				: exported;
		}

		async function members(name: string): Promise<Readonly<Record<string, string>>> {
			const declared = await project.checker.getDeclaredTypeOfSymbol(await target(name));
			const properties = await project.checker.getPropertiesOfType(declared);
			const entries = await Promise.all(
				properties.map(async (property) => {
					const type = await project.checker.getTypeOfSymbol(property);
					assert.ok(type);
					return [property.name, await project.checker.typeToString(type)] as const;
				}),
			);
			return Object.fromEntries(entries);
		}

		it("W4: declaration inputs have no compiler diagnostics", async () => {
			assert.deepEqual(await project.program.getSyntacticDiagnostics(), []);
			assert.deepEqual(await project.program.getSemanticDiagnostics(), []);
			assert.deepEqual(await project.program.getProgramDiagnostics(), []);
		});

		it("B1/B2: preserves exported aliases, target identity, and type-only syntax", async () => {
			assert.equal((await target("PublicIdentity")).id, (await target("TypeIdentity")).id);
			assert.equal((await target("PublicIdentity")).name, "Identity");
			const source = await project.program.getSourceFile(
				path.join(directory, "declarations/index.d.ts"),
			);
			assert.ok(source);
			const declarations = source.statements.filter(isExportDeclaration);
			assert.equal(declarations[0]?.isTypeOnly, false);
			assert.equal(declarations[1]?.isTypeOnly, true);
			assert.ok(exports.some((symbol) => symbol.name === "ApiNamespace"));
		});

		it("F1: specializes inherited interface and class members", async () => {
			assert.equal((await members("Derived")).value, "string");
			assert.equal((await members("DerivedClass")).value, "string");
		});

		it("F1: computes ordinary intersections and utility member selections", async () => {
			assert.deepEqual(await members("Combined"), {
				value: "string",
				optional: "number | undefined",
				count: "number",
				enabled: "boolean",
			});
			assert.deepEqual(await members("Selected"), {
				value: "string",
				optional: "number | undefined",
			});
			assert.deepEqual(await members("Omitted"), {
				value: "string",
				optional: "number | undefined",
				enabled: "boolean",
			});
			assert.deepEqual(await members("Frozen"), {
				value: "string",
				optional: "number | undefined",
			});
			const frozen = await project.checker.getDeclaredTypeOfSymbol(await target("Frozen"));
			const optional = await project.checker.getPropertyOfType(frozen, "optional");
			assert.ok(optional);
			assert.notEqual(optional.flags & SymbolFlags.Optional, 0);
		});

		it("F4: exposes callable overloads and preserves declaration comments", async () => {
			const symbol = await target("convert");
			const type = await project.checker.getTypeOfSymbol(symbol);
			assert.ok(type);
			const signatures = await project.checker.getSignaturesOfType(type, SignatureKind.Call);
			assert.equal(signatures.length, 2);
			const comments = await project.checker.getDocumentationCommentOfSymbol(symbol);
			assert.match(comments, /Public overload documentation/);
			const declarations = readFileSync(path.join(directory, "declarations/api.d.ts"), "utf8");
			assert.match(declarations, /@public/);
			assert.match(declarations, /@internal/);
			for (const signature of signatures) {
				assert.ok(await signature.declaration?.resolve());
			}
			const firstDeclaration = await signatures[0]?.declaration?.resolve();
			const secondDeclaration = await signatures[1]?.declaration?.resolve();
			assert.ok(firstDeclaration && secondDeclaration);
			assert.match(firstDeclaration.getFullText(), /Public overload documentation.*@public/);
			assert.match(
				secondDeclaration.getFullText(),
				/Internal overload documentation.*@internal/,
			);
		});

		it("F1: materializes readonly and optional modifiers through public type nodes", async () => {
			const frozen = await project.checker.getDeclaredTypeOfSymbol(await target("Frozen"));
			const node = await project.checker.typeToTypeNode(
				frozen,
				undefined,
				NodeBuilderFlags.InTypeAlias,
			);
			assert.ok(
				node && isTypeLiteralNode(node),
				"A structural type node must expose effective modifiers",
			);
			assert.equal(node.members.length, 2);
			for (const member of node.members) {
				assert.ok(isPropertySignatureDeclaration(member));
				assert.ok(
					member.modifiers?.some((modifier) => modifier.kind === SyntaxKind.ReadonlyKeyword),
				);
			}
			assert.equal(
				node.members.filter(
					(member) =>
						isPropertySignatureDeclaration(member) &&
						member.postfixToken?.kind === SyntaxKind.QuestionToken,
				).length,
				1,
			);
			const printed = await project.emitter.printNode(node);
			assert.match(printed, /readonly value: string/);
			console.log(`Effective readonly type: ${printed.trim()}`);
		});

		it("W5 baseline: printed complete declarations compile with both consumer compilers", async () => {
			for (const name of ["api", "index"]) {
				const source = await project.program.getSourceFile(
					path.join(directory, `declarations/${name}.d.ts`),
				);
				assert.ok(source);
				writeFileSync(
					path.join(directory, `${name}.d.ts`),
					await project.emitter.printNode(source),
				);
			}
			writeFileSync(
				path.join(directory, "consumer.ts"),
				[
					'import { PublicIdentity, convert } from "./index.js";',
					'import type { TypeIdentity, Frozen, Derived } from "./index.js";',
					"const identity: TypeIdentity = new PublicIdentity();",
					"const text: string = identity.getIdentity();",
					"const derived: Derived = { value: text, count: 1 };",
					"const frozen: Frozen = { value: convert(derived.value) };",
					"// @ts-expect-error Readonly must survive declaration printing.",
					'frozen.value = "changed";',
					"// @ts-expect-error An exported type-only alias is not a value.",
					"new TypeIdentity();",
				].join("\n"),
			);
			writeFileSync(
				path.join(directory, "consumer.json"),
				JSON.stringify({
					compilerOptions: {
						target: "ES2022",
						module: "NodeNext",
						strict: true,
						types: [],
						noEmit: true,
					},
					files: ["consumer.ts"],
				}),
			);
			for (const consumerCompiler of ["typescript6", "typescript"]) {
				const compilerDirectory = path.dirname(
					require.resolve(`${consumerCompiler}/package.json`),
				);
				execFileSync(
					process.execPath,
					[path.join(compilerDirectory, "bin/tsc"), "-p", "consumer.json"],
					{
						cwd: directory,
						stdio: "pipe",
						timeout: 15000,
					},
				);
			}
		});

		it("W6: reuses a snapshot and cached exports for output-like queries", async () => {
			const namespace = await target("ApiNamespace");
			const first = await namespace.getExports();
			await api.resetTimingInfo();
			const second = await namespace.getExports();
			const timing = await api.getTimingInfo();
			assert.strictEqual(first, second);
			assert.ok(timing.enabled);
			assert.equal(
				timing.totals.requestCount,
				0,
				"A cached export lookup must not query the compiler again",
			);
			assert.ok(!timing.recentRequests.some((request) => request.method === "updateSnapshot"));
			assert.ok(
				!timing.recentRequests.some((request) => request.method === "getExportsOfModule"),
			);
			assert.strictEqual(snapshot.getProject(project.configFileName), project);
			assert.deepEqual(await members("Derived"), await members("Derived"));
			console.log(`Cached export query timing: ${JSON.stringify(timing.totals)}`);
		});

		it("GATE W5: retained Program exposes declaration emission", () => {
			assert.ok(
				"emit" in project.program || "getDeclarationEmit" in project.program,
				"TS7 7.0.2 has no public Program declaration emit method; a generation strategy needs review",
			);
		});
	});
}

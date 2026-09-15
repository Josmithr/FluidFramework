import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
} from "typescript/unstable/sync";
import { resolveConfiguration } from "../configuration.js";
import {
	aliasTypeOnly,
	collect,
	exportsOf,
	exportTypeOnly,
	identity,
	members as extractMembers,
	origin,
	signatures,
	target as resolveTarget,
	type CollectionState,
	type LocationContext,
} from "../nativeAdapter.js";
import { createAnalysisSession } from "../session.js";

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
	describe(`Native TS7 sync capabilities: inputs built with ${compilerPackage}`, () => {
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

		// Design requirement: W4.
		it("declaration inputs have no compiler diagnostics", async () => {
			assert.deepEqual(await project.program.getSyntacticDiagnostics(), []);
			assert.deepEqual(await project.program.getSemanticDiagnostics(), []);
			assert.deepEqual(await project.program.getProgramDiagnostics(), []);
		});

		// Design regressions: B1, B2.
		it("preserves exported aliases, target identity, and type-only syntax", async () => {
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

		// Design feature: F1.
		it("specializes inherited interface and class members", async () => {
			assert.equal((await members("Derived")).value, "string");
			assert.equal((await members("DerivedClass")).value, "string");
		});

		// Design feature: F1.
		it("computes ordinary intersections and utility member selections", async () => {
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

		// Design feature: F4.
		it("exposes callable overloads and preserves declaration comments", async () => {
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

		// Design feature: F1.
		it("materializes readonly and optional modifiers through public type nodes", async () => {
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

		// Design requirement: W5; baseline for declaration generation.
		it("printed complete declarations compile with both consumer compilers", async () => {
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

		// Design requirement: W6.
		it("reuses a snapshot and cached exports for repeated semantic queries", async () => {
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

		describe("Adapter fact extraction", () => {
			it("location lookup uses only the supplied cache and package settings", () => {
				const ownerDirectory = path.join(directory, "owner");
				mkdirSync(ownerDirectory);
				const manifest = path.join(ownerDirectory, "package.json");
				writeFileSync(manifest, JSON.stringify({ name: "dependency" }));
				const fileName = path.join(ownerDirectory, "index.d.ts");
				const locations: LocationContext = {
					configuration: { packageName: "fixture", packageRoot: directory },
					packageCache: new Map(),
				};
				try {
					assert.deepEqual(origin(locations, fileName, 17), {
						packageName: "dependency",
						file: "index.d.ts",
						start: 17,
					});
					writeFileSync(manifest, JSON.stringify({ name: "updated" }));
					// A new extraction must supply a new cache after package metadata changes.
					assert.equal(origin(locations, fileName, 0).packageName, "dependency");
					const fresh: LocationContext = { ...locations, packageCache: new Map() };
					assert.equal(origin(fresh, fileName, 0).packageName, "updated");
					assert.equal(locations.packageCache.size, 1);
					assert.equal(fresh.packageCache.size, 1);
					assert.equal(
						origin(locations, path.join(directory, "declarations/index.d.ts"), 0).packageName,
						"fixture",
					);
				} finally {
					rmSync(ownerDirectory, { recursive: true, force: true });
				}
			});

			it("alias helpers preserve targets and type-only export status", () => {
				const locations: LocationContext = {
					configuration: { packageName: "fixture", packageRoot: directory },
					packageCache: new Map(),
				};
				const publicAlias = exports.find((symbol) => symbol.name === "PublicIdentity");
				const typeAlias = exports.find((symbol) => symbol.name === "TypeIdentity");
				assert.ok(publicAlias && typeAlias);
				const resolved = resolveTarget(project.checker, publicAlias);
				assert.strictEqual(resolveTarget(project.checker, resolved), resolved);
				assert.equal(
					identity(locations, resolved),
					identity(locations, resolveTarget(project.checker, typeAlias)),
				);
				assert.equal(aliasTypeOnly(project.checker, publicAlias), false);
				assert.equal(aliasTypeOnly(project.checker, typeAlias), true);
				assert.equal(aliasTypeOnly(project.checker, typeAlias, new Set([typeAlias])), false);
				const source = project.program.getSourceFile(
					path.join(directory, "declarations/index.d.ts"),
				);
				assert.ok(source);
				const moduleSymbol = project.checker.getSymbolAtLocation(source);
				assert.ok(moduleSymbol);
				const seen = new Set<string>();
				assert.equal(
					exportTypeOnly(project.checker, locations, moduleSymbol, "TypeIdentity", seen),
					true,
				);
				assert.equal(
					exportTypeOnly(project.checker, locations, moduleSymbol, "PublicIdentity", seen),
					false,
				);
				assert.equal(seen.size, 0);
			});

			it("extracts specialized members, modifiers, and documented overloads without collection state", async () => {
				const locations: LocationContext = {
					configuration: { packageName: "fixture", packageRoot: directory },
					packageCache: new Map(),
				};
				const derived = await target("Derived");
				const derivedType = project.checker.getDeclaredTypeOfSymbol(derived);
				assert.equal(
					extractMembers(project, locations, derivedType).find(
						(member) => member.name === "value",
					)?.type,
					"string",
				);
				const frozen = await target("Frozen");
				const frozenMembers = extractMembers(
					project,
					locations,
					project.checker.getDeclaredTypeOfSymbol(frozen),
				);
				assert.equal(frozenMembers.find((member) => member.name === "value")?.readonly, true);
				assert.equal(
					frozenMembers.find((member) => member.name === "optional")?.optional,
					true,
				);
				const callable = await target("convert");
				const callableType = project.checker.getTypeOfSymbol(callable);
				assert.ok(callableType);
				const result = signatures(project, callableType, "owner");
				assert.equal(result.length, 2);
				assert.equal(new Set(result.map((signature) => signature.id)).size, 2);
				assert.ok(result.every((signature) => signature.id.startsWith("owner:")));
				assert.ok(result.some((signature) => signature.documentation.includes("@public")));
				assert.ok(result.some((signature) => signature.documentation.includes("@internal")));
			});

			it("collection helpers keep traversal state separate between calls", () => {
				const locations: LocationContext = {
					configuration: { packageName: "fixture", packageRoot: directory },
					packageCache: new Map(),
				};
				const source = project.program.getSourceFile(
					path.join(directory, "declarations/index.d.ts"),
				);
				assert.ok(source);
				const moduleSymbol = project.checker.getSymbolAtLocation(source);
				assert.ok(moduleSymbol);
				const state: CollectionState = { declarations: new Map(), visiting: new Set() };
				const bindings = exportsOf(project, locations, state, moduleSymbol);
				assert.ok(bindings.every((binding) => state.declarations.has(binding.target)));
				assert.equal(state.visiting.size, 0);
				const id = collect(project, locations, state, moduleSymbol);
				const completed = state.declarations.get(id);
				assert.ok(completed);
				assert.equal(collect(project, locations, state, moduleSymbol), id);
				assert.strictEqual(state.declarations.get(id), completed);
				// An active identifier stops a recursive visit before another fact is collected.
				const active: CollectionState = { declarations: new Map(), visiting: new Set([id]) };
				assert.equal(collect(project, locations, active, moduleSymbol), id);
				assert.equal(active.declarations.size, 0);
				const fresh: CollectionState = { declarations: new Map(), visiting: new Set() };
				assert.equal(
					collect(project, { ...locations, packageCache: new Map() }, fresh, moduleSymbol),
					id,
				);
				assert.deepEqual(fresh.declarations, state.declarations);
				assert.notStrictEqual(fresh.declarations.get(id), completed);
				assert.equal(fresh.visiting.size, 0);
			});

			// Design requirement: W4.
			it("session analyzes built declarations without leaking compiler state", () => {
				const configuration = resolveConfiguration(
					{
						packageName: "fixture",
						project: "tsconfig.json",
						entrypoints: [{ name: ".", path: "declarations/index.d.ts" }],
					},
					directory,
				);
				assert.ok(configuration.ok);
				const session = createAnalysisSession();
				try {
					const first = session.analyze(configuration.value);
					assert.ok(first.ok, JSON.stringify(first));
					assert.equal(
						first.value.declarations.find((item) => item.name === "convert")?.signatures
							.length,
						2,
					);
					assert.equal(
						first.value.declarations
							.find((item) => item.name === "Derived")
							?.members.find((member) => member.name === "value")?.type,
						"string",
					);
					const second = session.analyze(configuration.value);
					assert.ok(second.ok);
					assert.strictEqual(second.value, first.value);
					session.close();
					assert.deepEqual(JSON.parse(JSON.stringify(first.value)), first.value);
				} finally {
					session.close();
				}
			});
		});

		// Temporary capability probe for design requirement W5. Replace with declaration-output
		// tests when the generation strategy is selected; this currently fails on TS7 7.0.2.
		it("retained Program exposes declaration emission", () => {
			assert.ok(
				"emit" in project.program || "getDeclarationEmit" in project.program,
				"TS7 7.0.2 has no public Program declaration emit method; a generation strategy needs review",
			);
		});
	});
}

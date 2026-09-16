/* eslint-disable no-bitwise -- TypeScript exposes symbol flags as bit masks. */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { TSDocParser } from "@microsoft/tsdoc";
import { after, before as beforeAll, describe, it } from "mocha";
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
import { bindDocumentationReferences } from "../documentation.js";
import type { AnalysisFacts, DocumentationReferenceLookup } from "../facts.js";
import {
	classifyApiItems,
	ReleaseLevel,
	selectApiItems,
	createReviewReport,
	renderReviewReport,
	compareReviewBaseline,
	resolveDocumentation,
	DiagnosticCode,
} from "../index.js";
import {
	aliasTypeOnly,
	collect,
	collectLinks,
	exportsOf,
	exportTypeOnly,
	identity,
	members as extractMembers,
	origin as resolveOrigin,
	signatures as extractSignatures,
	target as resolveTarget,
	type CollectionState,
	type LocationContext,
} from "../nativeAdapter.js";
import { createAnalysisSession } from "../session.js";
import { assertSnapshot } from "./snapshotUtils.js";

describe("Adapter fact extraction: documentation links", () => {
	it("preserves traversal order, repeated references, and lookup outcomes without changing the tree", () => {
		const parsed = new TSDocParser().parseString(`/**
 * {@link base | Base label} {@link missing} {@link example#base}
 * {@link https://example.com | Website}
 * @remarks See {@link base}.
 * @param value - See {@link parameter}.
 * @returns See {@link result}.
 */`);
		assert.deepEqual(
			parsed.log.messages.map((message) => message.text),
			[],
		);
		const before = parsed.docComment.emitAsTsdoc();
		const references: string[] = [];
		const outcomes: DocumentationReferenceLookup[] = [];
		const links = collectLinks(parsed.docComment, (reference) => {
			const text = reference.emitAsTsdoc();
			references.push(text);
			const outcome: DocumentationReferenceLookup =
				text === "missing"
					? { reference: text, status: "not-found" }
					: text === "example#base"
						? { reference: text, status: "unsupported" }
						: { reference: text, status: "resolved", target: `target:${text}` };
			outcomes.push(outcome);
			return outcome;
		});
		assert.deepEqual(references, [
			"base",
			"missing",
			"example#base",
			"base",
			"parameter",
			"result",
		]);
		assert.deepEqual(links, outcomes);
		for (const [index, outcome] of outcomes.entries()) {
			assert.equal(links[index], outcome);
		}
		assert.equal(parsed.docComment.emitAsTsdoc(), before);
	});

	it("returns a fresh empty array without lookup for comments with no API links", () => {
		for (const comment of [
			"/** */",
			"/** Plain documentation. */",
			"/** {@link https://example.com | Website} */",
			"/** {@inheritDoc base} */",
		]) {
			const parsed = new TSDocParser().parseString(comment);
			assert.deepEqual(
				parsed.log.messages.map((message) => message.text),
				[],
			);
			const lookup = (): never => {
				assert.fail("Comments without API links must not invoke lookup.");
			};
			const links = collectLinks(parsed.docComment, lookup);
			assert.deepEqual(links, []);
			assert.notEqual(links, collectLinks(parsed.docComment, lookup));
		}
	});

	it("propagates lookup exceptions and stops traversal", () => {
		const parsed = new TSDocParser().parseString("/** {@link first} {@link second} */");
		assert.deepEqual(
			parsed.log.messages.map((message) => message.text),
			[],
		);
		const error = new Error("Lookup failed.");
		const references: string[] = [];
		assert.throws(
			() =>
				collectLinks(parsed.docComment, (reference) => {
					references.push(reference.emitAsTsdoc());
					throw error;
				}),
			(thrown: unknown) => thrown === error,
		);
		assert.deepEqual(references, ["first"]);
	});
});

const require = createRequire(import.meta.url);
const fixtureDirectory = fileURLToPath(
	new URL("../../src/test/fixtures/shared/", import.meta.url),
);
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

/**
 * Function documentation binding scenarios tested with both supported declaration-build compilers.
 *
 * @remarks
 * Each case uses a checked-in module in `fixtures/native`. `name` identifies its file and assertion failures.
 * The module's `derived` function requests documentation from `reference` through an explicit `@inheritDoc` tag.
 * `expected` is the required diagnostic code, or `undefined` when binding must succeed.
 *
 * TypeScript 6 and TypeScript 7 build the declarations. TypeScript 7 analyzes both sets of inputs.
 * Binding runs after the analysis session closes, using facts that contain no compiler objects.
 * These cases check target lookup and conservative parameter checks, not TypeScript assignability.
 */
const documentationBindingCases = [
	// An imported alias names a function in another module of the same package.
	// Lookup must follow the alias to the function rather than treat the alias as the target declaration.
	{
		name: "imported",
		reference: "imported",
		expected: undefined,
	},
	// An export alias is not a local declaration name. Lookup must use the module's exports
	// when it finds no symbol with this name in the original declaration scope.
	{
		name: "alias",
		reference: "alias",
		expected: undefined,
	},
	// The reference syntax is supported, but no target exists. Report a reference error,
	// not an unsupported-feature diagnostic or a successful binding with no target.
	{
		name: "missing",
		reference: "missing",
		expected: DiagnosticCode.DocumentationReference,
	},
	// The target has two overloads, although one matches the derived function's parameter type.
	// The current binder must reject the ambiguity rather than select the first or closest overload.
	// TODO (Stage 2 overload binding): Revisit this expectation when overload selection is defined.
	// Add uniquely selected and genuinely ambiguous targets, and verify that overload order has no effect.
	{
		name: "overload",
		reference: "base",
		expected: DiagnosticCode.DocumentationReference,
	},
	// Parameter types match, but their names differ. Copying parameter documentation would
	// require renaming its references, which the current binder does not support.
	// TODO (Stage 2 parameter compatibility): Extend the renamed, optional, rest, and generic cases
	// with actual parameter and type-parameter documentation. Separate supported transformations
	// from unsafe mismatches; do not change all rejection expectations to success.
	{
		name: "renamed",
		reference: "base",
		expected: DiagnosticCode.DocumentationReference,
	},
	// The target parameter is optional and the derived parameter is required.
	// Matching names are not sufficient: the optional parameter flags must also match.
	{
		name: "optional",
		reference: "base",
		expected: DiagnosticCode.DocumentationReference,
	},
	// Both parameters have the same name and array type, but only the target uses a rest parameter.
	// The binder must retain and compare rest parameter flags rather than compare only names or types.
	{
		name: "rest",
		reference: "base",
		expected: DiagnosticCode.DocumentationReference,
	},
	// The target declares a type parameter, but the derived function declares none.
	// Reject the mismatch because inherited type-parameter documentation would have no matching parameter.
	{
		name: "generic",
		reference: "base",
		expected: DiagnosticCode.DocumentationReference,
	},
	// The target destructures an object instead of declaring a parameter identifier.
	// Its property name must not be treated as a parameter name that matches the derived function.
	// TODO (Stage 2 parameter compatibility): Add object and array binding patterns with documentation
	// when parameter adaptation is defined. Retain failures where no unambiguous mapping exists.
	{
		name: "pattern",
		reference: "base",
		expected: DiagnosticCode.DocumentationReference,
	},
	// Package-qualified syntax is unsupported even when it names the package under analysis.
	// Reject the syntax before lookup; the absent target must not turn this into a missing-name error.
	// TODO (Stage 2 qualified references): Once this syntax is supported, expect a missing-target
	// diagnostic here and add a successful case with an existing target in the named package.
	{
		name: "qualified",
		reference: "example#base",
		expected: DiagnosticCode.DocumentationUnsupported,
	},
	// The target exists and has one signature, but the reference includes an unsupported TSDoc selector.
	// The binder must not ignore the selector merely because an unqualified lookup could succeed.
	// TODO (Stage 2 overload binding): Make this valid selector succeed when selector support is added.
	// Add invalid selectors and selectors for distinct overloads to verify that the selector is applied.
	{
		name: "selector",
		reference: "(base:1)",
		expected: DiagnosticCode.DocumentationUnsupported,
	},
	// Lookup succeeds, but the target is a variable rather than a standalone function.
	// Finding a symbol does not establish that its declaration form supports documentation binding.
	// TODO (Stage 2 declaration support): Revisit this diagnostic under the cross-declaration inheritance
	// contract. Add valid non-function inheritance cases without assuming a function can inherit from any variable.
	{
		name: "nonfunction",
		reference: "base",
		expected: DiagnosticCode.DocumentationUnsupported,
	},
] as const;

for (const compilerPackage of ["typescript6", "typescript"] as const) {
	describe(`Native TS7 sync capabilities: inputs built with ${compilerPackage}`, () => {
		let directory: string;
		let api: API;
		let snapshot: Snapshot;
		let project: Project;
		let exports: readonly CompilerSymbol[];

		beforeAll(() => {
			assert.equal(
				(require("typescript/package.json") as { version: string }).version,
				"7.0.2",
			);
			assert.equal(
				(require("typescript6/package.json") as { version: string }).version,
				"6.0.3",
			);
			directory = mkdtempSync(path.join(tmpdir(), "api-analyzer-"));
			cpSync(fixtureDirectory, path.join(directory, "src"), { recursive: true });
			cpSync(
				new URL("../../src/test/fixtures/native/", import.meta.url),
				path.join(directory, "src"),
				{ recursive: true },
			);
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
			snapshot = api.updateSnapshot({ openProjects: [configFileName] });
			const openedProject = snapshot.getProject(configFileName);
			assert.ok(openedProject, "The configured declaration project must be available");
			project = openedProject;
			const source = project.program.getSourceFile(
				path.join(directory, "declarations/index.d.ts"),
			);
			assert.ok(source);
			const moduleSymbol = project.checker.getSymbolAtLocation(source);
			assert.ok(moduleSymbol);
			exports = project.checker.getExportsOfModule(moduleSymbol);
		});

		after(() => {
			try {
				api?.close();
			} finally {
				if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
			}
		});

		function target(name: string): CompilerSymbol {
			const exported = exports.find((symbol) => symbol.name === name);
			assert.ok(exported, `Missing export: ${name}`);
			return (exported.flags & SymbolFlags.Alias) === 0
				? exported
				: project.checker.getAliasedSymbol(exported);
		}

		function members(name: string): Readonly<Record<string, string>> {
			const declared = project.checker.getDeclaredTypeOfSymbol(target(name));
			const properties = project.checker.getPropertiesOfType(declared);
			const entries = properties.map((property) => {
				const type = project.checker.getTypeOfSymbol(property);
				assert.ok(type);
				return [property.name, project.checker.typeToString(type)] as const;
			});
			return Object.fromEntries(entries);
		}

		// Design requirement: W4.
		it("declaration inputs have no compiler diagnostics", () => {
			assert.deepEqual(project.program.getSyntacticDiagnostics(), []);
			assert.deepEqual(project.program.getSemanticDiagnostics(), []);
			assert.deepEqual(project.program.getProgramDiagnostics(), []);
		});

		// Design regressions: B1, B2.
		it("preserves exported aliases, target identity, and type-only syntax", () => {
			assert.equal(target("PublicIdentity").id, target("TypeIdentity").id);
			assert.equal(target("PublicIdentity").name, "Identity");
			const source = project.program.getSourceFile(
				path.join(directory, "declarations/index.d.ts"),
			);
			assert.ok(source);
			const declarations = source.statements.filter(isExportDeclaration);
			assert.equal(declarations[0]?.isTypeOnly, false);
			assert.equal(declarations[1]?.isTypeOnly, true);
			assert.ok(exports.some((symbol) => symbol.name === "ApiNamespace"));
		});

		// Design feature: F1.
		it("specializes inherited interface and class members", () => {
			assert.equal(members("Derived").value, "string");
			assert.equal(members("DerivedClass").value, "string");
		});

		// Design feature: F1.
		it("computes ordinary intersections and utility member selections", () => {
			assert.deepEqual(members("Combined"), {
				value: "string",
				optional: "number | undefined",
				count: "number",
				enabled: "boolean",
			});
			assert.deepEqual(members("Selected"), {
				value: "string",
				optional: "number | undefined",
			});
			assert.deepEqual(members("Omitted"), {
				value: "string",
				optional: "number | undefined",
				enabled: "boolean",
			});
			assert.deepEqual(members("Frozen"), {
				value: "string",
				optional: "number | undefined",
			});
			const frozen = project.checker.getDeclaredTypeOfSymbol(target("Frozen"));
			const optional = project.checker.getPropertyOfType(frozen, "optional");
			assert.ok(optional);
			assert.notEqual(optional.flags & SymbolFlags.Optional, 0);
		});

		// Design feature: F4.
		it("exposes callable overloads and preserves declaration comments", () => {
			const symbol = target("convert");
			const type = project.checker.getTypeOfSymbol(symbol);
			assert.ok(type);
			const signatures = project.checker.getSignaturesOfType(type, SignatureKind.Call);
			assert.equal(signatures.length, 2);
			const comments = project.checker.getDocumentationCommentOfSymbol(symbol);
			assert.match(comments, /Public overload documentation/);
			const declarations = readFileSync(path.join(directory, "declarations/api.d.ts"), "utf8");
			assert.match(declarations, /@public/);
			assert.match(declarations, /@internal/);
			for (const signature of signatures) {
				assert.ok(signature.declaration?.resolve());
			}
			const firstDeclaration = signatures[0]?.declaration?.resolve();
			const secondDeclaration = signatures[1]?.declaration?.resolve();
			assert.ok(firstDeclaration && secondDeclaration);
			assert.match(firstDeclaration.getFullText(), /Public overload documentation.*@public/);
			assert.match(
				secondDeclaration.getFullText(),
				/Internal overload documentation.*@internal/,
			);
		});

		// Design feature: F1.
		it("materializes readonly and optional modifiers through public type nodes", () => {
			const frozen = project.checker.getDeclaredTypeOfSymbol(target("Frozen"));
			const node = project.checker.typeToTypeNode(
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
				assert.equal(
					member.modifiers?.some((modifier) => modifier.kind === SyntaxKind.ReadonlyKeyword),
					true,
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
			const printed = project.emitter.printNode(node);
			assert.match(printed, /readonly value: string/);
			console.log(`Effective readonly type: ${printed.trim()}`);
		});

		// Design requirement: W5; baseline for declaration generation.
		it("printed complete declarations compile with both consumer compilers", () => {
			for (const name of ["api", "index"]) {
				const source = project.program.getSourceFile(
					path.join(directory, `declarations/${name}.d.ts`),
				);
				assert.ok(source);
				writeFileSync(path.join(directory, `${name}.d.ts`), project.emitter.printNode(source));
			}
			cpSync(
				new URL("../../src/test/fixtures/consumer/consumer.ts", import.meta.url),
				path.join(directory, "consumer.ts"),
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
		it("reuses a snapshot and cached exports for repeated semantic queries", () => {
			const namespace = target("ApiNamespace");
			const first = namespace.getExports();
			api.resetTimingInfo();
			const second = namespace.getExports();
			const timing = api.getTimingInfo();
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
			assert.deepEqual(members("Derived"), members("Derived"));
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
					assert.deepEqual(resolveOrigin(locations, fileName, 17), {
						packageName: "dependency",
						file: "index.d.ts",
						start: 17,
					});
					writeFileSync(manifest, JSON.stringify({ name: "updated" }));
					// A new extraction must supply a new cache after package metadata changes.
					assert.equal(resolveOrigin(locations, fileName, 0).packageName, "dependency");
					const fresh: LocationContext = { ...locations, packageCache: new Map() };
					assert.equal(resolveOrigin(fresh, fileName, 0).packageName, "updated");
					assert.equal(locations.packageCache.size, 1);
					assert.equal(fresh.packageCache.size, 1);
					assert.equal(
						resolveOrigin(locations, path.join(directory, "declarations/index.d.ts"), 0)
							.packageName,
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

			it("extracts specialized members, modifiers, and documented overloads without collection state", () => {
				const locations: LocationContext = {
					configuration: { packageName: "fixture", packageRoot: directory },
					packageCache: new Map(),
				};
				const derived = target("Derived");
				const derivedType = project.checker.getDeclaredTypeOfSymbol(derived);
				assert.equal(
					extractMembers(project, locations, derivedType).find(
						(member) => member.name === "value",
					)?.type,
					"string",
				);
				const frozen = target("Frozen");
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
				const callable = target("convert");
				const callableType = project.checker.getTypeOfSymbol(callable);
				assert.ok(callableType);
				const result = extractSignatures(project, callableType, "owner");
				assert.equal(result.length, 2);
				assert.equal(new Set(result.map((signature) => signature.id)).size, 2);
				assert.ok(result.every((signature) => signature.id.startsWith("owner:")));
				assert.equal(
					result.some((signature) => signature.documentation?.includes("@public") === true),
					true,
				);
				assert.equal(
					result.some((signature) => signature.documentation?.includes("@internal") === true),
					true,
				);
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

		describe("Release classification and metadata selection", () => {
			// Design feature: F3. Declaration emit must retain explicit empty documentation.
			it("preserves absent and empty comments through declaration emit and session disposal", () => {
				const configuration = resolveConfiguration(
					{
						packageName: "fixture",
						project: "tsconfig.json",
						entrypoints: [{ name: ".", path: "declarations/comments.d.ts" }],
					},
					directory,
				);
				assert.ok(configuration.ok);
				const session = createAnalysisSession();
				try {
					const analysis = session.analyze(configuration.value);
					assert.ok(analysis.ok, JSON.stringify(analysis));
					session.close();
					const comments = analysis.value.declarations.map((item) => ({
						name: item.name,
						documentation: item.signatures[0]?.documentation,
					}));
					assert.deepEqual(comments, [
						{ name: "absent", documentation: undefined },
						{ name: "documented", documentation: "/** Closest. @public */" },
						{ name: "empty", documentation: "/** */" },
						{ name: "ordinary", documentation: undefined },
					]);
					const restored = JSON.parse(JSON.stringify(comments)) as typeof comments;
					assert.equal(restored[0]?.documentation, undefined);
					assert.equal(restored[2]?.documentation, "/** */");
					const metadata = classifyApiItems(
						comments.map((item) => ({ id: item.name, documentation: item.documentation })),
						{ rules: { requireReleaseLevel: false } },
					);
					assert.ok(metadata.ok, JSON.stringify(metadata));
					assert.equal(
						metadata.value.items.find((item) => item.id === "documented")?.releaseLevel,
						ReleaseLevel.Public,
					);
				} finally {
					session.close();
				}
			});

			// Design features and requirements: F4, W6. Selection reuses detached callable facts.
			it("selects callable overloads from built declarations after the session closes", () => {
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
					const analysis = session.analyze(configuration.value);
					assert.ok(analysis.ok, JSON.stringify(analysis));
					const overloads = analysis.value.declarations.find(
						(item) => item.name === "convert",
					)?.signatures;
					assert.ok(overloads);
					assert.equal(overloads.length, 2);
					session.close();
					const before = JSON.stringify(analysis.value);
					const metadata = classifyApiItems(overloads);
					assert.ok(metadata.ok, JSON.stringify(metadata));
					const publicView = selectApiItems(metadata.value, {
						name: "public",
						releaseLevels: [ReleaseLevel.Public],
					});
					assert.ok(publicView.ok);
					assert.equal(publicView.value.items.length, 1);
					assert.equal(
						publicView.value.items[0]?.id,
						overloads.find((item) => item.documentation?.includes("@public") === true)?.id,
					);
					const complete = selectApiItems(metadata.value, {
						name: "complete",
						releaseLevels: [
							ReleaseLevel.Public,
							ReleaseLevel.Beta,
							ReleaseLevel.Alpha,
							ReleaseLevel.Internal,
						],
					});
					assert.ok(complete.ok);
					assert.equal(complete.value.items.length, 2);
					assert.equal(JSON.stringify(analysis.value), before);
					assert.equal(session.getStatistics().analyses, 1);
				} finally {
					session.close();
				}
			});
		});

		describe("Explicit documentation inheritance", () => {
			it("retains API link lookup facts without accepting un-validated links", () => {
				const configuration = resolveConfiguration(
					{
						packageName: "example",
						project: "tsconfig.json",
						entrypoints: [
							{ name: ".", path: "declarations/documentation-links-reexport.d.ts" },
						],
					},
					directory,
				);
				assert.equal(configuration.ok, true);
				const session = createAnalysisSession();
				try {
					const analysis = session.analyze(configuration.value);
					assert.equal(analysis.ok, true);
					session.close();
					const before = JSON.stringify(analysis.value);
					const linked = analysis.value.declarations.find((entry) => entry.name === "linked");
					assert.ok(linked);
					const signature = linked.signatures[0];
					assert.ok(signature?.documentationContext);
					const context = signature.documentationContext;
					assert.equal(context.origin.file, "declarations/documentation-links.d.ts");
					assert.equal(context.origin.packageName, "example");
					assert.equal(context.inheritance, undefined);
					const localBase = analysis.value.declarations.find(
						(entry) =>
							entry.name === "base" && entry.declarations[0]?.file === context.origin.file,
					);
					const importedBase = analysis.value.declarations.find(
						(entry) =>
							entry.name === "base" &&
							entry.declarations[0]?.file === "declarations/inheritance.d.ts",
					);
					const hidden = analysis.value.declarations.find((entry) => entry.name === "hidden");
					const overloaded = analysis.value.declarations.find(
						(entry) => entry.name === "overloaded",
					);
					assert.ok(localBase);
					assert.ok(importedBase);
					assert.ok(hidden);
					assert.ok(overloaded);
					assert.deepEqual(context.links, [
						{ reference: "base", status: "resolved", target: localBase.id },
						{ reference: "imported", status: "resolved", target: importedBase.id },
						{ reference: "alias", status: "resolved", target: localBase.id },
						{ reference: "hidden", status: "resolved", target: hidden.id },
						{ reference: "overloaded", status: "resolved", target: overloaded.id },
						{ reference: "missing", status: "not-found" },
						{ reference: "example#base", status: "unsupported" },
						{ reference: "(base:1)", status: "unsupported" },
						{ reference: "linked", status: "resolved", target: linked.id },
						{ reference: "imported", status: "resolved", target: importedBase.id },
						{ reference: "base", status: "resolved", target: localBase.id },
					]);
					assert.equal(overloaded.signatures.length, 2);
					assert.equal(hidden.declarations[0]?.kind, "VariableDeclaration");
					assert.equal(
						analysis.value.surfaces[0]?.exports.some((entry) => entry.target === hidden.id),
						false,
					);
					assert.deepEqual(localBase.signatures[0]?.documentationContext?.links, [
						{ reference: "linked", status: "resolved", target: linked.id },
					]);
					assert.deepEqual(importedBase.signatures[0]?.documentationContext?.links, []);
					assert.equal(Object.isFrozen(context.links), true);
					assert.equal(context.links.every(Object.isFrozen), true);
					assert.deepEqual(JSON.parse(JSON.stringify(context)), context);
					const result = resolveDocumentation(
						[
							{
								id: signature.id,
								packageName: context.origin.packageName,
								documentation: signature.documentation,
							},
						],
						[],
					);
					assert.equal(result.ok, false);
					assert.equal(result.diagnostics[0]?.code, DiagnosticCode.DocumentationUnsupported);
					assert.equal(JSON.stringify(analysis.value), before);
					assert.equal(session.getStatistics().analyses, 1);
				} finally {
					session.close();
				}
			});

			it("shares custom tags across detached binding, resolution, and classification", () => {
				const configuration = resolveConfiguration(
					{
						packageName: "example",
						project: "tsconfig.json",
						entrypoints: [{ name: ".", path: "declarations/inheritance-custom.d.ts" }],
					},
					directory,
				);
				assert.ok(configuration.ok);
				const session = createAnalysisSession();
				try {
					const analysis = session.analyze(configuration.value);
					assert.ok(analysis.ok, JSON.stringify(analysis));
					session.close();
					const options = { customModifierTags: ["@sourceOnly", "@localOnly"] };
					const before = JSON.stringify({ facts: analysis.value, options });
					const inputs = analysis.value.declarations.flatMap((declaration) =>
						declaration.signatures.map((signature) => {
							assert.ok(signature.documentationContext);
							return {
								id: signature.id,
								documentation: signature.documentation,
								packageName: signature.documentationContext.origin.packageName,
							};
						}),
					);
					const classified = classifyApiItems(inputs, options);
					assert.ok(classified.ok);
					const selection = {
						name: "public",
						releaseLevels: [ReleaseLevel.Public],
						requireTags: ["@localOnly"],
					};
					const selected = selectApiItems(classified.value, selection);
					assert.ok(selected.ok);
					assert.equal(selected.value.items.length, 1);
					const bindings = bindDocumentationReferences(analysis.value, options);
					assert.ok(bindings.ok, JSON.stringify(bindings));
					assert.equal(bindings.value.length, 1);
					const result = resolveDocumentation(inputs, bindings.value, options);
					assert.ok(result.ok);
					const derived = result.value.find(
						(entry) => entry.id === selected.value.items[0]?.id,
					);
					assert.ok(derived?.documentation !== undefined);
					assert.notEqual(derived.documentation, "");
					assert.ok(derived.documentation.includes("Summary."));
					assert.ok(derived.documentation.includes("@localOnly"));
					assert.equal(derived.documentation.includes("@sourceOnly"), false);
					assert.equal(derived.documentation.includes("@internal"), false);
					assert.deepEqual(derived.inheritedFrom, [bindings.value[0]?.target]);
					assert.deepEqual(classifyApiItems(inputs, options), classified);
					assert.deepEqual(selectApiItems(classified.value, selection), selected);
					for (const customModifierTags of [[], ["@localOnly"], ["@sourceOnly"]]) {
						const unconfigured = bindDocumentationReferences(analysis.value, {
							customModifierTags,
						});
						assert.ok(!unconfigured.ok);
						assert.equal(unconfigured.diagnostics[0]?.code, DiagnosticCode.DocumentationTsdoc);
					}
					assert.equal(JSON.stringify({ facts: analysis.value, options }), before);
					assert.equal(Object.isFrozen(options.customModifierTags), false);
					assert.ok(Object.isFrozen(result.value));
					assert.ok(Object.isFrozen(bindings.value));
					assert.equal(session.getStatistics().analyses, 1);
				} finally {
					session.close();
				}
			});

			it("binds and resolves compiler comments after session closure", () => {
				const configuration = resolveConfiguration(
					{
						packageName: "example",
						project: "tsconfig.json",
						entrypoints: [{ name: ".", path: "declarations/inheritance.d.ts" }],
					},
					directory,
				);
				assert.ok(configuration.ok);
				const session = createAnalysisSession();
				try {
					const analysis = session.analyze(configuration.value);
					assert.ok(analysis.ok, JSON.stringify(analysis));
					session.close();
					const before = JSON.stringify(analysis.value);
					const base = analysis.value.declarations.find(
						(declaration) => declaration.name === "base",
					);
					const derived = analysis.value.declarations.find(
						(declaration) => declaration.name === "derived",
					);
					assert.ok(base?.signatures[0]);
					assert.ok(derived?.signatures[0]);
					const inputs = [base, derived].flatMap((declaration) => {
						const origin = declaration.declarations[0];
						assert.ok(origin);
						return declaration.signatures.map((signature) => ({
							id: signature.id,
							documentation: signature.documentation,
							packageName: origin.packageName,
						}));
					});
					const classification = classifyApiItems(inputs);
					assert.ok(classification.ok);
					const bindings = bindDocumentationReferences(analysis.value, {});
					assert.ok(bindings.ok, JSON.stringify(bindings));
					assert.deepEqual(bindings.value, [
						{
							source: derived.signatures[0].id,
							reference: "base",
							target: base.signatures[0].id,
						},
					]);
					const result = resolveDocumentation(inputs, bindings.value);
					assert.ok(result.ok, JSON.stringify(result));
					const effective = result.value.find(
						(entry) => entry.id === derived.signatures[0]?.id,
					);
					assert.ok(effective?.documentation !== undefined);
					assert.notEqual(effective.documentation, "");
					assertSnapshot(effective.documentation, "documentation.direct.txt");
					assert.ok(effective.documentation.includes("Converts a value."));
					assert.equal(effective.documentation.includes("@internal"), false);
					assert.equal(effective.documentation.includes("@inheritDoc"), false);
					assert.deepEqual(effective.inheritedFrom, [base.signatures[0].id]);
					assert.deepEqual(classifyApiItems(inputs), classification);
					assert.equal(JSON.stringify(analysis.value), before);
					assert.equal(session.getStatistics().analyses, 1);
				} finally {
					session.close();
				}
			});
		});

		describe("Explicit documentation inheritance binding boundaries", () => {
			it("supports export aliases and rejects unsafe function bindings", () => {
				for (const fixture of documentationBindingCases) {
					const configuration = resolveConfiguration(
						{
							packageName: "example",
							project: "tsconfig.json",
							entrypoints: [{ name: ".", path: `declarations/binding-${fixture.name}.d.ts` }],
						},
						directory,
					);
					assert.ok(configuration.ok);
					const session = createAnalysisSession();
					try {
						const analysis = session.analyze(configuration.value);
						assert.ok(analysis.ok, JSON.stringify(analysis));
						session.close();
						const result = bindDocumentationReferences(analysis.value, {});
						if (fixture.expected === undefined) {
							assert.ok(result.ok, JSON.stringify(result));
							assert.equal(result.value.length, 1);
							assert.equal(result.value[0]?.reference, fixture.reference);
							assert.ok(Object.isFrozen(result.value));
						} else {
							assert.ok(!result.ok, fixture.name);
							assert.equal(result.diagnostics[0]?.code, fixture.expected, fixture.name);
							assert.equal("value" in result, false);
						}
					} finally {
						session.close();
					}
				}
			});

			it("retains original scope through re-exports and collects non-exported targets", () => {
				for (const name of ["reexport", "hidden"]) {
					const configuration = resolveConfiguration(
						{
							packageName: "example",
							project: "tsconfig.json",
							entrypoints: [{ name: ".", path: `declarations/inheritance-${name}.d.ts` }],
						},
						directory,
					);
					assert.ok(configuration.ok);
					const session = createAnalysisSession();
					try {
						const analysis = session.analyze(configuration.value);
						assert.ok(analysis.ok, JSON.stringify(analysis));
						session.close();
						const detached = JSON.parse(JSON.stringify(analysis.value)) as AnalysisFacts;
						const bindings = bindDocumentationReferences(detached, {});
						assert.ok(bindings.ok, JSON.stringify(bindings));
						const expectedName = name === "hidden" ? "hidden" : "base";
						const expectedFile =
							name === "hidden"
								? "declarations/inheritance-hidden.d.ts"
								: "declarations/inheritance.d.ts";
						const targetDeclaration = analysis.value.declarations.find(
							(declaration) =>
								declaration.name === expectedName &&
								declaration.declarations[0]?.file === expectedFile,
						);
						assert.ok(targetDeclaration?.signatures[0]);
						assert.equal(bindings.value[0]?.target, targetDeclaration.signatures[0].id);
						assert.equal(
							analysis.value.surfaces[0]?.exports.some(
								(entry) => entry.target === targetDeclaration.id,
							),
							false,
						);
						assert.deepEqual(
							bindDocumentationReferences(
								{
									...analysis.value,
									declarations: [...analysis.value.declarations].reverse(),
								},
								{},
							),
							bindings,
						);
					} finally {
						session.close();
					}
				}
			});
		});

		describe("Review report generation", () => {
			it("renders detached compiler facts against shared report snapshots", () => {
				const configuration = resolveConfiguration(
					{
						packageName: "example",
						project: "tsconfig.json",
						entrypoints: [{ name: "./functions", path: "declarations/reportFunctions.d.ts" }],
					},
					directory,
				);
				assert.ok(configuration.ok);
				const session = createAnalysisSession();
				try {
					const analysis = session.analyze(configuration.value);
					assert.ok(analysis.ok, JSON.stringify(analysis));
					const classification = classifyApiItems(
						analysis.value.declarations.flatMap((item) => item.signatures),
						{ customModifierTags: ["@partner"] },
					);
					assert.ok(classification.ok, JSON.stringify(classification));
					session.close();
					const before = JSON.stringify(analysis.value);
					for (const [name, releaseLevels] of [
						["public", [ReleaseLevel.Public]],
						["complete", [ReleaseLevel.Public, ReleaseLevel.Internal]],
					] as const) {
						const selection = selectApiItems(classification.value, { name, releaseLevels });
						assert.ok(selection.ok);
						const report = createReviewReport(analysis.value, "./functions", selection.value);
						assert.ok(report.ok, JSON.stringify(report));
						const text = renderReviewReport(report.value);
						const expected = assertSnapshot(text, `functions.${name}.md`);
						assert.ok(compareReviewBaseline(text, expected).ok);
					}
					assert.equal(JSON.stringify(analysis.value), before);
					assert.equal(session.getStatistics().analyses, 1);
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

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
	isFunctionTypeNode,
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
import { classifyApiItems } from "../analysis/classification.js";
import { selectApiItems } from "../analysis-types/classification.js";
import {
	bindAutomaticDocumentationReferences,
	bindDocumentationLinks,
	bindDocumentationReferences,
	resolveDocumentation,
} from "../analysis/documentation.js";
import type { ResolvedDocumentation } from "../analysis-types/documentation.js";
import type {
	AnalysisFacts,
	DocumentationReferenceLookup,
	SignatureFact,
} from "../analysis-types/facts.js";
import type { CompletedDocumentation } from "../analysis-types/completedGraph.js";
import { ReleaseLevel, DiagnosticCode, analyzeAPIs } from "../index.js";
import {
	createReviewReport,
	prepareReviewReport,
	renderReviewReport,
} from "../report-generation/reviewReport.js";
import { compareReviewBaseline } from "../report-generation/reviewBaseline.js";
import {
	isTypeOnlyAlias,
	createNativeAdapter,
	collect,
	collectLinks,
	collectExports,
	isTypeOnlyExport,
	getDeclarationId,
	lookupReference,
	extractMembers,
	getOrigin as resolveOrigin,
	extractSignatures,
	resolveSymbolTarget as resolveTarget,
	type CollectionState,
	type LocationContext,
} from "../analysis/nativeAdapter.js";
import { assertSnapshot } from "./snapshotUtils.js";
import {
	encodeDependencyModel,
	decodeDependencyModel,
} from "../model-generation/dependencyModel.js";
import { completeAnalysis } from "../analysis/completeAnalysis.js";
import {
	createAnalysisContext,
	type ExtractedComments,
} from "../analysis/documentationContext.js";
import {
	createTestDocumentationContext,
	createTestAnalysisContext,
	getSuccessValue,
} from "./contextUtils.js";

/**
 * Checks a declaration consumer against original declarations and isolated rendered report modules.
 *
 * @remarks
 * Uses both consumer compilers and removes its temporary files on success or failure.
 * This self-contained subset does not establish general declaration-rollup support.
 *
 * @param directory - Temporary fixture project containing emitted declarations.
 * @param reports - Report Markdown keyed by the module basename expected by the consumer.
 * @param consumer - Consumer fixture basename. Defaults to the type-only fixture.
 * @param supportingModules - Extra original declaration modules. Defaults to the report-members fixture.
 * @throws If a report has no unique code block or either consumer compilation fails.
 */
function validateReportConsumers(
	directory: string,
	reports: ReadonlyMap<string, string>,
	consumer = "typeOnlyValues",
	supportingModules: readonly string[] = ["report-members"],
): void {
	const consumerDirectory = path.join(directory, "type-only-consumer");
	mkdirSync(consumerDirectory);
	try {
		for (const name of [...supportingModules, ...reports.keys()]) {
			cpSync(
				path.join(directory, `declarations/${name}.d.ts`),
				path.join(consumerDirectory, `${name}.d.ts`),
			);
		}
		cpSync(
			new URL(`../../src/test/fixtures/consumer/${consumer}.ts`, import.meta.url),
			path.join(consumerDirectory, "consumer.ts"),
		);
		writeFileSync(
			path.join(consumerDirectory, "tsconfig.json"),
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
		for (const rendered of [false, true]) {
			if (rendered) {
				for (const [file, text] of reports) {
					const blocks = [...text.matchAll(/```ts\n([\S\s]*?)\n```/g)];
					assert.equal(blocks.length, 1, text);
					const declarations = blocks[0]?.[1];
					assert(declarations !== undefined);
					writeFileSync(path.join(consumerDirectory, `${file}.d.ts`), declarations);
				}
			}
			for (const consumerCompiler of ["typescript6", "typescript"]) {
				const compilerDirectory = path.dirname(
					require.resolve(`${consumerCompiler}/package.json`),
				);
				execFileSync(
					process.execPath,
					[path.join(compilerDirectory, "bin/tsc"), "-p", "tsconfig.json"],
					{
						cwd: consumerDirectory,
						stdio: "inherit",
						timeout: 15000,
					},
				);
			}
		}
	} finally {
		rmSync(consumerDirectory, { recursive: true, force: true });
	}
}

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
	// Explicit overloaded targets require a numeric selector; no overload is inferred.
	{
		name: "overload",
		reference: "base",
		expected: DiagnosticCode.DocumentationReference,
	},

	// Parameter types match, but their names differ. Copying parameter documentation would
	// require renaming its references, which the current binder does not support.
	// TODO (Future parameter adaptation): Extend the renamed, optional, rest, and generic cases
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
	// TODO (Future parameter adaptation): Add object and array binding patterns with documentation
	// when parameter adaptation is defined. Retain failures where no unambiguous mapping exists.
	{
		name: "pattern",
		reference: "base",
		expected: DiagnosticCode.DocumentationReference,
	},

	// A self-qualified reference names the configured root export surface, where this target is absent.
	{
		name: "qualified",
		reference: "example#base",
		expected: DiagnosticCode.DocumentationReference,
	},

	// A one-based numeric selector chooses the second callable signature in declaration order.
	{
		name: "selector",
		reference: "(base:2)",
		expected: undefined,
	},

	// Lookup succeeds, but the target is a variable rather than a standalone function.
	// Finding a symbol does not establish that its declaration form supports documentation binding.
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
					stdio: "inherit",
					timeout: 15000,
				},
			);
			cpSync(
				new URL("../../src/test/fixtures/native/ambient-modules.d.ts", import.meta.url),
				path.join(directory, "declarations/ambient-modules.d.ts"),
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
			assert(
				openedProject !== undefined,
				"The configured declaration project must be available",
			);
			project = openedProject;
			const source = project.program.getSourceFile(
				path.join(directory, "declarations/index.d.ts"),
			);
			assert(source !== undefined);
			const moduleSymbol = project.checker.getSymbolAtLocation(source);
			assert(moduleSymbol !== undefined);
			exports = project.checker.getExportsOfModule(moduleSymbol);
		});

		after(() => {
			try {
				api?.close();
			} finally {
				if (directory !== undefined) {
					rmSync(directory, { recursive: true, force: true });
				}
			}
		});

		function getExportTarget(name: string): CompilerSymbol {
			const exported = exports.find((symbol) => symbol.name === name);
			assert(exported !== undefined, `Missing export: ${name}`);
			return (exported.flags & SymbolFlags.Alias) === 0
				? exported
				: project.checker.getAliasedSymbol(exported);
		}

		function getMemberTypes(name: string): Readonly<Record<string, string>> {
			const declared = project.checker.getDeclaredTypeOfSymbol(getExportTarget(name));
			const properties = project.checker.getPropertiesOfType(declared);
			const entries = properties.map((property) => {
				const type = project.checker.getTypeOfSymbol(property);
				assert(type !== undefined);
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
			assert.equal(getExportTarget("PublicIdentity").id, getExportTarget("TypeIdentity").id);
			assert.equal(getExportTarget("PublicIdentity").name, "Identity");
			const source = project.program.getSourceFile(
				path.join(directory, "declarations/index.d.ts"),
			);
			assert(source !== undefined);
			const declarations = source.statements.filter(isExportDeclaration);
			assert.equal(declarations[0]?.isTypeOnly, false);
			assert.equal(declarations[1]?.isTypeOnly, true);
			assert(exports.some((symbol) => symbol.name === "ApiNamespace"));
		});

		// Design feature: F1.
		it("specializes inherited interface and class members", () => {
			assert.equal(getMemberTypes("Derived").value, "string");
			assert.equal(getMemberTypes("DerivedClass").value, "string");
		});

		// Design feature: F1.
		it("computes ordinary intersections and utility member selections", () => {
			assert.deepEqual(getMemberTypes("Combined"), {
				value: "string",
				optional: "number | undefined",
				count: "number",
				enabled: "boolean",
			});
			assert.deepEqual(getMemberTypes("Selected"), {
				value: "string",
				optional: "number | undefined",
			});
			assert.deepEqual(getMemberTypes("Omitted"), {
				value: "string",
				optional: "number | undefined",
				enabled: "boolean",
			});
			assert.deepEqual(getMemberTypes("Frozen"), {
				value: "string",
				optional: "number | undefined",
			});
			const frozen = project.checker.getDeclaredTypeOfSymbol(getExportTarget("Frozen"));
			const optional = project.checker.getPropertyOfType(frozen, "optional");
			assert(optional !== undefined);
			assert.notEqual(optional.flags & SymbolFlags.Optional, 0);
		});

		// Design feature: F4.
		it("exposes callable overloads and preserves declaration comments", () => {
			const symbol = getExportTarget("convert");
			const type = project.checker.getTypeOfSymbol(symbol);
			assert(type !== undefined);
			const signatures = project.checker.getSignaturesOfType(type, SignatureKind.Call);
			assert.equal(signatures.length, 2);
			const comments = project.checker.getDocumentationCommentOfSymbol(symbol);
			assert.match(comments, /Public overload documentation/);
			const declarations = readFileSync(path.join(directory, "declarations/api.d.ts"), "utf8");
			assert.match(declarations, /@public/);
			assert.match(declarations, /@internal/);
			for (const signature of signatures) {
				assert(signature.declaration?.resolve() !== undefined);
			}
			const firstDeclaration = signatures[0]?.declaration?.resolve();
			const secondDeclaration = signatures[1]?.declaration?.resolve();
			assert(firstDeclaration !== undefined && secondDeclaration !== undefined);
			assert.match(firstDeclaration.getFullText(), /Public overload documentation.*@public/);
			assert.match(
				secondDeclaration.getFullText(),
				/Internal overload documentation.*@internal/,
			);
		});

		// Design feature: F1.
		it("materializes readonly and optional modifiers through public type nodes", () => {
			const frozen = project.checker.getDeclaredTypeOfSymbol(getExportTarget("Frozen"));
			const node = project.checker.typeToTypeNode(
				frozen,
				undefined,
				NodeBuilderFlags.InTypeAlias,
			);
			assert(
				(node && isTypeLiteralNode(node)) === true,
				"A structural type node must expose effective modifiers",
			);
			assert.equal(node.members.length, 2);
			for (const member of node.members) {
				assert(isPropertySignatureDeclaration(member));
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

		// Keep original input, effective type text, and output normalization independently inspectable.
		it("retains original and resolved signature views without sacrificing report names", () => {
			const locations: LocationContext = {
				configuration: { packageName: "example", packageRoot: directory },
				packageCache: new Map(),
			};
			const source = project.program.getSourceFile(
				path.join(directory, "declarations/signature-views.d.ts"),
			);
			assert(source !== undefined);
			const module = project.checker.getSymbolAtLocation(source);
			assert(module !== undefined);
			const views = new Map(
				project.checker
					.getExportsOfModule(module)
					.filter((symbol) => (symbol.flags & SymbolFlags.Function) !== 0)
					.map((symbol) => {
						const type = project.checker.getTypeOfSymbol(symbol);
						assert(type !== undefined);
						const signature = extractSignatures(project, type, symbol.name, locations)[0];
						assert(signature !== undefined);
						return [symbol.name, signature] as const;
					}),
			);
			const computed = views.get("computed");
			assert(computed !== undefined);
			assert.match(computed.source?.text ?? "", /Parameters<typeof helper>\[0]/);
			assert.match(computed.callSignatureText, /Parameters<typeof helper>\[0]/);
			assert.equal(computed.reduced.callSignatureText, "(value: string): string;");
			assert.equal(computed.normalized.callSignatureText, "(value: string): string;");
			assert.equal(views.get("named")?.reduced.callSignatureText, "(value: string): string;");
			assert.equal(views.get("named")?.normalized.callSignatureText, "(value: Label): Label;");
			const named = views.get("named");
			assert(named !== undefined);
			assert("callSignatureExcerpt" in named.normalized);
			assert("callSignatureExcerpt" in named.reduced);
			assert.notDeepEqual(
				named.normalized.callSignatureExcerpt,
				named.reduced.callSignatureExcerpt,
			);
			const normalized = named.normalized.callSignatureExcerpt;
			assert(normalized !== undefined);
			assert.equal(
				normalized.tokens.map((token) => token.text).join(""),
				named.normalized.callSignatureText,
			);
			assert.deepEqual(
				normalized.tokens
					.filter((token) => token.kind === "Reference")
					.map((token) => token.text),
				["Label", "Label"],
			);
			assert.equal(
				named.reduced.callSignatureExcerpt?.tokens.some((token) => token.kind === "Reference"),
				false,
			);
			assert.equal(
				views.get("optional")?.normalized.callSignatureText,
				"(value?: string | null): void;",
			);
			assert.match(
				views.get("tuple")?.normalized.callSignatureText ?? "",
				/first: string, second\?: number/,
			);
			assert.match(
				views.get("genericRest")?.normalized.callSignatureText ?? "",
				/\.{3}args: Args/,
			);
			assert.match(
				views.get("genericReturn")?.normalized.callSignatureText ?? "",
				/Value\["value"]/,
			);
			assert.equal(
				views.get("receiver")?.normalized.callSignatureText,
				"(this: View, value: string): string;",
			);
			assert.equal(
				views.get("predicate")?.reduced.callSignatureText,
				"(value: unknown): value is View;",
			);
			assert.equal(
				views.get("assertion")?.reduced.callSignatureText,
				"(value: unknown): asserts value is View;",
			);
			assert.equal(
				views.get("present")?.reduced.callSignatureText,
				"(value: unknown): asserts value;",
			);
			assert.equal(views.get("branded")?.reduced.callSignatureText, "(value: Token): Token;");
			assert.equal(
				views.get("shadow")?.normalized.callSignatureText,
				"(value: Pick<string>): Pick<string>;",
			);
			assert.match(views.get("mapped")?.normalized.callSignatureText ?? "", /Value/);
			assert.equal(computed.source?.packageName, "example");
			assert.equal(computed.source?.file, "declarations/signature-views.d.ts");
			assert.deepEqual(JSON.parse(JSON.stringify(computed)), computed);

			// Original declarations retain generic parameters even when the receiving view substitutes them.
			const membersSource = project.program.getSourceFile(
				path.join(directory, "declarations/member-documentation.d.ts"),
			);
			assert(membersSource !== undefined);
			const membersModule = project.checker.getSymbolAtLocation(membersSource);
			assert(membersModule !== undefined);
			const derived = project.checker
				.getExportsOfModule(membersModule)
				.find((symbol) => symbol.name === "DocumentedDerived");
			assert(derived !== undefined);
			const forward = extractMembers(
				project,
				locations,
				project.checker.getDeclaredTypeOfSymbol(derived),
				"derived",
			).find((member) => member.name === "forward")?.signatures[0];
			assert(forward !== undefined);
			assert.match(forward.source?.text ?? "", /forward\(value: Value\): Value/);
			assert.equal(forward.normalized.callSignatureText, "(value: string): string;");

			// All required named types remain in scope. Generated signatures use only detached strings.
			const definitions =
				"export type Label = string;\nexport interface View { value: string; }\nexport type Token = string & { readonly brand: 'Token' };\nexport type Pick<Value> = { value: Value };\n";
			for (const view of ["normalized", "reduced"] as const) {
				writeFileSync(
					path.join(directory, `signature-${view}.d.ts`),
					definitions +
						[...views]
							.map(
								([name, signature]) =>
									`export declare function ${name}${signature[view].callSignatureText}`,
							)
							.join("\n"),
				);
			}
			cpSync(
				new URL("../../src/test/fixtures/consumer/signatureViews.ts", import.meta.url),
				path.join(directory, "signature-consumer.ts"),
			);
			writeFileSync(
				path.join(directory, "signature-consumer.json"),
				JSON.stringify({
					compilerOptions: {
						target: "ES2022",
						module: "NodeNext",
						strict: true,
						types: [],
						noEmit: true,
					},
					files: ["signature-consumer.ts"],
				}),
			);
			for (const consumerCompiler of ["typescript6", "typescript"]) {
				const compilerDirectory = path.dirname(
					require.resolve(`${consumerCompiler}/package.json`),
				);
				execFileSync(
					process.execPath,
					[path.join(compilerDirectory, "bin/tsc"), "-p", "signature-consumer.json"],
					{ cwd: directory, stdio: "pipe", timeout: 15000 },
				);
			}
		});

		// Design requirement: W5; baseline for declaration generation.
		it("printed complete declarations compile with both consumer compilers", () => {
			for (const name of ["api", "index"]) {
				const source = project.program.getSourceFile(
					path.join(directory, `declarations/${name}.d.ts`),
				);
				assert(source !== undefined);
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
			const namespace = getExportTarget("ApiNamespace");
			const first = namespace.getExports();
			api.resetTimingInfo();
			const second = namespace.getExports();
			const timing = api.getTimingInfo();
			assert.strictEqual(first, second);
			assert(timing.enabled);
			assert.equal(
				timing.totals.requestCount,
				0,
				"A cached export lookup must not query the compiler again",
			);
			assert(!timing.recentRequests.some((request) => request.method === "updateSnapshot"));
			assert(
				!timing.recentRequests.some((request) => request.method === "getExportsOfModule"),
			);
			assert.strictEqual(snapshot.getProject(project.configFileName), project);
			assert.deepEqual(getMemberTypes("Derived"), getMemberTypes("Derived"));
			console.log(`Cached export query timing: ${JSON.stringify(timing.totals)}`);
		});

		describe("Adapter fact extraction", () => {
			// TODO (Future automatic overload inheritance): Revisit this capability boundary when official
			// semantic pair matching is available. Automatic overload inheritance is excluded from Stage 2.
			it("documents native generic overload comparison limits", () => {
				const source = project.program.getSourceFile(
					path.join(directory, "declarations/member-documentation.d.ts"),
				);
				assert(source !== undefined);
				const moduleSymbol = project.checker.getSymbolAtLocation(source);
				assert(moduleSymbol !== undefined);
				const symbols = project.checker.getExportsOfModule(moduleSymbol);
				const contract = symbols.find((entry) => entry.name === "GenericOverloadContract");
				const implementation = symbols.find(
					(entry) => entry.name === "GenericOverloadImplementation",
				);
				assert(contract !== undefined);
				assert(implementation !== undefined);
				const groups = [contract, implementation].map((symbol) => {
					const declared = project.checker.getDeclaredTypeOfSymbol(symbol);
					const member = project.checker.getPropertyOfType(declared, "map");
					assert(member !== undefined);
					const type = project.checker.getTypeOfSymbol(member);
					assert(type !== undefined);
					const signatures = project.checker.getSignaturesOfType(type, SignatureKind.Call);
					for (const signature of signatures) {
						const node = project.checker.signatureToSignatureDeclaration(
							signature,
							SyntaxKind.FunctionType,
						);
						assert((node && isFunctionTypeNode(node)) === true);
						assert.throws(
							() => project.checker.getTypeFromTypeNode(node),
							/node handle .* could not be resolved/,
						);
					}
					return signatures;
				});
				const contractArray = groups[0]?.[0];
				const implementationArray = groups[1]?.[1];
				assert(contractArray !== undefined);
				assert(implementationArray !== undefined);
				const contractParameter = project.checker.getParameterType(contractArray, 0);
				const implementationParameter = project.checker.getParameterType(
					implementationArray,
					0,
				);
				assert(contractParameter !== undefined);
				assert(implementationParameter !== undefined);

				// Equivalent generic signatures declare independent type parameters. Parameter assignability
				// alone must not be used to reject the corresponding overloads as incompatible.
				assert.equal(
					project.checker.isTypeAssignableTo(contractParameter, implementationParameter),
					false,
				);
				assert.equal(
					project.checker.isTypeAssignableTo(implementationParameter, contractParameter),
					false,
				);
			});

			it("retains instantiated heritage member views for documentation matching", () => {
				const configuration = resolveConfiguration(
					{
						packageName: "example",
						project: "tsconfig.json",
						entrypoints: [{ name: ".", path: "declarations/member-documentation.d.ts" }],
					},
					directory,
				);
				assert.equal(configuration.ok, true);
				const adapter = createNativeAdapter();
				try {
					const analysis = adapter.analyze(configuration.value);
					assert.equal(analysis.ok, true);
					adapter.close();
					const serialized = JSON.stringify(analysis.value);
					const facts = JSON.parse(serialized) as AnalysisFacts;
					const automatic = bindAutomaticDocumentationReferences(facts);
					const inputs = facts.declarations.flatMap((entry) =>
						entry.members
							.filter((member) => member.declarations.length === 1)
							.map((member) => ({
								id: member.id,
								packageName: member.declarations[0]?.packageName ?? "example",
								documentation: member.declarations[0]?.documentation,
							})),
					);
					const resolved = resolveDocumentation(
						createTestDocumentationContext(inputs, {
							automaticInheritance: automatic,
						}),
						[],
						{
							automaticInheritance: automatic,
						},
					);
					assert.equal(resolved.ok, true);
					assert.equal(Object.isFrozen(automatic), true);
					assert.deepEqual(
						bindAutomaticDocumentationReferences({
							...facts,
							declarations: [...facts.declarations]
								.reverse()
								.map((entry) => ({ ...entry, heritage: [...entry.heritage].reverse() })),
						}),
						automatic,
					);
					for (const [name, memberName, text, inheritedCount] of [
						["DocumentedClass", "convert", "Base class operation.", 1],
						["DocumentedAliasImplementation", "root", "Implementation-only operation.", 1],
						["DocumentedAliasDerived", "root", "Implementation-only operation.", 2],
						["DiamondImplementation", "root", "Root operation.", 1],
						["DocumentedImplementation", "root", undefined, 0],
						["RenamedImplementation", "root", undefined, 0],
						["SingleCallReceiver", "operation", undefined, 0],
						["EmptyImplementation", "root", undefined, 0],
						["TagOnlyImplementation", "root", "@public", 0],
					] as const) {
						const member = facts.declarations
							.find((entry) => entry.name === name)
							?.members.find((entry) => entry.name === memberName);
						assert(member !== undefined, name);
						const effective: ResolvedDocumentation | undefined = resolved.value.find(
							(entry) => entry.id === member.id,
						);
						assert(effective !== undefined, name);
						assert.equal(effective.inheritedFrom.length, inheritedCount, name);
						if (text === undefined) {
							assert.equal(
								effective.documentation?.includes("operation.") ?? false,
								false,
								name,
							);
						} else {
							assert.equal(effective.documentation?.includes(text), true, name);
						}
					}
					for (const [name, expected] of [
						["DocumentedClass", ["convert", "value"]],
						["DocumentedAliasImplementation", ["root"]],
						["DocumentedImplementation", ["root", "root"]],
						["GenericOverloadImplementation", []],
						["RenamedImplementation", []],
						["OverloadedReceiver", []],
						["SingleCallReceiver", []],
						["UnconstrainedReceiver", []],
					] as const) {
						const declaration = facts.declarations.find((entry) => entry.name === name);
						assert(declaration !== undefined, name);
						assert.deepEqual(
							declaration.heritage
								.flatMap((view) =>
									view.documentationMatches.map((match) => {
										const receivingMember = declaration.members.find(
											(entry) => entry.id === match.source,
										);
										const targetMember = view.members.find(
											(entry) => entry.id === match.target,
										);
										assert(receivingMember !== undefined);
										assert(targetMember !== undefined);
										assert.equal(receivingMember.name, targetMember.name);
										return receivingMember.name;
									}),
								)
								.sort(),
							expected,
							name,
						);
					}
					const derived = facts.declarations.find(
						(entry) => entry.name === "DocumentedDerived",
					);
					const implementation = facts.declarations.find(
						(entry) => entry.name === "DocumentedImplementation",
					);
					assert(derived !== undefined);
					assert(implementation !== undefined);
					assert.equal(derived.heritage.length, 1);
					assert.equal(derived.heritage[0]?.kind, "extends");
					assert.equal(derived.heritage[0]?.target, derived.baseDeclarations[0]);
					assert.equal(
						derived.heritage[0]?.members.find((entry) => entry.name === "convert")
							?.signatures[0]?.functionTypeText,
						"(value: string) => string",
					);
					assert.equal(implementation.heritage.length, 2);
					const classFact = facts.declarations.find(
						(entry) => entry.name === "DocumentedClass",
					);
					const alias = facts.declarations.find(
						(entry) => entry.name === "DocumentedAliasImplementation",
					);
					assert(classFact !== undefined);
					assert(alias !== undefined);
					assert.equal(
						classFact.heritage[0]?.members.find((entry) => entry.name === "value")?.type,
						"string",
					);
					assert.equal(
						alias.heritage[0]?.members.find((entry) => entry.name === "root")?.signatures[0]
							?.functionTypeText,
						"(value: string) => string",
					);
					for (const heritage of implementation.heritage) {
						assert.equal(heritage.kind, "implements");
						assert.equal(
							heritage.members.find((entry) => entry.name === "root")?.signatures[0]
								?.functionTypeText,
							"(value: string) => string",
						);
					}
					for (const declaration of analysis.value.declarations) {
						assert.equal(Object.isFrozen(declaration.heritage), true);
						assert.equal(
							declaration.heritage.every(
								(view) =>
									Object.isFrozen(view.documentationMatches) &&
									view.documentationMatches.every((match) => Object.isFrozen(match)),
							),
							true,
						);
						assert.equal(
							declaration.heritage.every((entry) => Object.isFrozen(entry.members)),
							true,
						);
					}
					assert.equal(JSON.stringify(facts), serialized);
				} finally {
					adapter.close();
				}
			});

			it("retains direct implements targets separately from base declarations and original comments", () => {
				const configuration = resolveConfiguration(
					{
						packageName: "example",
						project: "tsconfig.json",
						entrypoints: [{ name: ".", path: "declarations/member-documentation.d.ts" }],
					},
					directory,
				);
				assert.equal(configuration.ok, true);
				const adapter = createNativeAdapter();
				try {
					const analysis = adapter.analyze(configuration.value);
					assert.equal(analysis.ok, true);
					adapter.close();
					const serialized = JSON.stringify(analysis.value);
					const facts = JSON.parse(serialized) as AnalysisFacts;
					const byId = new Map(facts.declarations.map((entry) => [entry.id, entry]));
					const implementation = facts.declarations.find(
						(entry) => entry.name === "DocumentedImplementation",
					);
					const contract = facts.declarations.find(
						(entry) => entry.name === "HiddenImplementationOnly",
					);
					const alias = facts.declarations.find(
						(entry) => entry.name === "DocumentedAliasImplementation",
					);
					const derived = facts.declarations.find(
						(entry) => entry.name === "DocumentedImplementationDerived",
					);
					assert(implementation !== undefined);
					assert(contract !== undefined);
					assert(alias !== undefined);
					assert(derived !== undefined);
					assert.deepEqual(
						implementation.implementedDeclarations.map((id) => byId.get(id)?.name),
						["HiddenRoot", "HiddenImplementationOnly"],
					);
					assert.deepEqual(implementation.baseDeclarations, []);
					assert.deepEqual(
						alias.implementedDeclarations.map((id) => byId.get(id)?.name),
						["HiddenImplementationAlias"],
					);
					assert.equal(
						byId.get(alias.implementedDeclarations[0] ?? "")?.declarations[0]?.kind,
						"TypeAliasDeclaration",
					);

					// Direct clauses are not copied from a base class; callers can follow the separate base link.
					assert.deepEqual(derived.implementedDeclarations, []);
					assert.deepEqual(derived.baseDeclarations, [implementation.id]);
					assert.deepEqual(contract.implementedDeclarations, []);
					assert.equal(
						contract.declarations[0]?.documentation,
						"/** Implementation-only contract. @public */",
					);
					assert.equal(
						contract.members.find((entry) => entry.name === "root")?.signatures[0]
							?.functionTypeText,
						"(value: Value) => Value",
					);
					const root = implementation.members.find((entry) => entry.name === "root");
					assert(root !== undefined);

					// Documentation resolution must copy compatible interface content separately from these raw facts.
					// Automatic resolution is tested separately; these raw comments must remain unchanged.
					assert.equal(root.declarations[0]?.documentation, undefined);
					assert.equal(root.signatures[0]?.documentation, undefined);
					assert.equal(
						implementation.members.some((entry) => entry.name === "optionalContractProperty"),
						false,
					);
					assert.equal(
						facts.surfaces
							.flatMap((surface) => surface.exports)
							.some((entry) => entry.target === contract.id),
						false,
					);
					for (const declaration of analysis.value.declarations) {
						assert.equal(Object.isFrozen(declaration.implementedDeclarations), true);
						assert.equal(
							declaration.implementedDeclarations.every((id) => byId.has(id)),
							true,
						);
					}
					assert.equal(JSON.stringify(facts), serialized);
				} finally {
					adapter.close();
				}
			});

			it("retains direct base declaration links without exporting hidden ancestors", () => {
				const configuration = resolveConfiguration(
					{
						packageName: "example",
						project: "tsconfig.json",
						entrypoints: [{ name: ".", path: "declarations/member-documentation.d.ts" }],
					},
					directory,
				);
				assert.equal(configuration.ok, true);
				const adapter = createNativeAdapter();
				try {
					const analysis = adapter.analyze(configuration.value);
					assert.equal(analysis.ok, true);
					adapter.close();
					const serialized = JSON.stringify(analysis.value);
					const facts = JSON.parse(serialized) as AnalysisFacts;
					const byId = new Map(
						facts.declarations.map((declaration) => [declaration.id, declaration]),
					);
					const expected = new Map<string, readonly string[]>([
						["DocumentedDerived", ["DocumentedBase"]],
						["DocumentedClass", ["DocumentedClassBase"]],
						["DocumentedDiamond", ["HiddenLeft", "HiddenRight"]],
						["HiddenLeft", ["HiddenRoot"]],
						["HiddenRight", ["HiddenRoot"]],
						["HiddenRoot", []],

						// Implements targets are separate contract links, not inherited members or class base types.
						["DocumentedImplementation", []],
					]);
					for (const [name, bases] of expected) {
						const declaration = facts.declarations.find((entry) => entry.name === name);
						assert(declaration !== undefined);
						assert.deepEqual(
							declaration.baseDeclarations.map((id) => byId.get(id)?.name),
							bases,
						);
					}
					const hidden = facts.declarations.find((entry) => entry.name === "HiddenRoot");
					assert(hidden !== undefined);
					assert.equal(
						hidden.declarations[0]?.documentation,
						"/** Hidden root contract. @public */",
					);
					assert.equal(facts.declarations.filter((entry) => entry.id === hidden.id).length, 1);
					assert.equal(
						facts.surfaces
							.flatMap((surface) => surface.exports)
							.some((entry) => entry.name.startsWith("Hidden")),
						false,
					);
					for (const declaration of analysis.value.declarations) {
						assert.equal(Object.isFrozen(declaration.baseDeclarations), true);
						assert.equal(
							declaration.baseDeclarations.every((id) => byId.has(id)),
							true,
						);
					}
					assert.equal(JSON.stringify(facts), serialized);
				} finally {
					adapter.close();
				}
			});

			it("completes effective member documentation in its original scope", async () => {
				const configuration = resolveConfiguration(
					{
						packageName: "example",
						project: "tsconfig.json",
						entrypoints: [
							{ name: ".", path: "declarations/member-documentation.d.ts" },
							{ name: "./references", path: "declarations/member-references.d.ts" },
						],
					},
					directory,
				);
				assert.equal(configuration.ok, true);

				// Conflicts must fail the public invocation, even when missing tags and syntax checks are disabled.
				const rejected = await analyzeAPIs({
					...configuration.value,
					rules: { requireReleaseLevel: false, validateTsdocSyntax: false },
				});
				assert.equal(rejected.ok, false);
				assert.equal(
					rejected.diagnostics[0]?.code,
					DiagnosticCode.ClassificationReleaseConflict,
				);
				assert.match(rejected.diagnostics[0]?.message ?? "", /DocumentedMerged/);
				assert.equal("value" in rejected, false);
				const adapter = createNativeAdapter();
				try {
					const comments: ExtractedComments = new Map();
					const extracted = adapter.analyze(configuration.value, comments);
					assert.equal(extracted.ok, true);
					adapter.close();
					const detached = JSON.parse(JSON.stringify(extracted.value)) as AnalysisFacts;

					// Correct the containing interface first; its merged property still has its own conflict.
					const correctedInterface = {
						...detached,
						declarations: detached.declarations.map((declaration) =>
							declaration.name === "DocumentedMerged"
								? {
										...declaration,
										declarations: declaration.declarations.map((source) => ({
											...source,
											documentation: source.documentation?.replace("@beta", "@public"),
										})),
									}
								: declaration,
						),
					};
					const conflictingProperty = createAnalysisContext(correctedInterface, {
						rules: { requireReleaseLevel: false },
					});
					assert.equal(conflictingProperty.ok, false);
					assert.equal(
						conflictingProperty.diagnostics[0]?.code,
						DiagnosticCode.ClassificationReleaseConflict,
					);
					assert.match(
						conflictingProperty.diagnostics[0]?.message ?? "",
						/DocumentedMerged\.shared/,
					);

					// Keep deliberate release-conflict fixtures out of the successful member-documentation path.
					// The dedicated merged-documentation test exercises valid combined comments through extraction.
					const facts = {
						...detached,
						declarations: detached.declarations.filter(
							(declaration) =>
								!["DocumentedDerived", "DocumentedMerged"].includes(declaration.name),
						),
					};

					// Check the automatic receiver separately to verify container release inheritance before link validation.
					const supported = {
						...facts,
						declarations: facts.declarations.filter(
							(item) => item.name !== "ScopedAutomaticReceiver",
						),
					};
					const context = createTestAnalysisContext(supported);
					const completed = completeAnalysis(context);
					assert.equal(completed.ok, true, JSON.stringify(completed));
					const scoped = facts.declarations.find(
						(declaration) => declaration.name === "ScopedMemberReceiver",
					);
					assert(scoped !== undefined);
					const property = scoped.members.find((member) => member.name === "linkedProperty");
					assert(property !== undefined);
					assert.equal(property.signatures.length, 0);
					const capturedProperty = comments.get(property.id);
					assert(capturedProperty !== undefined);
					const retained = createAnalysisContext(
						facts,
						{ rules: { requireReleaseLevel: false } },
						comments,
					);
					assert.equal(retained.ok, true);
					assert.strictEqual(retained.value.items.get(property.id)?.parsed, capturedProperty);
					const originalProperty = extracted.value.declarations
						.find((item) => item.id === scoped.id)
						?.members.find((item) => item.id === property.id);
					assert(originalProperty?.documentationContext !== undefined);
					assert.equal(Object.isFrozen(originalProperty.documentationContext.links), true);
					const resolvedProperty = completed.value.documentation.find(
						(item) => item.id === property.id,
					);
					assert(resolvedProperty !== undefined);
					assert.equal(resolvedProperty.documented, true);
					assert.equal(resolvedProperty.links.length, 1);
					assert.equal(
						context.metadata.get(resolvedProperty.links[0]?.targetSignature ?? "")
							?.releaseLevel,
						ReleaseLevel.Beta,
					);
					assert.equal(context.metadata.get(property.id)?.releaseLevel, ReleaseLevel.Beta);
					const redirect = facts.declarations.find((item) => item.name === "PropertyRedirect")
						?.members[0];
					assert(redirect !== undefined);
					const redirected = completed.value.documentation.find(
						(item) => item.id === redirect.id,
					);
					assert(redirected !== undefined);
					assert.equal(redirected.documented, true);
					assert.equal(redirected.inheritedFrom.length, 2);
					assert.equal(
						redirected.sections?.find((section) => section.section === "summary")?.source,
						redirected.inheritedFrom.at(-1),
					);
					assert.equal(redirected.links.length, 1);
					assert.equal(
						redirected.links[0]?.origin.file,
						property.documentationContext?.origin.file,
					);
					const inheritedProperty = facts.declarations
						.find((item) => item.name === "PropertyImplementation")
						?.members.find((item) => item.name === "value");
					assert(inheritedProperty !== undefined);
					const resolvedInheritedProperty = completed.value.documentation.find(
						(item) => item.id === inheritedProperty.id,
					);
					assert(resolvedInheritedProperty !== undefined);
					assert.equal(resolvedInheritedProperty.documented, true);
					assert.equal(resolvedInheritedProperty.inheritedFrom.length, 1);
					for (const name of ["empty", "tagOnly"]) {
						const suppressed = facts.declarations
							.find((item) => item.name === "PropertyImplementation")
							?.members.find((item) => item.name === name);
						assert(suppressed !== undefined);
						const resolved: CompletedDocumentation | undefined =
							completed.value.documentation.find((item) => item.id === suppressed.id);
						assert(resolved !== undefined);
						assert.equal(resolved.documented, false, name);
						assert.equal(resolved.inheritedFrom.length, 0, name);
					}
					const propertySource = property.declarations[0];
					assert(propertySource !== undefined);
					assert(property.documentationContext !== undefined);
					for (const [documentation, expected] of [
						[
							"/** Property with incompatible release metadata. @internal */",
							DiagnosticCode.ClassificationContainerMismatch,
						],
						["/** See {@link missing}. @beta */", DiagnosticCode.DocumentationReference],
						["/** {@inheritDoc missing} @beta */", DiagnosticCode.DocumentationReference],
					] as const) {
						const input = createAnalysisContext(
							{
								...facts,
								surfaces: [],
								declarations: [
									...facts.declarations.filter((item) => item.id !== scoped.id),
									{
										...scoped,
										heritage: [],
										baseDeclarations: [],
										members: [
											{
												...property,
												declarations: [{ ...propertySource, documentation }],
												documentationContext: {
													...property.documentationContext,
													inheritance: { reference: "missing", status: "not-found" },
													links: [{ reference: "missing", status: "not-found" }],
												},
											},
										],
									},
								],
							},
							{ rules: { requireReleaseLevel: false } },
						);
						const invalidProperty = input.ok ? completeAnalysis(input.value) : input;
						assert.equal(invalidProperty.ok, false, documentation);
						assert.equal(invalidProperty.diagnostics[0]?.code, expected, documentation);
						assert.equal("value" in invalidProperty, false);
					}
					for (const name of ["linked", "redirected"]) {
						const signature: SignatureFact | undefined = scoped.members.find(
							(member) => member.name === name,
						)?.signatures[0];
						assert(signature !== undefined);
						const resolved: CompletedDocumentation | undefined =
							completed.value.documentation.find((item) => item.id === signature.id);
						assert(resolved !== undefined, name);
						assert.equal(resolved.documented, true);
						assert.equal(resolved.links.length, 1);
						const link: CompletedDocumentation["links"][number] | undefined =
							resolved.links[0];
						assert(link !== undefined);
						assert.equal(
							context.metadata.get(link.targetSignature)?.releaseLevel,
							ReleaseLevel.Beta,
						);
						assert.equal(context.metadata.get(signature.id)?.releaseLevel, ReleaseLevel.Beta);
					}
					for (const [owner, method, expected] of [
						["DocumentedClass", "convert", true],
						["DocumentedAliasDerived", "root", true],
						["EmptyImplementation", "root", false],
						["TagOnlyImplementation", "root", false],
						["DocumentedImplementation", "root", false],
						["RenamedImplementation", "root", false],
						["SingleCallReceiver", "operation", false],
						["OverloadedReceiver", "operation", false],
						["UnconstrainedReceiver", "operation", false],
					] as const) {
						const signature: SignatureFact | undefined = facts.declarations
							.find((item) => item.name === owner)
							?.members.find((item) => item.name === method)?.signatures[0];
						assert(signature !== undefined);
						const resolved: CompletedDocumentation | undefined =
							completed.value.documentation.find((item) => item.id === signature.id);
						assert(resolved !== undefined, owner);
						assert.equal(resolved.documented, expected, owner);
						assert.equal(resolved.inheritedFrom.length > 0, expected, owner);
					}
					const reportOwners = new Set([
						"DocumentedClass",
						"EmptyImplementation",
						"TagOnlyImplementation",
						"DocumentedImplementation",
						"SingleCallReceiver",
						"RenamedImplementation",
					]);
					const reportGraph = {
						...completed.value,
						facts: {
							...completed.value.facts,
							surfaces: completed.value.facts.surfaces.map((surface) => ({
								...surface,
								exports: surface.exports.filter((entry) => reportOwners.has(entry.name)),
							})),
						},
					};
					const memberReport = getSuccessValue(
						createReviewReport(prepareReviewReport(reportGraph), ".", {
							name: "members",
							releaseLevels: [ReleaseLevel.Public, ReleaseLevel.Beta, ReleaseLevel.Internal],
							includeUntagged: true,
						}),
					);
					for (const entry of memberReport.exports) {
						const method = entry.container?.members.find((item) =>
							item.text.startsWith(
								entry.name === "DocumentedClass"
									? "convert("
									: entry.name === "SingleCallReceiver"
										? "operation("
										: "root(",
							),
						);
						assert(method !== undefined, entry.name);
						assert.equal(method.documented, entry.name === "DocumentedClass", entry.name);
					}
					const inheritedLevel = completeAnalysis(createTestAnalysisContext(facts));
					assert.equal(inheritedLevel.ok, true, JSON.stringify(inheritedLevel));
					const invalid = {
						...supported,
						declarations: supported.declarations.map((declaration) =>
							declaration.id === scoped.id
								? {
										...declaration,
										members: declaration.members.map((member) =>
											member.name === "linked"
												? {
														...member,
														signatures: member.signatures.map((signature) => {
															assert(signature.documentationContext !== undefined);
															return {
																...signature,
																documentation: "/** See {@link missing}. @beta */",
																documentationContext: {
																	...signature.documentationContext,
																	links: [
																		{ reference: "missing", status: "not-found" as const },
																	],
																},
															};
														}),
													}
												: member,
										),
									}
								: declaration,
						),
					};
					const invalidReference = completeAnalysis(createTestAnalysisContext(invalid));
					assert.equal(invalidReference.ok, false);
					assert.equal(
						invalidReference.diagnostics[0]?.code,
						DiagnosticCode.DocumentationReference,
					);
					assert.equal("value" in invalidReference, false);
				} finally {
					adapter.close();
				}
			});

			it("captures exact excerpt targets across aliases, binders, and substituted scopes", async () => {
				const configuration = getSuccessValue(
					resolveConfiguration(
						{
							packageName: "example",
							project: "tsconfig.json",
							entrypoints: [{ name: ".", path: "declarations/excerpt-references.d.ts" }],
						},
						directory,
					),
				);
				const adapter = createNativeAdapter();
				try {
					const facts = getSuccessValue(adapter.analyze(configuration));
					adapter.close();

					// Select by exported identity: the fixture contains distinct declarations named Value.
					const getDeclaration = (name: string): AnalysisFacts["declarations"][number] => {
						const target = facts.surfaces[0]?.exports.find(
							(item) => item.name === name,
						)?.target;
						const value = facts.declarations.find((item) => item.id === target);
						assert(value !== undefined, name);
						return value;
					};
					const local = getDeclaration("Value");
					const pairSource = getDeclaration("Pair").declarations[0];
					assert(pairSource !== undefined && "excerpt" in pairSource);
					const view = facts.declarations.find((item) => item.name === "View");
					assert(view !== undefined);
					const nestedValue = getDeclaration("Nested").exports.find(
						(item) => item.name === "Value",
					)?.target;
					assert(nestedValue !== undefined);
					for (const [name, expected] of [
						["qualified", [local.id, nestedValue, local.id, nestedValue]],
						["aliased", [view.id, view.id]],
						["imported", [view.id, view.id]],
						["shadow", [view.id]],
						["query", [local.id]],
						["nested", [local.id]],
						["mapped", [local.id]],
						["conditional", [local.id]],
					] as const) {
						const signature = getDeclaration(name).signatures[0];
						assert(signature !== undefined);
						for (const display of [signature, signature.normalized, signature.reduced]) {
							assert(display.callSignatureExcerpt !== undefined);

							// Reducing typeof Value removes that name from the text, so only the effective view links it.
							assert.deepEqual(
								display.callSignatureExcerpt.tokens
									.filter((token) => token.kind === "Reference")
									.map((token) => token.target),
								name === "query" && display !== signature ? [] : expected,
								name,
							);
							assert.equal(
								display.callSignatureExcerpt.tokens.map((token) => token.text).join(""),
								display.callSignatureText,
							);
						}
					}

					// Substitution must target the receiver's Value, not the same-named API in the base module.
					const inherited = getDeclaration("Receiver").members.find(
						(member) => member.name === "convert",
					)?.signatures[0];
					assert(inherited !== undefined);
					assert.deepEqual(
						inherited.normalized.callSignatureExcerpt?.tokens
							.filter((token) => token.kind === "Reference")
							.map((token) => token.target),
						[local.id, local.id],
					);
					assert("callSignatureExcerpt" in inherited);
					const property = getDeclaration("Receiver").members.find(
						(member) => member.name === "item",
					);
					assert(property !== undefined);
					assert("typeExcerpt" in property);
					const boxed = getDeclaration("Receiver").members.find(
						(member) => member.name === "boxed",
					);
					assert.deepEqual(
						boxed?.typeExcerpt?.tokens
							.filter((token) => token.kind === "Reference")
							.map((token) => token.target),
						[local.id],
					);
					const box = getDeclaration("Receiver").members.find(
						(member) => member.name === "box",
					)?.signatures[0];
					assert.deepEqual(
						box?.normalized.callSignatureExcerpt?.tokens
							.filter((token) => token.kind === "Reference")
							.map((token) => token.target),
						[local.id],
					);
					const completed = getSuccessValue(
						completeAnalysis(createTestAnalysisContext(facts)),
					);
					const encoded = encodeDependencyModel(completed);
					const model = getSuccessValue(decodeDependencyModel(encoded, "example"));
					const portable = model.graph.declarations.find(
						(item) => item.id === getDeclaration("aliased").id,
					)?.signatures[0];
					assert(portable !== undefined);
					assert("callSignatureExcerpt" in portable.effective);
					const normalized = getDeclaration("aliased").signatures[0]?.normalized;
					assert(normalized !== undefined);
					const { imports, ...portableSyntax } = normalized;
					assert.equal(imports?.[0]?.name, "ImportedView");
					assert.deepEqual(portable.normalized, portableSyntax);
					const portableProperty = model.graph.declarations
						.find((item) => item.id === getDeclaration("Receiver").id)
						?.members.find((item) => item.name === "item");
					assert(portableProperty !== undefined && "typeExcerpt" in portableProperty);
					const special = model.graph.declarations.find(
						(item) => item.id === getDeclaration("Special").id,
					);
					assert(special?.container !== undefined);
					const staticTarget = getDeclaration("Special").container?.declaredMembers.find(
						(member) => member.kind === "MethodDeclaration",
					)?.staticTarget;
					assert(staticTarget !== undefined);
					assert.deepEqual(
						getDeclaration("staticQuery")
							.signatures[0]?.callSignatureExcerpt?.tokens.filter(
								(token) => token.kind === "Reference",
							)
							.map((token) => token.target),
						[staticTarget],
					);
					for (const member of special.container.declaredMembers) {
						assert(
							member.source.excerpt.tokens.some(
								(token) => token.kind === "Reference" && token.target === local.id,
							),
							member.source.kind,
						);
					}

					// Corrupt only excerpt data to exercise bounds, reconstruction, target, and required-field checks.
					for (const excerpt of [
						{
							...portable.normalized.callSignatureExcerpt,
							tokenRange: { startIndex: 0, endIndex: 999 },
						},
						{
							...portable.normalized.callSignatureExcerpt,
							tokenRange: { startIndex: 2, endIndex: 1 },
						},
						{
							...portable.normalized.callSignatureExcerpt,
							tokens: [{ kind: "Content", text: "wrong text" }],
						},
						{
							...portable.normalized.callSignatureExcerpt,
							tokens: portable.normalized.callSignatureExcerpt.tokens.map((token) =>
								token.kind === "Reference" ? { ...token, target: "missing" } : token,
							),
						},
						undefined,
					]) {
						const invalid = {
							...model,
							graph: {
								...model.graph,
								declarations: model.graph.declarations.map((item) =>
									item.id === getDeclaration("aliased").id
										? {
												...item,
												signatures: item.signatures.map((signature) => ({
													...signature,
													normalized: {
														...signature.normalized,
														callSignatureExcerpt: excerpt,
													},
												})),
											}
										: item,
								),
							},
						};
						assert.equal(decodeDependencyModel(JSON.stringify(invalid), "example").ok, false);
					}

					// A fresh process blocks compiler imports and renders links using only serialized tokens and IDs.
					const rendered = execFileSync(
						process.execPath,
						[
							"--input-type=module",
							"--eval",
							`
						import assert from 'node:assert/strict';
						import {readFileSync} from 'node:fs';
						import {registerHooks} from 'node:module';
						registerHooks({resolve(specifier, context, next) {
							assert(!specifier.startsWith('typescript') && !specifier.includes('/analysis/'));
							return next(specifier, context);
						}});
						const {decodeDependencyModel} = await import(${JSON.stringify(new URL("../model.js", import.meta.url).href)});
						const decoded = decodeDependencyModel(readFileSync(0, 'utf8'), 'example');
						assert(decoded.ok, JSON.stringify(decoded));
						const model = decoded.value;
						const targets = new Map(model.graph.declarations.map(item => [item.id, item]));
						const binding = model.graph.surfaces[0].exports.find(item => item.name === 'qualified');
						const excerpt = targets.get(binding.target).signatures[0].normalized.callSignatureExcerpt;
						const tokens = excerpt.tokens.slice(excerpt.tokenRange.startIndex, excerpt.tokenRange.endIndex);
						const links = tokens.filter(token => token.kind === 'Reference');
						assert.equal(links.length, 4);
						assert.notEqual(links[0].target, links[1].target);
						assert(links.every(token => targets.has(token.target)));
						console.log(tokens.map(token => token.kind === 'Reference' ? '[' + token.text + '](#' + encodeURIComponent(token.target) + ')' : token.text).join(''));
					`,
						],
						{ cwd: tmpdir(), input: encoded, encoding: "utf8" },
					);
					assert.match(rendered, /\[Value]\(#/);
					assert.match(rendered, /\[Nested.Value]\(#/);
				} finally {
					adapter.close();
				}
			});

			it("retains effective named references through inherited generic members", () => {
				const configuration = getSuccessValue(
					resolveConfiguration(
						{
							packageName: "example",
							project: "tsconfig.json",
							entrypoints: [{ name: ".", path: "declarations/effective-references.d.ts" }],
						},
						directory,
					),
				);
				const adapter = createNativeAdapter();
				try {
					const facts = getSuccessValue(adapter.analyze(configuration));
					adapter.close();
					const preview = facts.declarations.find((item) => item.name === "Preview");
					const derived = facts.declarations.find((item) => item.name === "Derived");
					assert(preview !== undefined && derived !== undefined);
					for (const member of derived.members) {
						const context =
							member.documentationContext ?? member.signatures[0]?.documentationContext;
						assert(
							context?.typeReferences?.some((reference) => reference.target === preview.id) ===
								true,
							member.name,
						);
					}
					const result = completeAnalysis(
						createTestAnalysisContext(facts, {
							referencePolicies: {
								releaseCompatibility: true,
								entrypointExposure: true,
								directional: [
									{
										name: "no-public-to-beta",
										source: { releaseLevels: [ReleaseLevel.Public] },
										target: { releaseLevels: [ReleaseLevel.Beta] },
									},
								],
							},
						}),
					);
					assert.equal(result.ok, true, JSON.stringify(result));
					const model = getSuccessValue(
						decodeDependencyModel(encodeDependencyModel(result.value), "example"),
					);
					const portableDerived = model.graph.declarations.find(
						(item) => item.id === derived.id,
					);
					assert(portableDerived !== undefined);
					const portablePreview = model.graph.declarations.find(
						(item) => item.id === preview.id,
					);
					assert.equal(portablePreview?.name, "Preview");
					for (const member of portableDerived.members) {
						const references = [
							...member.references,
							...member.signatures.flatMap((signature) => signature.references),
						];
						assert(
							references.some((reference) => reference.target === preview.id),
							member.name,
						);
						assert.match(member.type, /Preview/);
					}
					for (const member of derived.members) {
						const identities =
							member.documentationContext === undefined
								? member.signatures.map((signature) => signature.id)
								: [member.id];
						for (const id of identities) {
							assert.equal(
								model.apis.find((item) => item.id === id)?.metadata.releaseLevel,
								ReleaseLevel.Public,
							);
						}
					}
					const report = renderReviewReport(
						getSuccessValue(
							createReviewReport(prepareReviewReport(result.value), ".", {
								name: "beta",
								releaseLevels: [ReleaseLevel.Public, ReleaseLevel.Beta],
							}),
						),
					);
					assertSnapshot(report, "effective-references.beta.md");
					const source = facts.declarations.find((item) => item.name === "Base");
					assert(source !== undefined);
					for (const owner of [source, derived]) {
						const invalid = {
							...facts,
							declarations: facts.declarations.map((declaration) =>
								declaration.id === owner.id
									? {
											...declaration,
											members: declaration.members.map((member) =>
												member.documentationContext === undefined
													? member
													: {
															...member,
															documentationContext: {
																...member.documentationContext,
																container: source.id,
																typeReferences: [
																	{
																		target: preview.id,
																		text: "Preview",
																		origin: member.documentationContext.origin,
																	},
																],
															},
														},
											),
										}
									: declaration,
							),
						};
						const checked = completeAnalysis(
							createTestAnalysisContext(invalid, {
								referencePolicies: { releaseCompatibility: true },
							}),
						);
						assert.equal(checked.ok, owner === derived);
					}
				} finally {
					adapter.close();
				}
			});

			it("retains unexported declaration references after compiler disposal", () => {
				const configuration = getSuccessValue(
					resolveConfiguration(
						{
							packageName: "example",
							project: "tsconfig.json",
							entrypoints: [{ name: ".", path: "declarations/type-references.d.ts" }],
							customModifierTags: ["@legacy"],
						},
						directory,
					),
				);
				const adapter = createNativeAdapter();
				try {
					const extracted = getSuccessValue(adapter.analyze(configuration));
					adapter.close();
					const facts = JSON.parse(JSON.stringify(extracted)) as AnalysisFacts;
					const source = facts.declarations.find((item) => item.name === "useHidden");
					assert(source !== undefined);
					const references = source.signatures[0]?.documentationContext?.typeReferences;
					assert.equal(references?.length, 2);
					for (const reference of references ?? []) {
						assert.equal(reference.text, "HiddenContract");
						assert.equal(
							facts.declarations.find((item) => item.id === reference.target)?.name,
							"HiddenContract",
						);
						assert.equal(
							facts.surfaces[0]?.exports.some((item) => item.target === reference.target),
							false,
						);
					}
					for (const [referencePolicies, expected] of [
						[{}, true],
						[{ releaseCompatibility: true }, false],
						[{ entrypointExposure: true }, false],
						[{ releaseCompatibility: false, entrypointExposure: false }, true],
					] as const) {
						const result = completeAnalysis(
							createTestAnalysisContext(facts, {
								referencePolicies,
								customModifierTags: ["@legacy"],
							}),
						);
						assert.equal(result.ok, expected, JSON.stringify(referencePolicies));
						if (!result.ok) {
							assert.equal(result.diagnostics[0]?.code, "reference-policy");
							assert.match(result.diagnostics[0]?.message ?? "", /HiddenContract/);
						}
					}
					const levels = [
						ReleaseLevel.Public,
						ReleaseLevel.Beta,
						ReleaseLevel.Alpha,
						ReleaseLevel.Internal,
					];
					const current = { releaseLevels: levels, excludeTags: ["@legacy"] };
					const legacy = { releaseLevels: levels, requireTags: ["@legacy"] };
					for (const [from, to, enabled, expected] of [
						[current, legacy, true, false],
						[legacy, current, true, true],
						[current, legacy, false, true],
					] as const) {
						const result = completeAnalysis(
							createTestAnalysisContext(facts, {
								customModifierTags: ["@legacy"],
								referencePolicies: {
									directional: [
										{ name: "no-current-to-legacy", source: from, target: to, enabled },
									],
								},
							}),
						);
						assert.equal(result.ok, expected);
						if (!result.ok) {
							assert.match(result.diagnostics[0]?.message ?? "", /no-current-to-legacy/);
						}
					}
					const hidden = facts.declarations.find((item) => item.name === "HiddenContract");
					assert(hidden !== undefined);
					const exposed = {
						...facts,
						surfaces: facts.surfaces.map((surface) => ({
							...surface,
							exports: [
								...surface.exports,
								{ name: "ContractAlias", target: hidden.id, typeOnly: true },
							],
						})),
					};
					assert.equal(
						completeAnalysis(
							createTestAnalysisContext(exposed, {
								customModifierTags: ["@legacy"],
								referencePolicies: { entrypointExposure: true },
							}),
						).ok,
						true,
					);
				} finally {
					adapter.close();
				}
			});

			it("extracts one package comment independently of entrypoint selection", () => {
				const file = path.join(directory, "declarations/package-overview.d.ts");
				const sourceFile = path.join(directory, "src/package-overview.ts");
				const adapter = createNativeAdapter();
				try {
					cpSync(
						new URL("../../src/test/fixtures/suite/package-overview.d.ts", import.meta.url),
						sourceFile,
					);
					const compilerDirectory = path.dirname(
						require.resolve(`${compilerPackage}/package.json`),
					);
					execFileSync(
						process.execPath,
						[path.join(compilerDirectory, "bin/tsc"), "-p", "build.json"],
						{ cwd: directory, stdio: "pipe", timeout: 15000 },
					);
					const configuration = getSuccessValue(
						resolveConfiguration(
							{
								packageName: "example",
								project: "tsconfig.json",
								entrypoints: [
									{ name: "./first", path: "declarations/reference-selectors.d.ts" },
									{ name: "./second", path: "declarations/reference-selectors.d.ts" },
								],
							},
							directory,
						),
					);
					const facts = getSuccessValue(adapter.analyze(configuration));
					adapter.close();
					assert(facts.packageDocumentation !== undefined);
					assert.equal(
						facts.packageDocumentation.origin.file,
						"declarations/package-overview.d.ts",
					);
					assert.match(facts.packageDocumentation.documentation, /Package-wide overview/);
					assert(Object.isFrozen(facts.packageDocumentation));
					assert(
						facts.inputFiles?.some(
							(input) => input.file === "declarations/package-overview.d.ts",
						) === true,
					);
					assert(
						facts.declarations.every((item) =>
							item.declarations.every(
								(source) => source.documentation?.includes("@packageDocumentation") !== true,
							),
						),
					);
				} finally {
					adapter.close();
					rmSync(file, { force: true });
					rmSync(sourceFile, { force: true });
				}
			});

			it("does not use package documentation as the first API's comment", async () => {
				const file = path.join(directory, "declarations/package-first-api.d.ts");
				const original = readFileSync(
					new URL("../../src/test/fixtures/suite/package-overview.d.ts", import.meta.url),
					"utf8",
				);
				try {
					writeFileSync(
						file,
						original.replace("export {};", "export declare function bare(): void;"),
					);
					const analysis = getSuccessValue(
						await analyzeAPIs(
							{
								packageName: "example",
								project: "tsconfig.json",
								entrypoints: [{ name: ".", path: "declarations/package-first-api.d.ts" }],
								rules: { requireReleaseLevel: false, requirePackageDocumentation: true },
							},
							directory,
						),
					);
					const model = getSuccessValue(
						decodeDependencyModel(analysis.generateModel(), "example"),
					);
					assert(model.packageDocumentation !== undefined);
					const item = model.apis.find((entry) => entry.name === "bare");
					assert(item !== undefined);
					assert.equal(item.documentation.documented, false);
					assert.deepEqual(item.metadata.modifierTags, []);
				} finally {
					rmSync(file, { force: true });
				}
			});

			it("shares package documentation across reports and models with an optional requirement", async () => {
				const file = path.join(directory, "declarations/package-overview.d.ts");
				const entry = path.join(directory, "declarations/package-entry.d.ts");
				cpSync(new URL("../../src/test/fixtures/suite/unused.d.ts", import.meta.url), entry);
				const configuration = {
					packageName: "example",
					project: "tsconfig.json",
					entrypoints: [
						{ name: "./first", path: "declarations/package-entry.d.ts" },
						{ name: "./second", path: "declarations/package-entry.d.ts" },
					],
				};
				try {
					// Literal text and code examples must not become package documentation declarations.
					writeFileSync(
						file,
						[
							'export declare const marker: "/** @packageDocumentation */";',
							`export type Template = \`before\${string}/** @packageDocumentation */after\`;`,
							"/**\n * Example.\n * @example\n * ```ts\n * // @packageDocumentation\n * ```\n */\nexport {};",
						].join("\n"),
					);
					const absent = getSuccessValue(await analyzeAPIs(configuration, directory));
					assert.equal(
						getSuccessValue(decodeDependencyModel(absent.generateModel(), "example"))
							.packageDocumentation,
						undefined,
					);
					const required = await analyzeAPIs(
						{ ...configuration, rules: { requirePackageDocumentation: true } },
						directory,
					);
					assert.equal(required.ok, false);
					assert.equal(
						required.diagnostics[0]?.code,
						DiagnosticCode.PackageDocumentationMissing,
					);
					cpSync(
						new URL("../../src/test/fixtures/suite/package-overview.d.ts", import.meta.url),
						file,
					);
					const analysis = getSuccessValue(
						await analyzeAPIs(
							{ ...configuration, rules: { requirePackageDocumentation: true } },
							directory,
						),
					);
					const model = getSuccessValue(
						decodeDependencyModel(analysis.generateModel(), "example"),
					);
					assert.equal(
						model.packageDocumentation?.origin.file,
						"declarations/package-overview.d.ts",
					);
					assert.match(
						model.packageDocumentation?.documentation ?? "",
						/Package-wide overview/,
					);
					assert(
						model.apis.every(
							(item) => !item.metadata.modifierTags.includes("@packageDocumentation"),
						),
					);
					const selection = { name: "public", releaseLevels: [ReleaseLevel.Public] };
					const first = getSuccessValue(analysis.generateReport("./first", selection));
					assert.equal(first, getSuccessValue(analysis.generateReport("./second", selection)));
					assertSnapshot(first, "package-documentation.public.md");
					const empty = getSuccessValue(
						analysis.generateReport("./first", {
							name: "beta",
							releaseLevels: [ReleaseLevel.Beta],
						}),
					);
					assertSnapshot(empty, "package-documentation.empty.md");
				} finally {
					rmSync(file, { force: true });
					rmSync(entry, { force: true });
				}
			});

			it("resolves package API links in their original scope without item classification", async () => {
				const file = path.join(directory, "declarations/package-links.d.ts");
				const original =
					"/**\n * See {@link Alias.(operation:static)}, {@link example#ReferenceSource.(operation:instance)}, {@link (overloaded:1)}, and {@link https://example.com}.\n * @packageDocumentation\n */\nimport { ReferenceSource as Alias, overloaded } from './reference-selectors.js';\nexport {};";
				try {
					writeFileSync(file, original);
					const configuration = {
						packageName: "example",
						project: "tsconfig.json",
						entrypoints: [{ name: ".", path: "declarations/reference-selectors.d.ts" }],
					};
					const analysis = getSuccessValue(await analyzeAPIs(configuration, directory));
					const model = getSuccessValue(
						decodeDependencyModel(analysis.generateModel(), "example"),
					);
					assert.equal(model.packageDocumentation?.links.length, 3);
					assert.notEqual(
						model.packageDocumentation?.links[0]?.targetSignature,
						model.packageDocumentation?.links[1]?.targetSignature,
					);
					assert(
						model.packageDocumentation?.links.every(
							(link) => link.origin.file === "declarations/package-links.d.ts",
						) === true,
					);
					for (const [reference, code] of [
						["(overloaded:2)", DiagnosticCode.DocumentationLinkPolicy],
						["(overloaded:3)", DiagnosticCode.DocumentationReference],
						["missing", DiagnosticCode.DocumentationReference],
					] as const) {
						writeFileSync(file, original.replace("(overloaded:1)", reference));
						const result = await analyzeAPIs(configuration, directory);
						assert.equal(result.ok, false);
						assert.equal(result.diagnostics[0]?.code, code, JSON.stringify(result));
					}
				} finally {
					rmSync(file, { force: true });
				}
			});

			it("rejects misplaced, duplicate, and invalid package comments", async () => {
				const file = path.join(directory, "declarations/package-overview.d.ts");
				const duplicate = path.join(directory, "declarations/package-overview-copy.d.ts");
				const original = readFileSync(
					new URL("../../src/test/fixtures/suite/package-overview.d.ts", import.meta.url),
					"utf8",
				);
				const configuration = {
					packageName: "example",
					project: "tsconfig.json",
					entrypoints: [{ name: ".", path: "declarations/reference-selectors.d.ts" }],
				};
				try {
					for (const [text, code] of [
						[`export {};\n${original}`, DiagnosticCode.PackageDocumentationInvalid],
						[
							original.replace("@packageDocumentation", "@packageDocumentation\n * @public"),
							DiagnosticCode.PackageDocumentationInvalid,
						],
						[
							original.replace(
								"@packageDocumentation",
								"@packageDocumentation\n * @param value - Not a package parameter.",
							),
							DiagnosticCode.PackageDocumentationInvalid,
						],
						[
							original.replace("Package-wide overview.", "See {@link ReferenceSource}."),
							DiagnosticCode.DocumentationReference,
						],
						[
							"/**\n * {@inheritDoc ReferenceSource}\n * @packageDocumentation\n */\nexport {};",
							DiagnosticCode.PackageDocumentationInvalid,
						],
						[
							original.replace("Package-wide overview.", "Bad {@link}."),
							DiagnosticCode.DocumentationTsdoc,
						],
					] as const) {
						writeFileSync(file, text);
						const result = await analyzeAPIs(configuration, directory);
						assert.equal(result.ok, false, text);
						assert.equal(result.diagnostics[0]?.code, code, JSON.stringify(result));
					}
					writeFileSync(file, original);
					writeFileSync(duplicate, original);
					const repeated = await analyzeAPIs(configuration, directory);
					assert.equal(repeated.ok, false);
					assert.equal(
						repeated.diagnostics[0]?.code,
						DiagnosticCode.PackageDocumentationInvalid,
					);
					assert.match(
						repeated.diagnostics[0]?.message ?? "",
						/package-overview-copy.*package-overview/,
					);
				} finally {
					rmSync(file, { force: true });
					rmSync(duplicate, { force: true });
				}
			});

			it("resolves member-side selectors and numeric links before compiler disposal", async () => {
				const result = await analyzeAPIs(
					{
						packageName: "example",
						project: "tsconfig.json",
						entrypoints: [{ name: ".", path: "declarations/reference-selectors.d.ts" }],
					},
					directory,
				);
				assert.equal(result.ok, true, JSON.stringify(result));
				const model = decodeDependencyModel(result.value.generateModel(), "example");
				assert.equal(model.ok, true, JSON.stringify(model));
				const links = model.value.apis.find((item) => item.name === "links")?.documentation
					.links;
				assert(links !== undefined);
				assert.equal(links.length, 4);
				assert.notEqual(links[0]?.target, links[1]?.target);
				assert.match(
					model.value.apis.find((item) => item.name === "fromStatic")?.documentation
						.documentation ?? "",
					/Static operation documentation/,
				);
				assert.match(
					model.value.apis.find((item) => item.name === "fromInstance")?.documentation
						.documentation ?? "",
					/Instance operation documentation/,
				);
			});

			it("resolves self-package references through configured entrypoint exports", async () => {
				const analysis = getSuccessValue(
					await analyzeAPIs(
						{
							packageName: "example",
							project: "tsconfig.json",
							entrypoints: [
								{ name: ".", path: "declarations/self-references.d.ts" },
								{ name: "./selectors", path: "declarations/reference-selectors.d.ts" },
							],
						},
						directory,
					),
				);
				const model = getSuccessValue(
					decodeDependencyModel(analysis.generateModel(), "example"),
				);
				const links = model.apis.find((item) => item.name === "qualifiedLinks")?.documentation
					.links;
				assert(links !== undefined);
				assert.equal(links.length, 5);
				assert.notEqual(links[0]?.target, links[1]?.target);
				assert.equal(
					model.apis.find((item) => item.id === links[2]?.targetSignature)?.metadata
						.releaseLevel,
					ReleaseLevel.Public,
				);
				assert.match(
					model.apis.find((item) => item.name === "qualifiedInheritance")?.documentation
						.documentation ?? "",
					/Public overload documentation/,
				);
				assert.match(
					model.apis.find((item) => item.name === "qualifiedStatic")?.documentation
						.documentation ?? "",
					/Static operation documentation/,
				);
			});

			it("validates qualified exports without falling back to private names or other surfaces", async () => {
				const file = path.join(directory, "declarations/self-references.d.ts");
				const original = readFileSync(file, "utf8");
				const configuration = {
					packageName: "example",
					project: "tsconfig.json",
					entrypoints: [
						{ name: ".", path: "declarations/self-references.d.ts" },
						{ name: "./selectors", path: "declarations/reference-selectors.d.ts" },
					],
				};
				try {
					for (const [before, replacementReference, code] of [
						[
							"example/selectors#(overloaded:1)",
							"example/selectors#(overloaded:2)",
							DiagnosticCode.DocumentationLinkPolicy,
						],
						[
							"example/selectors#(overloaded:1)",
							"example/selectors#(overloaded:3)",
							DiagnosticCode.DocumentationReference,
						],
						[
							"example/selectors#(overloaded:1)",
							"example#overloaded",
							DiagnosticCode.DocumentationReference,
						],
						[
							"example#SourceAlias.(operation:static)",
							"example#ReferenceSource.(operation:static)",
							DiagnosticCode.DocumentationReference,
						],
						[
							"example#SourceAlias.(operation:static)",
							"example#SourceAlias.operation",
							DiagnosticCode.DocumentationUnsupported,
						],
						[
							"example/selectors#Group.self.self.run",
							"example/missing#Group.run",
							DiagnosticCode.DocumentationReference,
						],
						[
							"example/selectors#Group.self.self.run",
							"example/selectors#Group.self.missing",
							DiagnosticCode.DocumentationReference,
						],
					] as const) {
						const changed = original.replace(before, replacementReference);
						assert.notEqual(changed, original);
						writeFileSync(file, changed);
						const result = await analyzeAPIs(configuration, directory);
						assert.equal(result.ok, false, replacementReference);
						assert.equal(result.diagnostics[0]?.code, code, JSON.stringify(result));
					}
					writeFileSync(file, original);
					const unconfigured = await analyzeAPIs(
						{ ...configuration, entrypoints: configuration.entrypoints.slice(0, 1) },
						directory,
					);
					assert.equal(unconfigured.ok, false);
					assert.equal(
						unconfigured.diagnostics[0]?.code,
						DiagnosticCode.DocumentationReference,
					);
				} finally {
					writeFileSync(file, original);
				}
			});

			it("resolves scoped self-package names independently of entrypoint order", async () => {
				const file = path.join(directory, "declarations/self-references.d.ts");
				const manifest = path.join(directory, "package.json");
				const original = readFileSync(file, "utf8");
				const originalManifest = readFileSync(manifest, "utf8");
				try {
					writeFileSync(file, original.replaceAll("example", "@scope/example"));
					writeFileSync(
						manifest,
						JSON.stringify({ ...JSON.parse(originalManifest), name: "@scope/example" }),
					);
					const entrypoints = [
						{ name: "./selectors", path: "declarations/reference-selectors.d.ts" },
						{ name: ".", path: "declarations/self-references.d.ts" },
					];
					const configuration = {
						packageName: "@scope/example",
						project: "tsconfig.json",
						entrypoints,
					};
					const first = getSuccessValue(await analyzeAPIs(configuration, directory));
					const second = getSuccessValue(
						await analyzeAPIs(
							{ ...configuration, entrypoints: [...entrypoints].reverse() },
							directory,
						),
					);
					assert.equal(first.generateModel(), second.generateModel());
					const model = getSuccessValue(
						decodeDependencyModel(first.generateModel(), "@scope/example"),
					);
					assert.equal(
						model.apis.find((item) => item.name === "qualifiedLinks")?.documentation.links
							.length,
						5,
					);
				} finally {
					writeFileSync(file, original);
					writeFileSync(manifest, originalManifest);
				}
			});

			it("combines merged documentation like IntelliSense and deduplicates tags", async () => {
				const file = path.join(directory, "declarations/merged-comments.d.ts");
				const cases = [
					{
						first: "First description.",
						second: "Second description.",
						expected: ["First description.", "Second description."],
					},
					{
						first: "Shared description.",
						second: "Shared description.",
						expected: ["Shared description."],
					},
					{ first: "Only description.", second: "", expected: ["Only description."] },
					{ first: "", second: "Only description.", expected: ["Only description."] },
					{ first: undefined, second: "Only description.", expected: ["Only description."] },
					{ first: "Only description.", second: undefined, expected: ["Only description."] },
				];
				try {
					for (const example of cases) {
						// Exercise both a tag on only one part and duplicate tags on otherwise identical parts.
						const secondTag =
							example.first === undefined || example.first === example.second ? "@legacy" : "";
						writeFileSync(
							file,
							[
								example.first === undefined
									? ""
									: `/**\n * ${example.first}\n * @public\n * @legacy\n */`,
								"export interface Settings { first: string;",
								example.first === undefined ? "" : `/** ${example.first} */`,
								"shared: string; }",
								example.second === undefined
									? ""
									: `/**\n * ${example.second}\n * @public\n * ${secondTag}\n */`,
								"export interface Settings { second: number;",
								example.second === undefined ? "" : `/** ${example.second} */`,
								"shared: string; }",
							].join("\n"),
						);
						const analysis = getSuccessValue(
							await analyzeAPIs(
								{
									packageName: "example",
									project: "tsconfig.json",
									entrypoints: [{ name: ".", path: "declarations/merged-comments.d.ts" }],
									customModifierTags: ["@legacy"],
								},
								directory,
							),
						);
						const model = getSuccessValue(
							decodeDependencyModel(analysis.generateModel(), "example"),
						);
						const settings = model.apis.find((item) => item.name === "Settings");
						assert(settings !== undefined);
						const text = settings.documentation.documentation ?? "";
						const parsed = new TSDocParser().parseString(text).docComment;
						assert.equal(parsed.summarySection.getChildNodes().length > 0, true);
						for (const description of example.expected) {
							assert.equal(text.split(description).length - 1, 1, text);
						}
						const property = model.apis.find((item) => item.name === "shared");
						assert(property !== undefined);
						const propertyText = property.documentation.documentation ?? "";
						for (const description of example.expected) {
							assert.equal(propertyText.split(description).length - 1, 1, propertyText);
						}
						assert.equal(property.metadata.releaseLevel, ReleaseLevel.Public);
						assert.equal(text.split("@public").length - 1, 1, text);
						assert.equal(text.split("@legacy").length - 1, 1, text);
						const report = getSuccessValue(
							analysis.generateReport(".", {
								name: "legacy",
								releaseLevels: [ReleaseLevel.Public],
								requireTags: ["@legacy"],
							}),
						);
						assertSnapshot(report, "merged-comments.legacy.md");
					}
				} finally {
					rmSync(file, { force: true });
				}
			});

			it("retains the first identical description and its original link scope", async () => {
				// The duplicate description points to an internal target; only the retained beta target is valid here.
				const configuration = {
					packageName: "example",
					project: "tsconfig.json",
					entrypoints: [{ name: ".", path: "declarations/merged-scope-augmentation.d.ts" }],
				};
				const analysis = getSuccessValue(await analyzeAPIs(configuration, directory));
				const model = getSuccessValue(
					decodeDependencyModel(analysis.generateModel(), "example"),
				);
				const settings = model.apis.find((item) => item.name === "SharedSettings");
				assert(settings !== undefined);
				assert.equal(settings.documentation.links.length, 1);
				const link = settings.documentation.links[0];
				assert(link !== undefined);
				assert.equal(link.origin.file, "declarations/merged-scope.d.ts");
				assert.equal(
					model.apis.find((item) => item.id === link.targetSignature)?.metadata.releaseLevel,
					ReleaseLevel.Beta,
				);
			});

			it("deduplicates merged inheritance requests before resolving their original scopes", async () => {
				const file = path.join(directory, "declarations/merged-scope.d.ts");
				const augmentation = path.join(
					directory,
					"declarations/merged-scope-augmentation.d.ts",
				);
				const original = readFileSync(file, "utf8");
				const augmented = readFileSync(augmentation, "utf8");
				const comment = "/** Shared description. See {@link localTarget}. @public */";
				const configuration = {
					packageName: "example",
					project: "tsconfig.json",
					entrypoints: [{ name: ".", path: "declarations/merged-scope-augmentation.d.ts" }],
					referencePolicies: { inheritanceVisibility: true },
				};
				try {
					writeFileSync(
						file,
						`${original.replace(comment, "/** {@inheritDoc LocalSource} @public */")}\n/** First source. @public */\nexport interface LocalSource {}\n`,
					);
					const duplicate = `${augmented.replace(comment, "/** {@inheritDoc LocalSource} @public */")}\n/** Second source. @internal */\nexport interface LocalSource {}\n`;
					writeFileSync(augmentation, duplicate);
					const result = getSuccessValue(await analyzeAPIs(configuration, directory));
					const model = getSuccessValue(
						decodeDependencyModel(result.generateModel(), "example"),
					);
					const settings = model.apis.find((item) => item.name === "SharedSettings");
					assert.match(settings?.documentation.documentation ?? "", /First source/);
					assert.doesNotMatch(settings?.documentation.documentation ?? "", /Second source/);
					assert.equal(settings?.documentation.inheritedFrom.length, 1);
					writeFileSync(
						augmentation,
						`${duplicate.replace(
							"{@inheritDoc LocalSource} @public",
							"{@inheritDoc OtherSource} @public",
						)}\nexport type { LocalSource as OtherSource };\n`,
					);
					const invalid = await analyzeAPIs(configuration, directory);
					assert.equal(invalid.ok, false);
					assert.equal(invalid.diagnostics[0]?.code, DiagnosticCode.ReferencePolicy);
				} finally {
					writeFileSync(file, original);
					writeFileSync(augmentation, augmented);
				}
			});

			it("retains distinct merged descriptions with each link's original scope", async () => {
				const file = path.join(directory, "declarations/merged-scope-augmentation.d.ts");
				const original = readFileSync(file, "utf8");
				const distinct = original.replace("Shared description.", "Another description.");
				assert.notEqual(distinct, original);
				const configuration = {
					packageName: "example",
					project: "tsconfig.json",
					entrypoints: [{ name: ".", path: "declarations/merged-scope-augmentation.d.ts" }],
				};
				try {
					writeFileSync(file, distinct.replace("@internal", "@beta"));
					const analysis = getSuccessValue(await analyzeAPIs(configuration, directory));
					const model = getSuccessValue(
						decodeDependencyModel(analysis.generateModel(), "example"),
					);
					const settings = model.apis.find((item) => item.name === "SharedSettings");
					assert(settings !== undefined);
					assert.deepEqual(
						settings.documentation.links.map((link) => link.origin.file),
						["declarations/merged-scope.d.ts", "declarations/merged-scope-augmentation.d.ts"],
					);
					assert.notEqual(
						settings.documentation.links[0]?.target,
						settings.documentation.links[1]?.target,
					);
					const text = settings.documentation.documentation ?? "";
					assert(text.includes("Shared description."));
					assert(text.includes("Another description."));
					assert(text.indexOf("Shared description.") < text.indexOf("Another description."));

					// Retaining the second description must also retain policy validation for its internal link.
					writeFileSync(file, distinct);
					const invalid = await analyzeAPIs(configuration, directory);
					assert.equal(invalid.ok, false);
					assert.equal(invalid.diagnostics[0]?.code, DiagnosticCode.DocumentationLinkPolicy);
				} finally {
					writeFileSync(file, original);
				}
			});

			it("inherits same-kind declaration documentation without changing shape", async () => {
				const result = getSuccessValue(
					await analyzeAPIs(
						{
							packageName: "example",
							project: "tsconfig.json",
							entrypoints: [{ name: ".", path: "declarations/declaration-inheritance.d.ts" }],
						},
						directory,
					),
				);
				const model = getSuccessValue(
					decodeDependencyModel(result.generateModel(), "example"),
				);
				for (const [name, description] of [
					["ReceiverClass", "Class description"],
					["ReceiverAlias", "Alias description"],
					["receiverConstant", "Constant description"],
					["ReceiverEnum", "Enum description"],
					["ReceiverNamespace", "Namespace description"],
				]) {
					assert.match(
						model.apis.find((item) => item.name === name)?.documentation.documentation ?? "",
						new RegExp(description ?? ""),
					);
				}
				const report = getSuccessValue(
					result.generateReport(".", { name: "public", releaseLevels: [ReleaseLevel.Public] }),
				);
				assertSnapshot(report, "declaration-inheritance.public.md");
			});

			it("inherits documentation from merged interfaces and repeated properties", async () => {
				const analysis = getSuccessValue(
					await analyzeAPIs(
						{
							packageName: "example",
							project: "tsconfig.json",
							entrypoints: [{ name: ".", path: "declarations/merged-inheritance.d.ts" }],
							customModifierTags: ["@legacy"],
						},
						directory,
					),
				);
				const model = getSuccessValue(
					decodeDependencyModel(analysis.generateModel(), "example"),
				);
				const receiver = model.apis.find((item) => item.name === "ReceivingSettings");
				const source = model.apis.find((item) => item.name === "SourceSettings");
				assert(receiver !== undefined);
				assert(source !== undefined);
				assert.match(receiver.documentation.documentation ?? "", /First source description/);
				assert.match(receiver.documentation.documentation ?? "", /Second source description/);
				assert.match(receiver.documentation.documentation ?? "", /@typeParam Value/);
				assert.deepEqual(receiver.typeParameters, ["Value"]);
				assert.equal(source.metadata.modifierTags.includes("@legacy"), true);
				assert.equal(receiver.metadata.modifierTags.includes("@legacy"), false);
				assert.equal(receiver.documentation.documentation?.includes("@legacy"), false);
				assert.deepEqual(receiver.documentation.inheritedFrom, [source.id]);
				const property = model.apis.find(
					(item) => item.declarationId === receiver.id && item.name === "value",
				);
				assert(property !== undefined);
				assert.match(property.documentation.documentation ?? "", /First property description/);
				assert.match(
					property.documentation.documentation ?? "",
					/Second property description/,
				);
				assert.equal(property.documentation.inheritedFrom.length, 1);
				assert.equal(property.metadata.releaseLevel, ReleaseLevel.Public);
				assert.equal(property.metadata.modifierTags.includes("@legacy"), false);
				const combined = model.apis.find((item) => item.name === "CombinedSettings");
				assert(combined !== undefined);
				const combinedText = combined.documentation.documentation ?? "";
				assert.match(combinedText, /First source description/);
				assert.match(combinedText, /Additional source description/);
				assert.equal(combinedText.split("First source description").length, 2);
				assert.equal(combined.documentation.inheritedFrom.length, 2);
				assert.equal(combined.documentation.links.length, 2);
				assert.equal(combined.metadata.modifierTags.includes("@legacy"), false);
				assert.match(combinedText, /Local combined description/);
				assert.match(combinedText, /Local combined example/);
				assert.doesNotMatch(combinedText, /Source-only|source-only/);
				assert(
					combinedText.indexOf("First source description") <
						combinedText.indexOf("Additional source description"),
				);
				assert.match(combinedText, /Additional value documentation/);
				assert.equal(
					combined.documentation.sections?.filter((section) => section.section === "summary")
						.length,
					3,
				);
				const chain = model.apis.find((item) => item.name === "CombinedChain");
				assert.match(chain?.documentation.documentation ?? "", /Local combined description/);
				assert.equal(
					chain?.documentation.sections?.filter((section) => section.section === "summary")
						.length,
					3,
				);
				assert.doesNotMatch(analysis.generateModel(), /documentation-contribution:/);
				const combinedProperty = model.apis.find(
					(item) => item.declarationId === combined.id && item.name === "value",
				);
				assert.match(
					combinedProperty?.documentation.documentation ?? "",
					/Additional property description/,
				);
				assert.match(
					combinedProperty?.documentation.documentation ?? "",
					/Second property description/,
				);
			});

			it("rejects invalid merged inheritance shapes, selectors, requests, and cycles", async () => {
				const file = path.join(directory, "declarations/merged-inheritance.d.ts");
				const original = readFileSync(file, "utf8");
				const cases = [
					{
						text: `${original.replace(
							"Additional source description. See {@link destination}.",
							"Additional source description. See {@link internalDestination}.",
						)}\n/** @internal */\nexport declare function internalDestination(): void;\n`,
						code: DiagnosticCode.DocumentationLinkPolicy,
					},
					{
						text: original.replace(
							"{@inheritDoc AdditionalSettings}",
							"{@inheritDoc missingSettings}",
						),
						code: DiagnosticCode.DocumentationReference,
					},
					{
						text: original.replace(
							"{@inheritDoc AdditionalSettings}",
							"{@inheritDoc CombinedChain}",
						),
						code: DiagnosticCode.DocumentationCycle,
					},
					{
						text: original.replaceAll(
							"ReceivingSettings<Value>",
							"ReceivingSettings<Renamed>",
						),
						code: DiagnosticCode.DocumentationReference,
					},
					{
						text: original.replace(
							"{@inheritDoc SourceSettings}",
							"{@inheritDoc (SourceSettings:1)}",
						),
						code: DiagnosticCode.DocumentationReference,
					},
					{
						text: original.replaceAll(
							"{@inheritDoc SourceSettings.value}",
							"{@inheritDoc SourceSettings}",
						),
						code: DiagnosticCode.DocumentationUnsupported,
					},
					{
						text: original.replace(
							"{@inheritDoc SourceSettings}",
							"{@inheritDoc destination}",
						),
						code: DiagnosticCode.DocumentationUnsupported,
					},
					{
						text: original.replace(
							"{@inheritDoc SourceSettings.value}",
							"{@inheritDoc ReceivingSettings.value}",
						),
						code: DiagnosticCode.DocumentationCycle,
					},
					{
						text: original.replace(
							"{@inheritDoc SourceSettings}",
							"{@inheritDoc ReceivingSettings}",
						),
						code: DiagnosticCode.DocumentationCycle,
					},
				];
				try {
					for (const example of cases) {
						assert.notEqual(example.text, original);
						writeFileSync(file, example.text);
						const result = await analyzeAPIs(
							{
								packageName: "example",
								project: "tsconfig.json",
								entrypoints: [{ name: ".", path: "declarations/merged-inheritance.d.ts" }],
								customModifierTags: ["@legacy"],
							},
							directory,
						);
						assert.equal(result.ok, false, JSON.stringify(result));
						assert.equal(result.diagnostics[0]?.code, example.code, JSON.stringify(result));
					}
				} finally {
					writeFileSync(file, original);
				}
			});

			it("inherits container releases and retains complete selected containers", async () => {
				const result = await analyzeAPIs(
					{
						packageName: "example",
						project: "tsconfig.json",
						entrypoints: [{ name: ".", path: "declarations/container-members.d.ts" }],
						customModifierTags: ["@selected", "@omit"],
					},
					directory,
				);
				assert.equal(result.ok, true, JSON.stringify(result));
				const report = result.value.generateReport(".", {
					name: "selected",
					releaseLevels: [ReleaseLevel.Public],
					requireTags: ["@selected"],
					excludeTags: ["@omit"],
				});
				assert.equal(report.ok, true, JSON.stringify(report));
				assertSnapshot(report.value, "container-members.selected.md");
				const beta = result.value.generateReport(".", {
					name: "beta",
					releaseLevels: [ReleaseLevel.Beta],
				});
				assert.equal(beta.ok, true);
				assertSnapshot(beta.value, "container-members.beta.md");
				const publicReport = result.value.generateReport(".", {
					name: "public",
					releaseLevels: [ReleaseLevel.Public],
				});
				assert.equal(publicReport.ok, true);
				assertSnapshot(publicReport.value, "container-members.public.md");

				// Model consumers receive effective release metadata, not copied custom tags or invented comments.
				const model = decodeDependencyModel(result.value.generateModel(), "example");
				assert.equal(model.ok, true, JSON.stringify(model));
				const derived = model.value.apis.find((item) => item.name === "DerivedContainer");
				assert(derived !== undefined);
				assert.equal(
					model.value.apis.find(
						(item) => item.declarationId === derived.id && item.name === "inherited",
					)?.metadata.releaseLevel,
					ReleaseLevel.Public,
				);
				assert.equal(
					model.value.apis.find(
						(item) => item.declarationId === derived.id && item.name === "local",
					)?.metadata.releaseLevel,
					ReleaseLevel.Beta,
				);
				const whole = model.value.apis.find((item) => item.name === "WholeClass");
				assert(whole !== undefined);
				const value = model.value.apis.find(
					(item) => item.declarationId === whole.id && item.name === "value",
				);
				assert(value !== undefined);
				assert.equal(value.metadata.releaseLevel, ReleaseLevel.Public);
				assert.equal(value.metadata.modifierTags.includes("@selected"), false);
				assert.equal(value.metadata.modifierTags.includes("@omit"), true);
			});

			it("rejects local container mismatches across member forms without an opt-out", async () => {
				const source = readFileSync(
					path.join(directory, "declarations/container-members.d.ts"),
					"utf8",
				);
				const file = path.join(directory, "declarations/container-mismatch.d.ts");
				try {
					for (const member of [
						"private constructor();",
						"static create(): WholeClass;",
						"get label(): string;",
						"method(value: number): number;",
						"(value: string): string;",
						"new (value: string): WholeClass;",
						"[key: string]: unknown;",
						"Second = 2",
						"function operation(): void;",
						"class Child {",
					]) {
						// Change only the closest member comment in a temporary declaration; the checked-in fixture stays valid.
						const line = source
							.split("\n")
							.find((text) => text.trim().replace(/,$/, "") === member);
						assert(line !== undefined, member);
						writeFileSync(file, source.replace(line, `/** @beta */\n${line}`));
						const result = await analyzeAPIs(
							{
								packageName: "example",
								project: "tsconfig.json",
								entrypoints: [{ name: ".", path: "declarations/container-mismatch.d.ts" }],
								customModifierTags: ["@selected", "@omit"],
								rules: { requireReleaseLevel: false, validateTsdocSyntax: false },
							},
							directory,
						);
						assert.equal(result.ok, false, member);
						assert.equal(
							result.diagnostics[0]?.code,
							DiagnosticCode.ClassificationContainerMismatch,
							JSON.stringify(result),
						);
						assert.match(result.diagnostics[0]?.message ?? "", /container-mismatch\.d\.ts/);
					}
					writeFileSync(
						file,
						source.replace("local: string;", "/** @public */\ninherited: string;"),
					);
					const override = await analyzeAPIs(
						{
							packageName: "example",
							project: "tsconfig.json",
							entrypoints: [{ name: ".", path: "declarations/container-mismatch.d.ts" }],
							customModifierTags: ["@selected", "@omit"],
						},
						directory,
					);
					assert.equal(override.ok, false);
					assert.equal(
						override.diagnostics[0]?.code,
						DiagnosticCode.ClassificationContainerMismatch,
					);
				} finally {
					rmSync(file, { force: true });
				}
			});

			it("retains type, value, callable and namespace facets of compound symbols", async () => {
				const analysis = getSuccessValue(
					await analyzeAPIs(
						{
							packageName: "example",
							project: "tsconfig.json",
							entrypoints: [{ name: ".", path: "declarations/compound-merges.d.ts" }],
						},
						directory,
					),
				);
				const report = getSuccessValue(
					analysis.generateReport(".", {
						name: "public",
						releaseLevels: [ReleaseLevel.Public],
					}),
				);
				const model = getSuccessValue(
					decodeDependencyModel(analysis.generateModel(), "example"),
				);
				assert(model.exports.some((item) => item.path.join(".") === "Factory.version"));
				assert(model.exports.some((item) => item.path.join(".") === "Widget.create"));
				assertSnapshot(report, "compound-merges.public.md");
				validateReportConsumers(
					directory,
					new Map([["compound-merges", report]]),
					"compoundMerges",
					[],
				);
			});

			it("merges string-literal ambient modules through namespace and direct exports", async () => {
				const analysis = getSuccessValue(
					await analyzeAPIs(
						{
							packageName: "example",
							project: "tsconfig.json",
							entrypoints: [{ name: ".", path: "declarations/ambient-entry.d.ts" }],
						},
						directory,
					),
				);
				const report = getSuccessValue(
					analysis.generateReport(".", {
						name: "public",
						releaseLevels: [ReleaseLevel.Public],
					}),
				);
				const model = getSuccessValue(
					decodeDependencyModel(analysis.generateModel(), "example"),
				);
				const namespace = model.apis.find((item) => item.kind === "ModuleDeclaration");
				assert(namespace !== undefined);
				assert.match(
					namespace.documentation.documentation ?? "",
					/First ambient contribution/,
				);
				assert.match(
					namespace.documentation.documentation ?? "",
					/Second ambient contribution/,
				);
				assert.equal(namespace.documentation.links.length, 2);
				assert(model.exports.some((item) => item.path.join(".") === "Tools.Settings"));
				assert(model.exports.some((item) => item.path.join(".") === "ToolsAgain.update"));
				validateReportConsumers(
					directory,
					new Map([["ambient-entry", report]]),
					"ambientModules",
					["ambient-modules"],
				);
			});

			it("rejects conflicting release levels across compound facets", async () => {
				const file = path.join(directory, "declarations/compound-merges.d.ts");
				const original = readFileSync(file, "utf8");
				try {
					writeFileSync(
						file,
						original.replace("Numeric factory.\n * @public", "Numeric factory.\n * @internal"),
					);
					const result = await analyzeAPIs(
						{
							packageName: "example",
							project: "tsconfig.json",
							entrypoints: [{ name: ".", path: "declarations/compound-merges.d.ts" }],
						},
						directory,
					);
					assert.equal(result.ok, false);
					assert.equal(
						result.diagnostics[0]?.code,
						DiagnosticCode.ClassificationReleaseConflict,
					);
				} finally {
					writeFileSync(file, original);
				}
			});

			it("combines namespace declarations and retains their complete nested exports", async () => {
				const analysis = getSuccessValue(
					await analyzeAPIs(
						{
							packageName: "example",
							project: "tsconfig.json",
							entrypoints: [{ name: ".", path: "declarations/merged-namespace.d.ts" }],
							customModifierTags: ["@selected", "@omit"],
						},
						directory,
					),
				);
				const model = getSuccessValue(
					decodeDependencyModel(analysis.generateModel(), "example"),
				);
				const services = model.apis.find((item) => item.name === "Services");
				assert(services !== undefined);
				assert.match(services.documentation.documentation ?? "", /Primary services/);
				assert.match(services.documentation.documentation ?? "", /Additional services/);
				assert.deepEqual(
					services.documentation.links.map((link) => link.reference),
					["Services.first", "Services.second"],
				);
				assert.notEqual(
					services.documentation.links[0]?.origin.start,
					services.documentation.links[1]?.origin.start,
				);
				const nested = model.apis.find((item) => item.name === "Nested");
				assert(nested !== undefined);
				assert.match(nested.documentation.documentation ?? "", /First nested description/);
				assert.match(nested.documentation.documentation ?? "", /Second nested description/);
				assert.equal(nested.metadata.releaseLevel, ReleaseLevel.Public);
				assert(
					model.exports.some(
						(entry) =>
							entry.path.join(".") === "Services.self" &&
							entry.referencePath?.join(".") === "Services",
					),
				);
				const report = getSuccessValue(
					analysis.generateReport(".", {
						name: "selected",
						releaseLevels: [ReleaseLevel.Public],
						requireTags: ["@selected"],
						excludeTags: ["@omit"],
					}),
				);
				assertSnapshot(report, "merged-namespace.selected.md");
			});

			it("rejects conflicting namespace metadata", async () => {
				const file = path.join(directory, "declarations/merged-namespace.d.ts");
				const original = readFileSync(file, "utf8");
				const cases = [
					{
						text: original.replace(
							"Additional services. See {@link Services.second}.\n * @public",
							"Additional services. See {@link Services.second}.\n * @beta",
						),
						code: DiagnosticCode.ClassificationReleaseConflict,
					},
					{
						text: original.replace("* @omit", "* @omit\n * @internal"),
						code: DiagnosticCode.ClassificationContainerMismatch,
					},
				];
				try {
					for (const example of cases) {
						assert.notEqual(example.text, original);
						writeFileSync(file, example.text);
						const result = await analyzeAPIs(
							{
								packageName: "example",
								project: "tsconfig.json",
								entrypoints: [{ name: ".", path: "declarations/merged-namespace.d.ts" }],
								customModifierTags: ["@selected", "@omit"],
							},
							directory,
						);
						assert.equal(result.ok, false, JSON.stringify(result));
						assert.equal(result.diagnostics[0]?.code, example.code, JSON.stringify(result));
					}
				} finally {
					writeFileSync(file, original);
				}
			});

			it("preserves type-only enum and constant exports through reports and models", async () => {
				const analysis = getSuccessValue(
					await analyzeAPIs(
						{
							packageName: "example",
							project: "tsconfig.json",
							entrypoints: [
								{ name: ".", path: "declarations/type-only-values.d.ts" },
								{ name: "./types", path: "declarations/type-only-forward.d.ts" },
							],
						},
						directory,
					),
				);
				const model = getSuccessValue(
					decodeDependencyModel(analysis.generateModel(), "example"),
				);
				const mixed = model.exports.filter(
					(entry) => entry.entrypoint === "." && entry.path.length === 1,
				);
				assert.deepEqual(
					mixed.map((entry) => [entry.path[0], entry.typeOnly]),
					[
						["Mode", true],
						["RecursiveItem", true],
						["TypeMode", true],
						["TypeOnlyBox", true],
						["ValueMode", false],
						["typeVersion", true],
						["valueVersion", false],
						["version", true],
					],
				);
				assert.deepEqual(
					mixed.find((entry) => entry.path[0] === "TypeMode")?.items,
					mixed.find((entry) => entry.path[0] === "ValueMode")?.items,
				);
				assert.deepEqual(
					mixed.find((entry) => entry.path[0] === "typeVersion")?.items,
					mixed.find((entry) => entry.path[0] === "valueVersion")?.items,
				);
				const forwarded = model.exports.filter(
					(entry) => entry.entrypoint === "./types" && entry.path.length === 1,
				);
				assert.equal(forwarded.length, 10);
				assert(forwarded.every((entry) => entry.typeOnly));
				const report = getSuccessValue(
					analysis.generateReport("./types", {
						name: "public",
						releaseLevels: [ReleaseLevel.Public],
					}),
				);
				assertSnapshot(report, "type-only-forward.public.md");
				const directReport = getSuccessValue(
					analysis.generateReport(".", {
						name: "public",
						releaseLevels: [ReleaseLevel.Public],
					}),
				);
				assertSnapshot(directReport, "type-only-values.public.md");

				validateReportConsumers(
					directory,
					new Map([
						["type-only-values", directReport],
						["type-only-forward", report],
					]),
				);
			});

			it("round-trips portable inherited, intersection, and utility member views", async () => {
				const analysis = await analyzeAPIs(
					{
						packageName: "example",
						project: "tsconfig.json",
						entrypoints: [{ name: ".", path: "declarations/api.d.ts" }],
						rules: { requireReleaseLevel: false },
					},
					directory,
				);
				assert.equal(analysis.ok, true, JSON.stringify(analysis));
				const encoded = analysis.value.generateModel();
				const model = getSuccessValue(decodeDependencyModel(encoded, "example"));
				for (const [name, types] of [
					["Derived", { value: "string", optional: "number | undefined", count: "number" }],
					["DerivedClass", { value: "string" }],
					[
						"Combined",
						{
							value: "string",
							optional: "number | undefined",
							count: "number",
							enabled: "boolean",
						},
					],
					["Selected", { value: "string", optional: "number | undefined" }],
					["Omitted", { value: "string", optional: "number | undefined", enabled: "boolean" }],
					["Frozen", { value: "string", optional: "number | undefined" }],
				] as const) {
					const declaration = model.graph.declarations.find((item) => item.name === name);
					assert(declaration !== undefined, name);
					assert.equal(declaration.memberView, "complete", name);
					assert.deepEqual(
						Object.fromEntries(
							declaration.members.map((member) => [member.name, member.type]),
						),
						types,
						name,
					);
					if (name === "Frozen") {
						assert(declaration.members.every((member) => member.readonly === true));
						assert.equal(
							declaration.members.find((member) => member.name === "optional")?.optional,
							true,
						);
					}
				}
				const callable = model.graph.declarations.find((item) => item.name === "convert");
				assert.equal(callable?.signatures.length, 2);
				assert.equal(
					callable?.signatures[0]?.effective.callSignatureText,
					"(value: string): string;",
				);
				assert.equal(
					callable?.signatures[1]?.effective.callSignatureText,
					"(value: number): number;",
				);
				assert.deepEqual(
					getSuccessValue(decodeDependencyModel(JSON.stringify(model), "example")),
					model,
				);
				assert.equal(analysis.value.generateModel(), encoded);
			});

			it("renders selected class and interface members after compiler disposal", () => {
				const configuration = getSuccessValue(
					resolveConfiguration(
						{
							packageName: "example",
							project: "tsconfig.json",
							entrypoints: [{ name: ".", path: "declarations/report-members.d.ts" }],
						},
						directory,
					),
				);
				const adapter = createNativeAdapter();
				try {
					const facts = getSuccessValue(adapter.analyze(configuration));
					adapter.close();
					const completed = getSuccessValue(
						completeAnalysis(
							createTestAnalysisContext(JSON.parse(JSON.stringify(facts)) as AnalysisFacts),
						),
					);
					const prepared = prepareReviewReport(completed);
					const report = getSuccessValue(
						createReviewReport(prepared, ".", {
							name: "public",
							releaseLevels: [ReleaseLevel.Public],
						}),
					);
					const text = renderReviewReport(report);
					assert.equal(
						facts.declarations.find((item) => item.name === "Settings")?.declarations.length,
						2,
					);
					assertSnapshot(text, "declarations.public.md");
					const encoded = encodeDependencyModel(completed);
					const model = getSuccessValue(decodeDependencyModel(encoded, "example"));
					assert.equal(model.version, 1);
					assert.equal(Object.isFrozen(model.apis), true);
					assert.equal(Object.isFrozen(model.graph.declarations), true);
					const store = model.graph.declarations.find(
						(declaration) => declaration.name === "Store",
					);
					assert(store !== undefined);
					assert.equal(store.container?.suffix, "<Value extends string = string>");
					assert.equal(store.members.find((member) => member.name === "value")?.type, "Value");
					assert.equal(
						store.members.find((member) => member.name === "lookup")?.signatures.length,
						2,
					);
					assert.deepEqual(
						getSuccessValue(decodeDependencyModel(JSON.stringify(model), "example")),
						model,
					);

					// Serialization must retain links to declarations and members, not just their printed comment text.
					const aliasDocumentation = model.apis.find(
						(item) => item.name === "ValueName",
					)?.documentation;
					assert(aliasDocumentation !== undefined);
					assert.deepEqual(
						aliasDocumentation.links.map((link) => link.reference),
						["Store", "Operations.visible", "Implementation.operation", "Store.value"],
					);
					assert.equal(
						model.exports.some(
							(entry) => entry.path.join(".") === "TypeImplementation" && entry.typeOnly,
						),
						true,
					);
					assert.equal(
						model.apis.some(
							(item) =>
								item.documentation.inheritedFrom.length > 0 &&
								item.documentation.sections?.some((section) => section.source !== item.id) ===
									true,
						),
						true,
					);
					assert.equal(decodeDependencyModel(encoded, "wrong-package").ok, false);
					assert.equal(
						decodeDependencyModel(JSON.stringify({ ...model, version: 99 }), "example").ok,
						false,
					);
					assert.equal(
						decodeDependencyModel(JSON.stringify({ ...model, apis: [] }), "example").ok,
						false,
					);
					assert.equal(decodeDependencyModel("not json", "example").ok, false);
					const completeReport = renderReviewReport(
						getSuccessValue(
							createReviewReport(prepared, ".", {
								name: "complete",
								releaseLevels: [ReleaseLevel.Public, ReleaseLevel.Beta, ReleaseLevel.Internal],
							}),
						),
					);
					assertSnapshot(completeReport, "declarations.complete.md");
				} finally {
					adapter.close();
				}
			});

			it("identifies effective members and retains independently selectable call signatures", () => {
				const configuration = resolveConfiguration(
					{
						packageName: "example",
						project: "tsconfig.json",
						entrypoints: [{ name: ".", path: "declarations/member-documentation.d.ts" }],
					},
					directory,
				);
				assert.equal(configuration.ok, true);
				const adapter = createNativeAdapter();
				try {
					const analysis = adapter.analyze(configuration.value);
					assert.equal(analysis.ok, true);
					adapter.close();
					const before = JSON.stringify(analysis.value);
					const facts = JSON.parse(before) as AnalysisFacts;
					const base = facts.declarations.find((entry) => entry.name === "DocumentedBase");
					const derived = facts.declarations.find(
						(entry) => entry.name === "DocumentedDerived",
					);
					assert(base !== undefined);
					assert(derived !== undefined);
					const baseForward = base.members.find((entry) => entry.name === "forward");
					const forward = derived.members.find((entry) => entry.name === "forward");
					assert(baseForward !== undefined);
					assert(forward !== undefined);

					// Shared source records do not imply the same effective API item or signature.
					assert.deepEqual(forward.declarations, baseForward.declarations);
					assert.notEqual(forward.id, baseForward.id);
					assert.notEqual(forward.signatures[0]?.id, baseForward.signatures[0]?.id);
					assert.equal(forward.signatures[0]?.functionTypeText, "(value: string) => string");
					assert.equal(baseForward.signatures[0]?.functionTypeText, "(value: Value) => Value");
					const forwardContext = forward.signatures[0]?.documentationContext;
					assert(forwardContext !== undefined);
					assert.deepEqual(forwardContext, baseForward.signatures[0]?.documentationContext);
					assert.equal(forwardContext.origin.file, "declarations/member-documentation.d.ts");
					assert.deepEqual(forwardContext.parameters, [
						{ name: "value", optional: false, rest: false },
					]);
					assert.equal(
						forward.signatures[0]?.documentation,
						"/** Inherited generic operation. @public */",
					);
					const parse = derived.members.find((entry) => entry.name === "parse");
					assert(parse !== undefined);
					assert.deepEqual(
						parse.signatures.map((signature) => signature.callSignatureText),
						["(value: string): string;", "(value: number): number;"],
					);
					const classified = classifyApiItems(
						createTestDocumentationContext(parse.signatures),
					);
					assert.equal(classified.ok, true);
					const selected = selectApiItems(classified.value, {
						name: "public",
						releaseLevels: [ReleaseLevel.Public],
					});
					assert.equal(selected.ok, true);
					assert.deepEqual(
						selected.value.items.map((entry) => entry.id),
						[parse.signatures[0]?.id],
					);
					const optional = derived.members.find((entry) => entry.name === "optionalOperation");
					assert(optional !== undefined);
					assert.equal(optional.optional, true);
					assert.equal(optional.signatures.length, 1);
					assert(optional.signatures[0]?.documentationContext !== undefined);
					assert.equal(
						optional.signatures[0]?.documentation,
						"/** Optional operation. @public */",
					);
					const callback = derived.members.find((entry) => entry.name === "callback");
					assert(callback !== undefined);
					assert.equal(callback.signatures.length, 1);

					// Property documentation must not be synthesized as documentation on its function-type node.
					assert.equal(callback.signatures[0]?.documentation, undefined);
					assert.equal(
						derived.members.find((entry) => entry.name === "value")?.signatures.length,
						0,
					);
					const identifiers = facts.declarations.flatMap((entry) =>
						entry.members.flatMap((member) => [
							member.id,
							...member.signatures.map((signature) => signature.id),
						]),
					);
					assert.equal(new Set(identifiers).size, identifiers.length);
					for (const declaration of analysis.value.declarations) {
						for (const member of declaration.members) {
							assert.equal(Object.isFrozen(member.signatures), true);
							assert.equal(member.signatures.every(Object.isFrozen), true);
							for (const signature of member.signatures) {
								if (signature.documentationContext !== undefined) {
									assert.equal(Object.isFrozen(signature.documentationContext), true);
								}
							}
						}
					}
					assert.equal(JSON.stringify(facts), before);
				} finally {
					adapter.close();
				}
			});

			it("retains original class and interface comments without resolving inheritance", () => {
				const configuration = resolveConfiguration(
					{
						packageName: "example",
						project: "tsconfig.json",
						entrypoints: [{ name: ".", path: "declarations/member-documentation.d.ts" }],
					},
					directory,
				);
				assert.equal(configuration.ok, true);
				const adapter = createNativeAdapter();
				try {
					const analysis = adapter.analyze(configuration.value);
					assert.equal(analysis.ok, true);
					adapter.close();

					// Source comments must remain available without live compiler handles or inherited-comment synthesis.
					for (const declaration of analysis.value.declarations) {
						assert.equal(Object.isFrozen(declaration.declarations), true);
						for (const member of declaration.members) {
							assert.equal(Object.isFrozen(member.declarations), true);
							for (const source of member.declarations) {
								assert.equal(Object.isFrozen(source), true);
								assert.equal(Object.hasOwn(source, "documentation"), true);
							}
						}
					}
					const serialized = JSON.stringify(analysis.value);
					const facts = JSON.parse(serialized) as AnalysisFacts;
					const derived = facts.declarations.find(
						(entry) => entry.name === "DocumentedDerived",
					);
					assert(derived !== undefined);
					assert.equal(
						derived.declarations[0]?.documentation,
						"/** Derived contract. @beta */",
					);
					const value = derived.members.find((entry) => entry.name === "value");
					assert(value !== undefined);
					assert.equal(value.type, "string");
					assert.equal(
						value.declarations[0]?.documentation,
						"/** Inherited value. @public */",
					);
					const base = facts.declarations.find((entry) => entry.name === "DocumentedBase");
					assert(base !== undefined);

					// Generic substitution changes the effective type, not the source location or original declaration text.
					assert.deepEqual(
						value.declarations,
						base.members.find((entry) => entry.name === "value")?.declarations,
					);

					// Unlike an absent comment, this explicitly empty local comment must suppress future
					// automatic inheritance. Extraction preserves it without resolving ancestor documentation.
					assert.equal(
						derived.members.find((entry) => entry.name === "convert")?.declarations[0]
							?.documentation,
						"/** */",
					);
					assert.equal(
						derived.members.find((entry) => entry.name === "tagOnly")?.declarations[0]
							?.documentation,
						"/** @public */",
					);
					for (const name of ["absent", "ordinary"]) {
						const member: (typeof derived.members)[number] | undefined = derived.members.find(
							(entry) => entry.name === name,
						);
						assert(member !== undefined);
						assert.equal(member.declarations[0]?.documentation, undefined);
					}
					assert.deepEqual(
						derived.members
							.find((entry) => entry.name === "parse")
							?.declarations.map((entry) => entry.documentation),
						["/** String overload. @public */", "/** Number overload. @internal */"],
					);
					const merged = facts.declarations.find((entry) => entry.name === "DocumentedMerged");
					assert(merged !== undefined);
					assert.deepEqual(
						merged.declarations.map((entry) => entry.documentation),
						["/** First declaration. @public */", "/** Second declaration. @beta */"],
					);
					assert.deepEqual(
						merged.members
							.find((entry) => entry.name === "shared")
							?.declarations.map((entry) => entry.documentation),
						[
							"/** First member declaration. @public */",
							"/** Second member declaration. @beta */",
						],
					);
					const classFact = facts.declarations.find(
						(entry) => entry.name === "DocumentedClass",
					);
					assert(classFact !== undefined);
					assert.equal(
						classFact.declarations[0]?.documentation,
						"/** Derived class. @public */",
					);
					assert.equal(
						classFact.members.find((entry) => entry.name === "value")?.declarations[0]
							?.documentation,
						"/** Inherited class value. @public */",
					);
					const override = classFact.members.find((entry) => entry.name === "convert");
					assert(override !== undefined);
					assert.equal(override.declarations.length, 1);

					// Raw facts preserve the absent local comment. Future automatic resolution should inherit
					// the compatible base method's documentation separately, without changing these source facts.
					assert.equal(override.declarations[0]?.documentation, undefined);
					assert.equal(override.declarations[0]?.kind, "MethodDeclaration");
					assert.equal(JSON.stringify(facts), serialized);
				} finally {
					adapter.close();
				}
			});

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
				assert(publicAlias !== undefined && typeAlias !== undefined);
				const resolved = resolveTarget(project.checker, publicAlias);
				assert.strictEqual(resolveTarget(project.checker, resolved), resolved);
				assert.equal(
					getDeclarationId(locations, resolved),
					getDeclarationId(locations, resolveTarget(project.checker, typeAlias)),
				);
				assert.equal(isTypeOnlyAlias(project.checker, publicAlias), false);
				assert.equal(isTypeOnlyAlias(project.checker, typeAlias), true);
				assert.equal(isTypeOnlyAlias(project.checker, typeAlias, new Set([typeAlias])), false);
				const source = project.program.getSourceFile(
					path.join(directory, "declarations/index.d.ts"),
				);
				assert(source !== undefined);
				const moduleSymbol = project.checker.getSymbolAtLocation(source);
				assert(moduleSymbol !== undefined);
				const seen = new Set<string>();
				assert.equal(
					isTypeOnlyExport(project.checker, locations, moduleSymbol, "TypeIdentity", seen),
					true,
				);
				assert.equal(
					isTypeOnlyExport(project.checker, locations, moduleSymbol, "PublicIdentity", seen),
					false,
				);
				assert.equal(seen.size, 0);
			});

			it("extracts specialized members, modifiers, and documented overloads without collection state", () => {
				const locations: LocationContext = {
					configuration: { packageName: "fixture", packageRoot: directory },
					packageCache: new Map(),
				};
				const derived = getExportTarget("Derived");
				const derivedType = project.checker.getDeclaredTypeOfSymbol(derived);
				assert.equal(
					extractMembers(project, locations, derivedType, "derived").find(
						(member) => member.name === "value",
					)?.type,
					"string",
				);
				const frozen = getExportTarget("Frozen");
				const frozenMembers = extractMembers(
					project,
					locations,
					project.checker.getDeclaredTypeOfSymbol(frozen),
					"frozen",
				);
				assert.equal(frozenMembers.find((member) => member.name === "value")?.readonly, true);
				assert.equal(
					frozenMembers.find((member) => member.name === "optional")?.optional,
					true,
				);
				const callable = getExportTarget("convert");
				const callableType = project.checker.getTypeOfSymbol(callable);
				assert(callableType !== undefined);
				const result = extractSignatures(project, callableType, "owner", locations);
				assert.equal(result.length, 2);
				assert.equal(new Set(result.map((signature) => signature.id)).size, 2);
				assert(result.every((signature) => signature.id.startsWith("owner:")));
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
				assert(source !== undefined);
				const moduleSymbol = project.checker.getSymbolAtLocation(source);
				assert(moduleSymbol !== undefined);
				const state: CollectionState = { declarations: new Map(), visiting: new Set() };
				const bindings = collectExports(project, locations, state, moduleSymbol);
				assert(bindings.every((binding) => state.declarations.has(binding.target)));
				assert.equal(state.visiting.size, 0);
				const id = collect(project, locations, state, moduleSymbol);
				const completed = state.declarations.get(id);
				assert(completed !== undefined);
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
			it("analyzes built declarations without exposing compiler state", async () => {
				const configuration = resolveConfiguration(
					{
						packageName: "fixture",
						project: "tsconfig.json",
						entrypoints: [{ name: ".", path: "declarations/index.d.ts" }],
					},
					directory,
				);
				assert(configuration.ok);
				const strict = await analyzeAPIs(configuration.value);
				assert.equal(strict.ok, false);
				assert.equal(strict.diagnostics[0]?.code, DiagnosticCode.ClassificationReleaseMissing);

				// This broad compiler fixture intentionally contains untagged members.
				const result = await analyzeAPIs({
					...configuration.value,
					rules: { requireReleaseLevel: false },
				});
				assert.equal(result.ok, true, JSON.stringify(result));
				assert.equal("close" in result.value, false);
				assert.equal("facts" in result.value, false);
				assert.equal(result.value.getStatistics().entrypoints, 1);
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
				assert(configuration.ok);
				const adapter = createNativeAdapter();
				try {
					const analysis = adapter.analyze(configuration.value);
					assert(analysis.ok, JSON.stringify(analysis));
					adapter.close();
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
						createTestDocumentationContext(
							comments.map((item) => ({ id: item.name, documentation: item.documentation })),
							{ rules: { requireReleaseLevel: false } },
						),
					);
					assert(metadata.ok, JSON.stringify(metadata));
					assert.equal(
						metadata.value.items.find((item) => item.id === "documented")?.releaseLevel,
						ReleaseLevel.Public,
					);
				} finally {
					adapter.close();
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
				assert(configuration.ok);
				const adapter = createNativeAdapter();
				try {
					const analysis = adapter.analyze(configuration.value);
					assert(analysis.ok, JSON.stringify(analysis));
					const overloads = analysis.value.declarations.find(
						(item) => item.name === "convert",
					)?.signatures;
					assert(overloads !== undefined);
					assert.equal(overloads.length, 2);
					adapter.close();
					const before = JSON.stringify(analysis.value);
					const metadata = classifyApiItems(createTestDocumentationContext(overloads));
					assert(metadata.ok, JSON.stringify(metadata));
					const publicView = selectApiItems(metadata.value, {
						name: "public",
						releaseLevels: [ReleaseLevel.Public],
					});
					assert(publicView.ok);
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
					assert(complete.ok);
					assert.equal(complete.value.items.length, 2);
					assert.equal(JSON.stringify(analysis.value), before);
				} finally {
					adapter.close();
				}
			});
		});

		describe("Documentation link binding", () => {
			it("validates original-scope links after session closure without selecting their targets", () => {
				const configuration = resolveConfiguration(
					{
						packageName: "example",
						project: "tsconfig.json",
						entrypoints: [
							{ name: ".", path: "declarations/documentation-link-policy-reexport.d.ts" },
						],
					},
					directory,
				);
				assert.equal(configuration.ok, true);
				const adapter = createNativeAdapter();
				try {
					const analysis = adapter.analyze(configuration.value);
					assert.equal(analysis.ok, true);
					adapter.close();
					const facts = analysis.value;
					const before = JSON.stringify(facts);
					const linked = facts.declarations.find((entry) => entry.name === "linked");

					// The entrypoint also exports an internal base; links must use the original module's beta base.
					const base = facts.declarations.find(
						(entry) =>
							entry.name === "base" &&
							entry.declarations[0]?.file === "declarations/documentation-link-policy.d.ts",
					);
					const hidden = facts.declarations.find((entry) => entry.name === "hidden");
					assert(linked !== undefined);
					assert(base !== undefined);
					assert(hidden !== undefined);
					const signature = linked.signatures[0];
					assert(signature?.documentationContext !== undefined);
					const classified = classifyApiItems(
						createTestDocumentationContext(
							facts.declarations.flatMap((entry) => entry.signatures),
						),
					);
					assert.equal(classified.ok, true);
					const selected = selectApiItems(classified.value, {
						name: "public",
						releaseLevels: [ReleaseLevel.Public],
					});
					assert.equal(selected.ok, true);
					assert.deepEqual(
						selected.value.items.map((entry) => entry.id),
						[signature.id],
					);

					// Link validation needs the unselected beta targets, so pass full classification rather than selected items.
					const result = bindDocumentationLinks(createTestAnalysisContext(facts, {}));
					assert.equal(result.ok, true);

					// Five occurrences belong to linked; the sixth is base's back-reference to linked.
					assert.equal(result.value.length, 6);
					assert.deepEqual(
						result.value.filter((entry) => entry.source === signature.id),
						[
							{ reference: "base", target: base.id },
							{ reference: "alias", target: base.id },
							{ reference: "hidden", target: hidden.id },
							{ reference: "linked", target: linked.id },
							{ reference: "base", target: base.id },
						].map((entry, linkIndex) => ({
							...entry,
							source: signature.id,
							targetSignature: facts.declarations.find(
								(declaration) => declaration.id === entry.target,
							)?.signatures[0]?.id,
							linkIndex,
							origin: signature.documentationContext?.origin,
						})),
					);
					assert.equal(
						signature.documentationContext.origin.file,
						"declarations/documentation-link-policy.d.ts",
					);
					assert.equal(
						facts.surfaces[0]?.exports.some((entry) => entry.target === hidden.id),
						false,
					);
					assert.equal(Object.isFrozen(result.value), true);
					assert.equal(
						result.value.every(
							(entry) => Object.isFrozen(entry) && Object.isFrozen(entry.origin),
						),
						true,
					);

					// Rebinding deserialized facts must not depend on compiler handles or object identity.
					assert.deepEqual(
						bindDocumentationLinks(
							createTestAnalysisContext(JSON.parse(before) as AnalysisFacts, {}),
						),
						result,
					);
					assert.equal(JSON.stringify(facts), before);
				} finally {
					adapter.close();
				}
			});
		});

		describe("Explicit documentation inheritance", () => {
			it("resolves inherited links in their original scope after session closure", () => {
				const configuration = resolveConfiguration(
					{
						packageName: "example",
						project: "tsconfig.json",
						entrypoints: [{ name: ".", path: "declarations/inheritance-links-reexport.d.ts" }],
					},
					directory,
				);
				assert.equal(configuration.ok, true);
				const adapter = createNativeAdapter();
				try {
					const analysis = adapter.analyze(configuration.value);
					assert.equal(analysis.ok, true);

					// Close before serialization so every subsequent operation uses detached data only.
					adapter.close();
					const before = JSON.stringify(analysis.value);
					const facts = JSON.parse(before) as AnalysisFacts;
					const inputs = facts.declarations.flatMap((entry) =>
						entry.signatures.map((signature) => {
							assert(signature.documentationContext !== undefined);
							return {
								id: signature.id,
								documentation: signature.documentation,
								packageName: signature.documentationContext.origin.packageName,
							};
						}),
					);
					const classification = classifyApiItems(createTestDocumentationContext(inputs));
					assert.equal(classification.ok, true);
					const inheritance = bindDocumentationReferences(
						createTestAnalysisContext(facts, {}),
					);
					assert.equal(inheritance.ok, true, JSON.stringify(inheritance));
					const links = bindDocumentationLinks(createTestAnalysisContext(facts, {}));
					assert.equal(links.ok, true);

					// Only base contains a local API link; middle and derived receive it through inheritance.
					assert.equal(links.value.length, 1);
					const result = resolveDocumentation(
						createTestDocumentationContext(inputs, {
							linkValidation: {
								bindings: links.value,
								metadata: new Map(classification.value.items.map((item) => [item.id, item])),
							},
						}),
						inheritance.value,
						{
							linkValidation: {
								bindings: links.value,
								metadata: new Map(classification.value.items.map((item) => [item.id, item])),
							},
						},
					);
					assert.equal(result.ok, true);
					const receiver = facts.declarations.find((entry) => entry.name === "derived");
					assert(receiver !== undefined);
					const derived = result.value.find(
						(entry) => entry.id === receiver.signatures[0]?.id,
					);
					assert(derived?.documentation !== undefined);

					// Share the pure resolver's expected comment to check compiler-backed and synthetic inputs agree.
					assertSnapshot(derived.documentation, "documentation.inherited-link.txt");
					assert.equal(derived.inheritedFrom.length, 2);

					// Inheritance preserves the original occurrence, not a new binding in derived's scope.
					assert.deepEqual(derived.links, links.value);
					assert.equal(derived.links[0]?.origin.file, "declarations/inheritance-links.d.ts");

					// A same-named internal target exists in the receiving module and must not replace this beta target.
					const originalTarget = facts.declarations.find(
						(entry) =>
							entry.name === "target" &&
							entry.declarations[0]?.file === "declarations/inheritance-links.d.ts",
					);
					assert(originalTarget !== undefined);
					assert.equal(derived.links[0]?.target, originalTarget.id);

					// The public view excludes both ancestors and the link target, but they still supply resolution data.
					const selection = { name: "public", releaseLevels: [ReleaseLevel.Public] };
					const selected = selectApiItems(classification.value, selection);
					assert.equal(selected.ok, true);
					assert.deepEqual(
						selected.value.items.map((entry) => entry.id),
						[derived.id],
					);
					assert.deepEqual(
						classifyApiItems(createTestDocumentationContext(inputs)),
						classification,
					);
					assert.equal(Object.isFrozen(derived.links[0]?.origin), true);
					assert.equal(JSON.stringify(facts), before);
				} finally {
					adapter.close();
				}
			});

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
				const adapter = createNativeAdapter();
				try {
					const analysis = adapter.analyze(configuration.value);
					assert.equal(analysis.ok, true);
					adapter.close();
					const before = JSON.stringify(analysis.value);
					const linked = analysis.value.declarations.find((entry) => entry.name === "linked");
					assert(linked !== undefined);
					const signature = linked.signatures[0];
					assert(signature?.documentationContext !== undefined);
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
					const exportedBase = analysis.value.surfaces[0]?.exports.find(
						(entry) => entry.name === "base",
					);
					const overloaded = analysis.value.declarations.find(
						(entry) => entry.name === "overloaded",
					);
					assert(localBase !== undefined);
					assert(importedBase !== undefined);
					assert(hidden !== undefined);
					assert(exportedBase !== undefined);
					assert.notEqual(exportedBase.target, localBase.id);
					assert(overloaded !== undefined);
					assert.deepEqual(context.links, [
						{ reference: "base", status: "resolved", target: localBase.id },
						{ reference: "imported", status: "resolved", target: importedBase.id },
						{ reference: "alias", status: "resolved", target: localBase.id },
						{ reference: "hidden", status: "resolved", target: hidden.id },
						{ reference: "overloaded", status: "resolved", target: overloaded.id },
						{ reference: "missing", status: "not-found" },
						{ reference: "example#base", status: "resolved", target: exportedBase.target },
						{ reference: "(base:1)", status: "resolved", target: localBase.id },
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
					assert.throws(
						() =>
							resolveDocumentation(
								createTestDocumentationContext(
									[
										{
											id: signature.id,
											packageName: context.origin.packageName,
											documentation: signature.documentation,
										},
									],
									{},
								),
								[],
							),
						{
							name: "AssertionError",
							message: "Comments with API links must have original link validation inputs.",
						},
					);
					assert.equal(JSON.stringify(analysis.value), before);
				} finally {
					adapter.close();
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
				assert(configuration.ok);
				const adapter = createNativeAdapter();
				try {
					const analysis = adapter.analyze(configuration.value);
					assert(analysis.ok, JSON.stringify(analysis));
					adapter.close();
					const options = { customModifierTags: ["@sourceOnly", "@localOnly"] };
					const before = JSON.stringify({ facts: analysis.value, options });
					const inputs = analysis.value.declarations.flatMap((declaration) =>
						declaration.signatures.map((signature) => {
							assert(signature.documentationContext !== undefined);
							return {
								id: signature.id,
								documentation: signature.documentation,
								packageName: signature.documentationContext.origin.packageName,
							};
						}),
					);
					const classified = classifyApiItems(createTestDocumentationContext(inputs, options));
					assert(classified.ok);
					const selection = {
						name: "public",
						releaseLevels: [ReleaseLevel.Public],
						requireTags: ["@localOnly"],
					};
					const selected = selectApiItems(classified.value, selection);
					assert(selected.ok);
					assert.equal(selected.value.items.length, 1);
					const bindings = bindDocumentationReferences(
						createTestAnalysisContext(analysis.value, options),
					);
					assert(bindings.ok, JSON.stringify(bindings));
					assert.equal(bindings.value.length, 1);
					const result = resolveDocumentation(
						createTestDocumentationContext(inputs, options),
						bindings.value,
					);
					assert(result.ok);
					const derived = result.value.find(
						(entry) => entry.id === selected.value.items[0]?.id,
					);
					assert(derived?.documentation !== undefined);
					assert.notEqual(derived.documentation, "");
					assert(derived.documentation.includes("Summary."));
					assert(derived.documentation.includes("@localOnly"));
					assert.equal(derived.documentation.includes("@sourceOnly"), false);
					assert.equal(derived.documentation.includes("@internal"), false);
					assert.deepEqual(derived.inheritedFrom, [bindings.value[0]?.target]);
					assert.deepEqual(
						classifyApiItems(createTestDocumentationContext(inputs, options)),
						classified,
					);
					assert.deepEqual(selectApiItems(classified.value, selection), selected);
					for (const customModifierTags of [[], ["@localOnly"], ["@sourceOnly"]]) {
						const unconfigured = bindDocumentationReferences(
							createTestAnalysisContext(analysis.value, { customModifierTags }),
						);
						assert(!unconfigured.ok);
						assert.equal(unconfigured.diagnostics[0]?.code, DiagnosticCode.DocumentationTsdoc);
					}
					assert.equal(JSON.stringify({ facts: analysis.value, options }), before);
					assert.equal(Object.isFrozen(options.customModifierTags), false);
					assert(Object.isFrozen(result.value));
					assert(Object.isFrozen(bindings.value));
				} finally {
					adapter.close();
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
				assert(configuration.ok);
				const adapter = createNativeAdapter();
				try {
					const analysis = adapter.analyze(configuration.value);
					assert(analysis.ok, JSON.stringify(analysis));
					adapter.close();
					const before = JSON.stringify(analysis.value);
					const base = analysis.value.declarations.find(
						(declaration) => declaration.name === "base",
					);
					const derived = analysis.value.declarations.find(
						(declaration) => declaration.name === "derived",
					);
					assert(base?.signatures[0] !== undefined);
					assert(derived?.signatures[0] !== undefined);
					const inputs = [base, derived].flatMap((declaration) => {
						const origin = declaration.declarations[0];
						assert(origin !== undefined);
						return declaration.signatures.map((signature) => ({
							id: signature.id,
							documentation: signature.documentation,
							packageName: origin.packageName,
						}));
					});
					const classification = classifyApiItems(createTestDocumentationContext(inputs));
					assert(classification.ok);
					const bindings = bindDocumentationReferences(
						createTestAnalysisContext(analysis.value, {}),
					);
					assert(bindings.ok, JSON.stringify(bindings));
					assert.deepEqual(bindings.value, [
						{
							source: derived.signatures[0].id,
							reference: "base",
							target: base.signatures[0].id,
						},
					]);
					const result = resolveDocumentation(
						createTestDocumentationContext(inputs, {}),
						bindings.value,
					);
					assert(result.ok, JSON.stringify(result));
					const effective = result.value.find(
						(entry) => entry.id === derived.signatures[0]?.id,
					);
					assert(effective?.documentation !== undefined);
					assert.notEqual(effective.documentation, "");
					assertSnapshot(effective.documentation, "documentation.direct.txt");
					assert(effective.documentation.includes("Converts a value."));
					assert.equal(effective.documentation.includes("@internal"), false);
					assert.equal(effective.documentation.includes("@inheritDoc"), false);
					assert.deepEqual(effective.inheritedFrom, [base.signatures[0].id]);
					assert.deepEqual(
						classifyApiItems(createTestDocumentationContext(inputs)),
						classification,
					);
					assert.equal(JSON.stringify(analysis.value), before);
				} finally {
					adapter.close();
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
					assert(configuration.ok);
					const adapter = createNativeAdapter();
					try {
						const analysis = adapter.analyze(configuration.value);
						assert(analysis.ok, JSON.stringify(analysis));
						adapter.close();
						const context = createTestAnalysisContext(analysis.value, {});
						const result = bindDocumentationReferences(context);
						if (fixture.expected === undefined) {
							assert(result.ok, JSON.stringify(result));
							assert.equal(result.value.length, fixture.name === "selector" ? 4 : 1);
							assert.equal(
								result.value.some((binding) => binding.reference === fixture.reference),
								true,
							);
							assert(Object.isFrozen(result.value));
							if (fixture.name === "selector") {
								const detached = JSON.parse(JSON.stringify(analysis.value)) as AnalysisFacts;
								assert.deepEqual(
									bindDocumentationReferences(createTestAnalysisContext(detached, {})),
									result,
								);
								const base = analysis.value.declarations.find(
									(entry) => entry.name === "base",
								);
								const derived = analysis.value.declarations.find(
									(entry) => entry.name === "derived",
								);
								assert(base !== undefined);
								assert(derived !== undefined);
								assert.equal(
									result.value.find((binding) => binding.reference === fixture.reference)
										?.target,
									base.signatures[1]?.id,
								);
								const methodTarget = analysis.value.declarations.find(
									(entry) => entry.name === "operation" && entry.signatures.length === 2,
								);
								const effectiveRedirect = analysis.value.declarations
									.find((entry) => entry.name === "MethodRedirect")
									?.members.find((member) => member.name === "operation")?.signatures[0];
								assert(methodTarget?.signatures[1] !== undefined);
								assert(effectiveRedirect !== undefined);
								assert.equal(
									result.value.find((binding) => binding.source === effectiveRedirect.id)
										?.target,
									methodTarget.signatures[1].id,
								);
								const links = bindDocumentationLinks(context);
								assert.equal(links.ok, true);
								const resolved = resolveDocumentation(context, result.value, {
									linkValidation: {
										bindings: links.value,
										metadata: context.metadata,
									},
								});
								assert.equal(resolved.ok, true);
								const fromMethod = analysis.value.declarations.find(
									(entry) => entry.name === "fromMethod",
								);
								assert(fromMethod !== undefined);
								const inheritedMethod = resolved.value.find(
									(entry) => entry.id === fromMethod.signatures[0]?.id,
								);
								assert(inheritedMethod !== undefined);
								assert.equal(inheritedMethod.documentation?.includes("String method."), true);
								assert.equal(inheritedMethod.inheritedFrom.length, 2);
								assert.equal(inheritedMethod.links.length, 1);
								assert.deepEqual(
									inheritedMethod.links,
									links.value.filter((link) => link.source === methodTarget.signatures[1]?.id),
								);
								const effectiveMethod = resolved.value.find(
									(entry) => entry.id === effectiveRedirect.id,
								);
								assert(effectiveMethod !== undefined);
								assert.equal(effectiveMethod.documentation?.includes("String method."), true);
								assert.deepEqual(effectiveMethod.inheritedFrom, [
									methodTarget.signatures[1].id,
								]);
								assert.deepEqual(effectiveMethod.links, inheritedMethod.links);
								assert.match(
									resolved.value.find((entry) => entry.id === derived.signatures[0]?.id)
										?.documentation ?? "",
									/String overload\./,
								);
							}
						} else {
							assert(!result.ok, fixture.name);
							assert.equal(result.diagnostics[0]?.code, fixture.expected, fixture.name);
							assert.equal("value" in result, false);
						}
					} finally {
						adapter.close();
					}
				}
			});

			it("rejects ambiguous or unsupported method paths without guessing a target", () => {
				const configuration = resolveConfiguration(
					{
						packageName: "example",
						project: "tsconfig.json",
						entrypoints: [{ name: ".", path: "declarations/binding-selector.d.ts" }],
					},
					directory,
				);
				assert.equal(configuration.ok, true);
				const source = project.program.getSourceFile(
					path.join(directory, "declarations/binding-selector.d.ts"),
				);
				assert(source !== undefined);
				for (const [reference, status] of [
					["MethodSource.(operation:2)", "resolved"],
					["MethodSource.missing", "not-found"],
					["AmbiguousMethodScope.operation", "unsupported"],
					["MethodSource.(operation:static)", "not-found"],
					["(MethodSource:1).operation", "unsupported"],
				] as const) {
					const parsed = new TSDocParser().parseString(`/** {@inheritDoc ${reference}} */`);
					assert.equal(parsed.log.messages.length, 0, reference);
					const state: CollectionState = { declarations: new Map(), visiting: new Set() };
					const lookup = lookupReference(
						project,
						{ configuration: configuration.value, packageCache: new Map() },
						state,
						source,
						source,
						parsed.docComment.inheritDocTag?.declarationReference,
						true,
					);
					assert.equal(lookup.status, status, reference);
					if (lookup.status === "resolved") {
						assert.equal(state.declarations.get(lookup.target)?.name, "operation");
					} else {
						assert.equal("target" in lookup, false);
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
					assert(configuration.ok);
					const adapter = createNativeAdapter();
					try {
						const analysis = adapter.analyze(configuration.value);
						assert(analysis.ok, JSON.stringify(analysis));
						adapter.close();
						const detached = JSON.parse(JSON.stringify(analysis.value)) as AnalysisFacts;
						const bindings = bindDocumentationReferences(
							createTestAnalysisContext(detached, {}),
						);
						assert(bindings.ok, JSON.stringify(bindings));
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
						assert(targetDeclaration?.signatures[0] !== undefined);
						assert.equal(bindings.value[0]?.target, targetDeclaration.signatures[0].id);
						assert.equal(
							analysis.value.surfaces[0]?.exports.some(
								(entry) => entry.target === targetDeclaration.id,
							),
							false,
						);
						assert.deepEqual(
							bindDocumentationReferences(
								createTestAnalysisContext(
									{
										...analysis.value,
										declarations: [...analysis.value.declarations].reverse(),
									},
									{},
								),
							),
							bindings,
						);
					} finally {
						adapter.close();
					}
				}
			});
		});

		describe("Review report generation", () => {
			it("renders resolved inheritance after session closure against shared report snapshots", () => {
				for (const [fixture, snapshotName, documented] of [
					["report-inheritance", "functions.inherited.md", true],
					["report-inheritance-empty", "functions.inherited-empty.md", false],
				] as const) {
					const configuration = resolveConfiguration(
						{
							packageName: "example",
							project: "tsconfig.json",
							entrypoints: [{ name: ".", path: `declarations/${fixture}.d.ts` }],
						},
						directory,
					);
					assert.equal(configuration.ok, true);
					const adapter = createNativeAdapter();
					try {
						const analysis = adapter.analyze(configuration.value);
						assert.equal(analysis.ok, true);
						adapter.close();

						// Report resolution must work from plain serialized facts without a live compiler or caches.
						const before = JSON.stringify(analysis.value);
						const facts = JSON.parse(before) as AnalysisFacts;
						const classified = classifyApiItems(
							createTestDocumentationContext(
								facts.declarations.flatMap((entry) => entry.signatures),
							),
						);
						assert.equal(classified.ok, true);
						const selected = selectApiItems(classified.value, {
							name: "public",
							releaseLevels: [ReleaseLevel.Public],
						});
						assert.equal(selected.ok, true);
						assert.equal(selected.value.items.length, 1);
						const report = createReviewReport(
							prepareReviewReport(
								getSuccessValue(completeAnalysis(createTestAnalysisContext(facts, {}))),
							),
							".",
							{
								name: "public",
								releaseLevels: [ReleaseLevel.Public],
							},
						);
						assert.equal(report.ok, true, JSON.stringify(report));
						assert.equal(report.value.exports[0]?.signatures[0]?.documented, documented);

						// The pure and compiler-backed paths must agree on complete output, including local-only tags.
						assertSnapshot(
							renderReviewReport(report.value, { additionalTags: ["@deprecated"] }),
							snapshotName,
						);
						assert.deepEqual(
							classifyApiItems(
								createTestDocumentationContext(
									facts.declarations.flatMap((entry) => entry.signatures),
								),
							),
							classified,
						);
						assert.equal(JSON.stringify(facts), before);
						assert.equal(Object.isFrozen(report.value.exports), true);
					} finally {
						adapter.close();
					}
				}
			});

			it("renders detached compiler facts against shared report snapshots", () => {
				const configuration = resolveConfiguration(
					{
						packageName: "example",
						project: "tsconfig.json",
						entrypoints: [{ name: "./functions", path: "declarations/reportFunctions.d.ts" }],
					},
					directory,
				);
				assert(configuration.ok);
				const adapter = createNativeAdapter();
				try {
					const analysis = adapter.analyze(configuration.value);
					assert(analysis.ok, JSON.stringify(analysis));
					const classification = classifyApiItems(
						createTestDocumentationContext(
							analysis.value.declarations.flatMap((item) => item.signatures),
							{ customModifierTags: ["@partner"] },
						),
					);
					assert(classification.ok, JSON.stringify(classification));
					adapter.close();
					const before = JSON.stringify(analysis.value);
					for (const [name, releaseLevels] of [
						["public", [ReleaseLevel.Public]],
						["complete", [ReleaseLevel.Public, ReleaseLevel.Internal]],
					] as const) {
						const selection = selectApiItems(classification.value, { name, releaseLevels });
						assert(selection.ok);
						const report = createReviewReport(
							prepareReviewReport(
								getSuccessValue(
									completeAnalysis(
										createTestAnalysisContext(analysis.value, {
											customModifierTags: ["@partner"],
										}),
									),
								),
							),
							"./functions",
							{ name, releaseLevels },
						);
						assert(report.ok, JSON.stringify(report));
						const text = renderReviewReport(report.value);
						const expected = assertSnapshot(text, `functions.${name}.md`);
						assert(compareReviewBaseline(text, expected).ok);
					}
					assert.equal(JSON.stringify(analysis.value), before);
				} finally {
					adapter.close();
				}
			});
		});

		// TODO (Stage 0 declaration-generation gate, Stage 4, W5): Re-enable when the selected
		// compiler API supports retained-program emit, or replace with tests of the approved generation path.
		// TS7 7.0.2 exposes neither method. Skipping this probe does not remove the rollup requirement.
		it.skip("retained Program exposes declaration emission", () => {
			assert(
				"emit" in project.program || "getDeclarationEmit" in project.program,
				"TS7 7.0.2 has no public Program declaration emit method; a generation strategy needs review",
			);
		});
	});
}

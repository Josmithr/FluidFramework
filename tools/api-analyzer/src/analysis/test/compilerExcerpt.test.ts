/* eslint-disable no-bitwise -- TypeScript exposes symbol flags as bit masks. */

import assert from "node:assert/strict";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "mocha";
import { SyntaxKind } from "typescript/unstable/ast";
import { isCallSignatureDeclaration } from "typescript/unstable/ast/is";
import {
	API,
	NodeBuilderFlags,
	SignatureKind,
	SymbolFlags,
	type Project,
	type Symbol as CompilerSymbol,
} from "typescript/unstable/sync";
import {
	createSourceExcerpt,
	printNativeExcerpt,
	printSignatureText,
} from "../compilerExcerpt.js";

/**
 * Supplies test identities without importing adapter ownership or declaration-collection code.
 * @param symbol - Resolved compiler symbol supplied by the excerpt boundary.
 * @returns A source-qualified identity for fixture APIs, or undefined for compiler-library symbols.
 */
function getReferenceTarget(symbol: CompilerSymbol): string | undefined {
	assert.equal(symbol.flags & (SymbolFlags.Alias | SymbolFlags.TypeParameter), 0);
	const source = symbol.declarations[0];
	return source === undefined || path.basename(source.path).startsWith("lib.")
		? undefined
		: `${path.basename(source.path)}:${symbol.name}`;
}

describe("Compiler excerpt boundary", () => {
	let directory: string;
	let api: API;
	let project: Project;

	before(() => {
		directory = mkdtempSync(path.join(tmpdir(), "compiler-excerpt-"));
		for (const file of ["excerpt-base.ts", "excerpt-references.ts", "signature-views.ts"]) {
			cpSync(
				new URL(`../../../src/test/fixtures/native/${file}`, import.meta.url),
				path.join(directory, file),
			);
		}
		const configuration = path.join(directory, "tsconfig.json");
		writeFileSync(
			configuration,
			JSON.stringify({
				compilerOptions: { strict: true, types: [], noEmit: true },
				include: ["*.ts"],
			}),
		);
		api = new API({ cwd: directory });
		const opened = api
			.updateSnapshot({ openProjects: [configuration] })
			.getProject(configuration);
		assert(opened !== undefined);
		project = opened;
	});

	after(() => {
		api?.close();
		rmSync(directory, { recursive: true, force: true });
	});

	it("prints nested substituted property types independently of adapter collection", () => {
		const source = project.program.getSourceFile(
			path.join(directory, "excerpt-references.ts"),
		);
		assert(source !== undefined);
		const module = project.checker.getSymbolAtLocation(source);
		assert(module !== undefined);
		const receiver = project.checker
			.getExportsOfModule(module)
			.find((symbol) => symbol.name === "Receiver");
		assert(receiver !== undefined);
		const property = project.checker.getPropertyOfType(
			project.checker.getDeclaredTypeOfSymbol(receiver),
			"boxed",
		);
		assert(property !== undefined);
		const type = project.checker.getTypeOfSymbol(property);
		assert(type !== undefined);
		const scope = property.declarations[0]?.resolve();
		assert(scope !== undefined);

		// Print in the base member's scope, where the receiver's substituted Value has no local import.
		const node = project.checker.typeToTypeNode(
			type,
			scope,
			NodeBuilderFlags.NoTruncation | NodeBuilderFlags.UseOnlyExternalAliasing,
		);
		assert(node !== undefined);
		const types = Object.freeze([type]);
		const text = project.emitter.printNode(node).trim();
		const excerpt = printNativeExcerpt(project, node, scope, types, getReferenceTarget);
		assert.deepEqual(
			excerpt.tokens
				.filter((token) => token.kind === "Reference")
				.map((token) => token.target),
			["excerpt-references.ts:Value"],
		);
		assert.equal(excerpt.tokens.map((token) => token.text).join(""), text);
		assert.deepEqual(
			printNativeExcerpt(project, node, scope, types, getReferenceTarget),
			excerpt,
		);
		const excluded = printNativeExcerpt(project, node, scope, types, () => undefined);
		assert.equal(excluded.tokens.map((token) => token.text).join(""), text);
		assert.equal(
			excluded.tokens.some((token) => token.kind === "Reference"),
			false,
		);
	});

	for (const name of ["aliased", "imported", "shadow"] as const) {
		it(`prints ${name} with injected reference identities and no input mutation`, () => {
			const source = project.program.getSourceFile(
				path.join(directory, "excerpt-references.ts"),
			);
			assert(source !== undefined);
			const module = project.checker.getSymbolAtLocation(source);
			assert(module !== undefined);
			const symbol = project.checker
				.getExportsOfModule(module)
				.find((item) => item.name === name);
			assert(symbol !== undefined);
			const type = project.checker.getTypeOfSymbol(symbol);
			assert(type !== undefined);
			const signature = project.checker.getSignaturesOfType(type, SignatureKind.Call)[0];
			assert(signature !== undefined);
			const original = signature.declaration?.resolve();
			assert(original !== undefined);
			const node = project.checker.signatureToSignatureDeclaration(
				signature,
				SyntaxKind.CallSignature,
				source,
				NodeBuilderFlags.UseOnlyExternalAliasing,
			);
			assert(node !== undefined && isCallSignatureDeclaration(node));
			const beforeText = project.emitter.printNode(node);
			const beforeSource = original.getFullText();
			const rendered = printSignatureText(
				project,
				node,
				original,
				signature,
				getReferenceTarget,
			);

			// The shadow case links only its constraint; uses of the local type parameter must remain content.
			assert.deepEqual(
				rendered.callSignatureExcerpt?.tokens
					.filter((token) => token.kind === "Reference")
					.map((token) => token.target),
				Array.from({ length: name === "shadow" ? 1 : 2 }, () => "signature-views.ts:View"),
			);
			assert.equal(
				rendered.callSignatureExcerpt?.tokens.map((token) => token.text).join(""),
				rendered.callSignatureText,
			);
			assert.equal(
				rendered.functionTypeExcerpt?.tokens.map((token) => token.text).join(""),
				rendered.functionTypeText,
			);
			assert.deepEqual(
				printSignatureText(project, node, original, signature, getReferenceTarget),
				rendered,
			);

			// The caller can exclude a target without changing the printed signature or the input tree.
			const excluded = printSignatureText(project, node, original, signature, () => undefined);
			assert.equal(excluded.callSignatureText, rendered.callSignatureText);
			assert.equal(
				excluded.callSignatureExcerpt?.tokens.some((token) => token.kind === "Reference"),
				false,
			);
			const captured = createSourceExcerpt(project, original, getReferenceTarget);
			assert.equal(
				createSourceExcerpt(project, original, () => undefined).tokens.some(
					(token) => token.kind === "Reference",
				),
				false,
			);
			assert.equal(captured.tokens.map((token) => token.text).join(""), beforeSource);
			assert.deepEqual(
				captured.tokens
					.filter((token) => token.kind === "Reference")
					.map((token) => token.target),
				Array.from({ length: name === "shadow" ? 1 : 2 }, () => "signature-views.ts:View"),
			);
			assert.equal(project.emitter.printNode(node), beforeText);
			assert.equal(original.getFullText(), beforeSource);
		});
	}
});

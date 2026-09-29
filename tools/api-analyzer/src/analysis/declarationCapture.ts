/* eslint-disable no-bitwise -- TypeScript exposes symbol flags as bit masks. */

import assert from "node:assert/strict";
import { DocExcerpt, type DocNode, type TSDocParser } from "@microsoft/tsdoc";
import {
	SyntaxKind,
	createScanner,
	getLeadingCommentRanges,
	type Node,
	type SourceFile,
} from "typescript/unstable/ast";
import {
	isIdentifier,
	isVariableDeclaration,
	isVariableStatement,
	isImportDeclaration,
	isStringLiteral,
	isNamedImports,
	isQualifiedName,
	isPropertyAccessExpression,
	isImportTypeNode,
} from "typescript/unstable/ast/is";
import {
	SymbolFlags,
	type Project,
	type Symbol as CompilerSymbol,
} from "typescript/unstable/sync";
import type { DeclarationFact, ApiItemId, ImportFact } from "../analysis-types/facts.js";
import type {
	DeclarationSyntax,
	DeclarationExportFact,
	DeclarationSyntaxFact,
	DeclarationSyntaxFacts,
	DocumentationSyntax,
	SyntaxRange,
} from "../analysis-types/declarationSyntax.js";
import { createCodeExcerpt } from "./structuredExcerpt.js";

/**
 * Original statement and its compiler symbol, used only during capture.
 */
interface DeclarationInput {
	/**
	 * Original statement syntax.
	 */
	readonly node: Node;

	/**
	 * Selected variable binding within the original statement.
	 * @defaultValue Omitted for non-variable statements.
	 */
	readonly variable?: Node;

	/**
	 * Declaration symbol before output-name allocation.
	 */
	readonly symbol: CompilerSymbol;

	/**
	 * Original source containing the statement.
	 */
	readonly source: SourceFile;
}

/**
 * Detached identity and preferred name for a bound compiler symbol.
 */
interface DeclarationName {
	/**
	 * Stable identity within this analysis.
	 */
	readonly id: ApiItemId;

	/**
	 * Original name, `default` for anonymous declarations, or empty for source-file modules.
	 */
	readonly name: string;
}

/**
 * Captures declaration syntax and name occurrences without retaining compiler objects.
 *
 * @remarks
 * The compiler supplies all syntax boundaries and symbol identities.
 * Original declaration inputs preserve private members and member documentation.
 * This path does not interpret printed type strings or emit implementation source.
 *
 * @param project - Active native compiler services.
 * @param sources - Package-owned source files from the current snapshot.
 * @param facts - Completed declaration facts used to associate standalone overloads.
 * @param identity - Resolves a symbol to its package-relative identity.
 * @param parser - Parser with the configured tag vocabulary.
 * @param getExports - Captures module bindings without collecting additional semantic facts.
 * @param packageDocumentation - Original package comment, or undefined when absent.
 * @returns Detached original declaration fragments.
 */
export function captureDeclarationSyntax(
	project: Pick<Project, "checker">,
	sources: readonly SourceFile[],
	facts: ReadonlyMap<ApiItemId, DeclarationFact>,
	identity: (symbol: CompilerSymbol) => ApiItemId,
	parser: TSDocParser,
	getExports: (symbol: CompilerSymbol) => readonly DeclarationExportFact[],
	packageDocumentation: string | undefined,
): Omit<DeclarationSyntaxFacts, "surfaces"> {
	const records = new Map<ApiItemId, DeclarationSyntaxFact>();
	const indexed = indexDeclarations(project, sources, identity);
	const localRoots = new Map(indexed.roots);
	for (const source of sources) {
		const symbol = project.checker.getSymbolAtLocation(source);
		if (symbol !== undefined) {
			const root = { id: identity(symbol), name: "" };
			localRoots.set(symbol.id, root);
			records.set(root.id, { ...root, fragments: [], exports: getExports(symbol) });
		}
	}
	const { roots, imports } = indexImports(project, sources, localRoots);
	const lexicalNames = new Set<string>();
	for (const input of indexed.statements) {
		const root = roots.get(input.symbol.id);
		assert(root !== undefined, "Indexed statements must retain a declaration identity.");
		const captured = captureDeclaration(project, input, roots, facts.get(root.id), parser);
		for (const name of captured.lexicalNames) {
			lexicalNames.add(name);
		}
		const previous = records.get(root.id);
		records.set(root.id, {
			...root,
			fragments: [...(previous?.fragments ?? []), captured.fragment],
		});
	}
	for (const fact of facts.values()) {
		if (
			!records.has(fact.id) &&
			fact.declarations.some((source) => source.kind === "NamespaceExport")
		) {
			records.set(fact.id, {
				id: fact.id,
				name: fact.name,
				documentation: fact.declarations.flatMap((declaration) =>
					declaration.documentation === undefined
						? []
						: [captureDocumentationSyntax(declaration.documentation, parser)],
				),
				exports: fact.exports.map(({ external, ...binding }) => ({
					...binding,
					...(external === undefined ? {} : { moduleReference: external }),
				})),
				fragments: [],
			});
		}
	}
	return {
		...(packageDocumentation === undefined
			? {}
			: {
					packageDocumentation: captureDocumentationSyntax(packageDocumentation, parser),
				}),
		declarations: [...records.values()],
		imports,
		lexicalNames: [...lexicalNames].sort(),
	};
}

/**
 * Indexes top-level local declarations before resolving any cross-file references.
 * @param project - Active checker.
 * @param sources - Local source files.
 * @param identity - Declaration identity policy.
 * @returns Original statement inputs and their symbol identities.
 */
function indexDeclarations(
	project: Pick<Project, "checker">,
	sources: readonly SourceFile[],
	identity: (symbol: CompilerSymbol) => ApiItemId,
): {
	readonly statements: readonly DeclarationInput[];
	readonly roots: ReadonlyMap<number, DeclarationName>;
} {
	const roots = new Map<number, DeclarationName>();
	const statements: DeclarationInput[] = [];
	for (const source of sources) {
		for (const statement of source.statements) {
			const nodes = isVariableStatement(statement)
				? statement.declarationList.declarations
				: [statement];
			for (const node of nodes) {
				if (
					(node.kind === SyntaxKind.FunctionDeclaration ||
						node.kind === SyntaxKind.ClassDeclaration) &&
					"name" in node &&
					node.name === undefined
				) {
					const moduleSymbol = project.checker.getSymbolAtLocation(source);
					const defaultSymbol =
						moduleSymbol &&
						project.checker
							.getExportsOfModule(moduleSymbol)
							.find((item) => item.name === "default");
					if (defaultSymbol !== undefined) {
						roots.set(defaultSymbol.id, {
							id: identity(defaultSymbol),
							name: "default",
						});
						statements.push({ node: statement, symbol: defaultSymbol, source });
					}
					continue;
				}
				if (!("name" in node) || node.name === undefined || !isIdentifier(node.name)) {
					continue;
				}
				const name = node.name as Node;
				const symbol = project.checker.getSymbolAtLocation(name);
				if (
					symbol === undefined ||
					[SyntaxKind.ImportClause, SyntaxKind.ImportEqualsDeclaration].includes(node.kind)
				) {
					continue;
				}
				roots.set(symbol.id, { id: identity(symbol), name: name.getText() });
				statements.push({
					node: statement,
					symbol,
					source,
					...(isVariableStatement(statement) ? { variable: node } : {}),
				});
			}
		}
	}
	return { roots, statements };
}

/**
 * Associates local import aliases with declarations and retains external import bindings.
 * @param project - Active checker.
 * @param sources - Local source files.
 * @param localRoots - Indexed local declarations; never changed.
 * @returns A new binding index and the external import records.
 */
function indexImports(
	project: Pick<Project, "checker">,
	sources: readonly SourceFile[],
	localRoots: ReadonlyMap<number, DeclarationName>,
): {
	readonly roots: ReadonlyMap<number, DeclarationName>;
	readonly imports: DeclarationSyntaxFacts["imports"];
} {
	const roots = new Map(localRoots);
	const imports = new Map<string, ImportFact & { id: string }>();
	for (const source of sources) {
		for (const statement of source.statements) {
			if (
				!isImportDeclaration(statement) ||
				!isStringLiteral(statement.moduleSpecifier) ||
				statement.importClause === undefined
			) {
				continue;
			}
			const clause = statement.importClause;
			const elements = [
				...(clause.name === undefined
					? []
					: [
							{
								name: clause.name,
								kind: "default" as const,
								importedName: "default",
								typeOnly: clause.phaseModifier === SyntaxKind.TypeKeyword,
							},
						]),
				...(clause.namedBindings === undefined
					? []
					: isNamedImports(clause.namedBindings)
						? clause.namedBindings.elements.map((element) => ({
								name: element.name,
								kind: "named" as const,
								importedName: (element.propertyName ?? element.name).text,
								typeOnly:
									element.isTypeOnly || clause.phaseModifier === SyntaxKind.TypeKeyword,
							}))
						: [
								{
									name: clause.namedBindings.name,
									kind: "namespace" as const,
									typeOnly: clause.phaseModifier === SyntaxKind.TypeKeyword,
								},
							]),
			];
			for (const element of elements) {
				const symbol = project.checker.getSymbolAtLocation(element.name);
				if (symbol === undefined) {
					continue;
				}
				const target = project.checker.getAliasedSymbol(symbol);
				const local = roots.get(target.id);
				if (local !== undefined) {
					roots.set(symbol.id, local);
				} else if (!statement.moduleSpecifier.text.startsWith(".")) {
					const importedName = "importedName" in element ? element.importedName : undefined;
					const id = JSON.stringify([
						"import",
						statement.moduleSpecifier.text,
						element.kind,
						importedName,
					]);
					imports.set(id, {
						id,
						kind: element.kind,
						moduleSpecifier: statement.moduleSpecifier.text,
						name: element.name.text,
						typeOnly: element.typeOnly,
						...(importedName === undefined ? {} : { importedName }),
					});
					roots.set(symbol.id, { id, name: element.name.text });
				}
			}
		}
	}
	return { roots, imports: [...imports.values()] };
}

/**
 * Captures one original statement with compiler-bound names and syntax boundaries.
 * @param project - Active checker.
 * @param input - Original declaration statement.
 * @param roots - Bound local and imported symbols.
 * @param fact - Semantic facts used to associate callable overloads, when collected.
 * @param parser - Parser with the configured tag vocabulary.
 * @returns Original syntax and lexical identifiers not represented by references.
 */
function captureDeclaration(
	project: Pick<Project, "checker">,
	input: DeclarationInput,
	roots: ReadonlyMap<number, DeclarationName>,
	fact: DeclarationFact | undefined,
	parser: TSDocParser,
): {
	readonly fragment: DeclarationSyntaxFact["fragments"][number];
	readonly lexicalNames: ReadonlySet<string>;
} {
	const { node, source, variable } = input;
	const lexicalNames = new Set<string>();
	const references: (SyntaxRange & { readonly target: string })[] = [];
	let variableSyntax: DeclarationSyntax["variable"];
	if (variable !== undefined && isVariableStatement(node)) {
		const first = node.declarationList.declarations[0];
		const last = node.declarationList.declarations.at(-1);
		assert(first !== undefined && last !== undefined);
		variableSyntax = {
			list: { start: first.end - first.getText().length - node.pos, end: last.end - node.pos },
			binding: {
				start: variable.end - variable.getText().length - node.pos,
				end: variable.end - node.pos,
			},
		};
	}
	let anonymousNameOffset: number | undefined;
	if (
		(node.kind === SyntaxKind.FunctionDeclaration ||
			node.kind === SyntaxKind.ClassDeclaration) &&
		"name" in node &&
		node.name === undefined
	) {
		const scanner = createScanner(true, undefined, source.text, node.pos, node.end - node.pos);
		const keyword =
			node.kind === SyntaxKind.FunctionDeclaration
				? SyntaxKind.FunctionKeyword
				: SyntaxKind.ClassKeyword;
		while (scanner.scan() !== keyword) {
			assert(
				scanner.getToken() !== SyntaxKind.EndOfFile,
				"Anonymous declarations must have a declaration keyword.",
			);
		}
		anonymousNameOffset = scanner.getTokenEnd() - node.pos;
	}
	const modifiers =
		"modifiers" in node ? (node.modifiers as readonly Node[] | undefined) : undefined;
	const modifierSyntax: DeclarationSyntax["modifiers"][number][] = [];
	for (const modifier of modifiers ?? []) {
		const scanner = createScanner(
			false,
			undefined,
			source.text,
			modifier.end,
			node.end - modifier.end,
		);
		let end = modifier.end;
		let token = scanner.scan();
		while (token === SyntaxKind.WhitespaceTrivia || token === SyntaxKind.NewLineTrivia) {
			end = scanner.getTokenEnd();
			token = scanner.scan();
		}
		modifierSyntax.push({
			keyword: modifier.getText(),
			range: {
				start: modifier.end - modifier.getText().length - node.pos,
				end: modifier.end - node.pos,
			},
			trailingEnd: end - node.pos,
		});
	}
	const comments = new Set<number>();
	const commentSyntax: DeclarationSyntax["comments"][number][] = [];
	const importTypes: DeclarationSyntax["importTypes"][number][] = [];

	/**
	 * Captures original symbol occurrences and documentation section boundaries.
	 * @param current - Original compiler node in the declaration.
	 */
	function visit(current: Node): void {
		if (isVariableDeclaration(current) && variable !== undefined && current !== variable) {
			return;
		}
		for (const comment of getLeadingCommentRanges(source.text, current.pos) ?? []) {
			if (comments.has(comment.pos) || !source.text.startsWith("/**", comment.pos)) {
				continue;
			}
			comments.add(comment.pos);
			const commentText = source.text.slice(comment.pos, comment.end);
			commentSyntax.push({
				range: { start: comment.pos - node.pos, end: comment.end - node.pos },
				packageDocumentation:
					commentText.includes("@packageDocumentation") &&
					parser
						.parseString(commentText)
						.docComment.modifierTagSet.hasTagName("@packageDocumentation"),
				privateRemarks: captureDocumentationSyntax(commentText, parser).privateRemarks.map(
					(range) => ({
						start: range.start + comment.pos - node.pos,
						end: range.end + comment.pos - node.pos,
					}),
				),
			});
		}
		if (isImportTypeNode(current) && current.qualifier !== undefined) {
			const symbol = project.checker.getSymbolAtLocation(current.qualifier);
			const target = symbol === undefined ? undefined : roots.get(symbol.id);
			if (target !== undefined) {
				importTypes.push({
					prefix: {
						start: current.end - current.getText().length - node.pos,
						end: current.qualifier.end - current.qualifier.getText().length - node.pos,
					},
					isTypeOf: current.isTypeOf,
				});
			}
		}
		if (
			isIdentifier(current) ||
			isQualifiedName(current) ||
			isPropertyAccessExpression(current)
		) {
			const referenced = project.checker.getSymbolAtLocation(current);
			const resolved =
				referenced !== undefined && (referenced.flags & SymbolFlags.Alias) !== 0
					? project.checker.getAliasedSymbol(referenced)
					: referenced;
			const target =
				referenced === undefined
					? undefined
					: (roots.get(referenced.id) ??
						(resolved === undefined ? undefined : roots.get(resolved.id)));
			if (target !== undefined) {
				references.push({
					start: current.end - current.getText().length - node.pos,
					end: current.end - node.pos,
					target: target.id,
				});
				return;
			}
			if (isIdentifier(current)) {
				lexicalNames.add(current.text);
			}
		}
		current.forEachChild(visit);
	}
	visit(node);
	const fragment: DeclarationSyntaxFact["fragments"][number] = {
		syntax: {
			excerpt: createCodeExcerpt(source.text.slice(node.pos, node.end), references),
			isDeclarationFile: /\.d\.[cm]?ts$/.test(source.fileName),
			declarationStart: node.end - node.getText().length - node.pos,
			modifiers: modifierSyntax,
			comments: commentSyntax,
			importTypes,
			...(variableSyntax === undefined ? {} : { variable: variableSyntax }),
			...(anonymousNameOffset === undefined ? {} : { anonymousNameOffset }),
		},
		signatures:
			node.kind === SyntaxKind.FunctionDeclaration && !fact?.documentationContext
				? (fact?.signatures
						.filter(
							(signature) =>
								signature.source?.file ===
									fact.declarations.find((declaration) => declaration.start === node.pos)
										?.file && signature.source?.start === node.pos,
						)
						.map((signature) => signature.id) ?? [])
				: [],
	};
	return { fragment, lexicalNames };
}

/**
 * Records private TSDoc section boundaries without changing the original comment.
 * @param text - Original comment including delimiters.
 * @param parser - Parser with the configured tag vocabulary.
 * @returns Original text and private section ranges, including otherwise empty comment lines.
 */
function captureDocumentationSyntax(text: string, parser: TSDocParser): DocumentationSyntax {
	if (!text.includes("@privateRemarks")) {
		return { text, privateRemarks: [] };
	}
	const block = parser.parseString(text).docComment.privateRemarks;
	if (block === undefined) {
		return { text, privateRemarks: [] };
	}
	const ranges: { readonly pos: number; readonly end: number }[] = [];

	/**
	 * Collects source ranges owned by the private block, excluding other modifier tags.
	 * @param node - Parsed private documentation node.
	 */
	function collectRanges(node: DocNode): void {
		if (node instanceof DocExcerpt) {
			ranges.push(node.content.getContainingTextRange());
		}
		for (const child of node.getChildNodes()) {
			collectRanges(child);
		}
	}
	collectRanges(block);
	const removals: { pos: number; end: number }[] = [];
	for (const range of ranges
		.filter((item) => item.end > item.pos)
		.sort((left, right) => left.pos - right.pos)) {
		const lineStart = text.lastIndexOf("\n", range.pos - 1) + 1;
		const newline = text.indexOf("\n", range.end);
		const lineEnd = newline === -1 ? text.length : newline;
		const wholeLine =
			/^\s*\*\s*$/.test(text.slice(lineStart, range.pos)) &&
			/^\s*$/.test(text.slice(range.end, lineEnd));
		const removal = wholeLine
			? { pos: lineStart, end: newline === -1 ? lineEnd : lineEnd + 1 }
			: { pos: range.pos, end: range.end };
		const previous = removals.at(-1);
		if (previous !== undefined && removal.pos <= previous.end) {
			previous.end = Math.max(previous.end, removal.end);
		} else {
			removals.push(removal);
		}
	}
	return {
		text,
		privateRemarks: removals.map((range) => ({ start: range.pos, end: range.end })),
	};
}

/* eslint-disable no-bitwise -- TypeScript exposes symbol flags as bit masks. */

import assert from "node:assert/strict";
import { DocExcerpt, type DocNode, type TSDocParser } from "@microsoft/tsdoc";
import {
	SyntaxKind,
	createScanner,
	getLeadingCommentRanges,
	type Identifier,
	type ImportClause,
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
	isExportSpecifier,
	isImportEqualsDeclaration,
	isModuleDeclaration,
	isLiteralTypeNode,
} from "typescript/unstable/ast/is";
import {
	SymbolFlags,
	type Project,
	type Symbol as CompilerSymbol,
} from "typescript/unstable/sync";
import type { DeclarationFact, ApiItemId, ImportFact } from "../analysis-types/facts.js";
import type {
	DeclarationSyntax,
	DeclarationReferencePath,
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
 * One import binding normalized from source syntax, used only during capture.
 */
interface ImportBinding {
	/**
	 * Original local identifier used for compiler symbol lookup.
	 */
	readonly name: Identifier;

	/**
	 * Import form represented by this binding.
	 */
	readonly kind: ImportFact["kind"];

	/**
	 * Original export name, or `default` for a default binding.
	 * @defaultValue Omitted for namespace bindings.
	 */
	readonly importedName?: string;

	/**
	 * Whether the clause or the individual named binding is type-only.
	 */
	readonly typeOnly: boolean;
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

	/**
	 * Member path from the indexed root to an imported nested declaration.
	 *
	 * @example Nested namespace member
	 * For an import that resolves to `NS.Inner.Value`, the record uses the identity and name of `NS`.
	 * The path contains `Inner` followed by `Value`.
	 * It does not include the root name, `NS`.
	 * ```typescript
	 * declare const namespaceId: ApiItemId;
	 * const nested: DeclarationName = {
	 *     id: namespaceId,
	 *     name: "NS",
	 *     path: ["Inner", "Value"],
	 * };
	 * ```
	 *
	 * @example Direct root binding
	 * For an import that resolves directly to `NS`, the record omits the path.
	 * An import alias does not change this rule.
	 * ```typescript
	 * declare const rootId: ApiItemId;
	 * const direct: DeclarationName = { id: rootId, name: "NS" };
	 * ```
	 *
	 * @defaultValue Omitted for direct root bindings.
	 */
	readonly path?: readonly string[];
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

	// Module type queries need an identity for the whole source file.
	// The file has no declaration fragment, so its record contains only export bindings.
	for (const source of sources) {
		const symbol = project.checker.getSymbolAtLocation(source);
		if (symbol !== undefined) {
			const root = { id: identity(symbol), name: "" };
			localRoots.set(symbol.id, root);
			records.set(root.id, { ...root, fragments: [], exports: getExports(symbol) });
		}
	}
	const { roots, imports, sideEffectImports } = indexImports(project, sources, localRoots);
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
			...(isGlobalAugmentation(input.node) ? { globalAugmentation: true as const } : {}),
			...(isModuleDeclaration(input.node) && isStringLiteral(input.node.name)
				? { moduleAugmentation: input.node.name.text }
				: {}),
			fragments: [...(previous?.fragments ?? []), captured.fragment],
		});
	}
	captureMemberAliases(project, sources, roots, records, identity, parser);
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
		...(sideEffectImports.length === 0 ? {} : { sideEffectImports }),
		lexicalNames: [...lexicalNames].sort(),
	};
}

/**
 * Captures top-level aliases whose targets are members of indexed namespaces.
 * @remarks
 * Export selection uses the target identity, while the original import alias preserves its member path.
 * Existing root declarations take precedence so aliases do not duplicate their targets.
 * @param project - Active checker.
 * @param sources - Package-owned source files.
 * @param roots - Indexed declaration and import bindings.
 * @param records - Invocation-owned output records, updated with missing alias syntax.
 * @param identity - Resolves original declaration identities.
 * @param parser - Parser for original documentation.
 */
function captureMemberAliases(
	project: Pick<Project, "checker">,
	sources: readonly SourceFile[],
	roots: ReadonlyMap<number, DeclarationName>,
	records: Map<ApiItemId, DeclarationSyntaxFact>,
	identity: (symbol: CompilerSymbol) => ApiItemId,
	parser: TSDocParser,
): void {
	for (const source of sources) {
		for (const node of source.statements) {
			if (!isImportEqualsDeclaration(node)) {
				continue;
			}
			const symbol = project.checker.getSymbolAtLocation(node.name);
			if (symbol === undefined) {
				continue;
			}
			const target = project.checker.getAliasedSymbol(symbol);
			const binding = findLocalBinding(project, target, roots);
			const id = identity(target);
			if (binding?.path === undefined || records.has(id)) {
				continue;
			}
			const name = node.name.text;
			const bindings = new Map(roots);
			bindings.set(symbol.id, { id, name });
			const captured = captureDeclaration(
				project,
				{ node, symbol, source },
				bindings,
				undefined,
				parser,
			);
			records.set(id, { id, name, fragments: [captured.fragment] });
		}
	}
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
				const stringNamedModule = isModuleDeclaration(node) && isStringLiteral(node.name);
				if (
					!("name" in node) ||
					node.name === undefined ||
					(!isIdentifier(node.name) && !stringNamedModule)
				) {
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
	readonly sideEffectImports: readonly string[];
} {
	const roots = new Map(localRoots);
	const imports = new Map<string, ImportFact & { id: string }>();
	const sideEffectImports = new Set<string>();
	for (const source of sources) {
		for (const statement of source.statements) {
			// Import-equals aliases can target nested local members.
			// Retain the enclosing root and member path so references can follow relocation.
			if (isImportEqualsDeclaration(statement)) {
				const symbol = project.checker.getSymbolAtLocation(statement.name);
				if (symbol !== undefined) {
					const target = project.checker.getAliasedSymbol(symbol);
					const local = findLocalBinding(project, target, localRoots);
					if (local !== undefined) {
						roots.set(symbol.id, local);
					}
				}

				// This syntax has no import clause for the binding extraction below.
				continue;
			}
			if (!isImportDeclaration(statement) || !isStringLiteral(statement.moduleSpecifier)) {
				// The remaining path needs an import declaration with a literal module specifier.
				continue;
			}
			const clause = statement.importClause;

			// Bare imports and empty value import lists can load global declarations or augmentations.
			if (
				clause === undefined ||
				(clause.phaseModifier !== SyntaxKind.TypeKeyword &&
					clause.name === undefined &&
					clause.namedBindings !== undefined &&
					isNamedImports(clause.namedBindings) &&
					clause.namedBindings.elements.length === 0)
			) {
				// Keep the original external import syntax, including attributes.
				// Relative module contents are captured from package-owned sources instead.
				if (!statement.moduleSpecifier.text.startsWith(".")) {
					sideEffectImports.add(statement.getText());
				}

				// There are no imported names to resolve below.
				continue;
			}

			for (const element of getImportBindings(clause)) {
				const symbol = project.checker.getSymbolAtLocation(element.name);
				if (symbol === undefined) {
					// Without a compiler symbol, this binding cannot be associated with a target.
					continue;
				}
				const target = project.checker.getAliasedSymbol(symbol);
				const local = findLocalBinding(project, target, localRoots);
				if (local !== undefined) {
					// Local aliases use the captured declaration, not a separate external import.
					roots.set(symbol.id, local);
				} else if (!statement.moduleSpecifier.text.startsWith(".")) {
					// Use the external target, not the local alias, to identify repeated imports.
					const importedName = element.importedName;
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
	return { roots, imports: [...imports.values()], sideEffectImports: [...sideEffectImports] };
}

/**
 * Normalizes an import clause into individual bindings without resolving symbols.
 * @remarks
 * The default binding comes first, followed by named bindings in source order or a namespace binding.
 * Local identifiers retain their original compiler nodes for later symbol lookup.
 * Named bindings retain the original export name even when a local alias is present.
 * A binding is type-only when either its clause or its individual import specifier is type-only.
 * The input is not changed; only the returned array and its records are created here.
 * @param clause - Original import clause. Bare imports have no clause and are handled by the caller.
 * @returns A new binding array, empty for a clause with no bindings.
 */
function getImportBindings(clause: ImportClause): readonly ImportBinding[] {
	const bindings: ImportBinding[] = [];

	// A clause-level type modifier applies to every binding in the clause.
	const typeOnly = clause.phaseModifier === SyntaxKind.TypeKeyword;

	// Add the default binding first because it can accompany named or namespace imports.
	if (clause.name !== undefined) {
		bindings.push({
			name: clause.name,
			kind: "default",
			importedName: "default",
			typeOnly,
		});
	}
	const namedBindings = clause.namedBindings;
	if (namedBindings === undefined) {
		// No named or namespace bindings remain; keep any default binding already collected.
		return bindings;
	}
	if (isNamedImports(namedBindings)) {
		// Keep source order and distinguish each local alias from its original export name.
		for (const element of namedBindings.elements) {
			bindings.push({
				name: element.name,
				kind: "named",
				importedName: (element.propertyName ?? element.name).text,

				// An individual type modifier also applies when the clause permits value imports.
				typeOnly: element.isTypeOnly || typeOnly,
			});
		}
	} else {
		// A namespace binding represents the whole module, so it has no individual export name.
		bindings.push({ name: namedBindings.name, kind: "namespace", typeOnly });
	}
	return bindings;
}

/**
 * Finds the indexed root and member path for a resolved symbol.
 * @param project - Active checker.
 * @param symbol - Resolved local import target.
 * @param roots - Top-level local bindings.
 * @returns The root binding and member path, or undefined when no indexed root exists.
 */
function findLocalBinding(
	project: Pick<Project, "checker">,
	symbol: CompilerSymbol,
	roots: ReadonlyMap<number, DeclarationName>,
): DeclarationName | undefined {
	const direct = roots.get(symbol.id);
	if (direct !== undefined) {
		return direct;
	}

	// The generator emits nested members inside their enclosing namespace.
	// Walk through parent declarations to find that root.
	// Add each parent name at the start of the path to keep the original access order.
	for (const declaration of symbol.declarations ?? []) {
		const members = [symbol.name];
		let parent = declaration.resolve()?.parent;
		while (parent !== undefined) {
			if (isModuleDeclaration(parent) && isIdentifier(parent.name)) {
				const enclosing = project.checker.getSymbolAtLocation(parent.name);
				const root = enclosing === undefined ? undefined : roots.get(enclosing.id);
				if (root !== undefined) {
					return { ...root, path: members };
				}
				members.unshift(parent.name.text);
			}
			parent = parent.parent;
		}
	}
	return undefined;
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
	const shorthandExports: SyntaxRange[] = [];
	const referencePaths: DeclarationReferencePath[] = [];
	const moduleQueries: SyntaxRange[] = [];

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
		if (
			isImportTypeNode(current) &&
			current.qualifier === undefined &&
			current.isTypeOf &&
			isLiteralTypeNode(current.argument)
		) {
			const symbol = project.checker.getSymbolAtLocation(current.argument.literal);
			const target = symbol === undefined ? undefined : roots.get(symbol.id);
			if (target !== undefined) {
				// Capture the whole typeof import(...) expression as one module reference.
				// The generator restores the typeof keyword after it replaces the reference.
				const range = {
					start: current.end - current.getText().length - node.pos,
					end: current.end - node.pos,
				};
				references.push({ ...range, target: target.id });
				moduleQueries.push(range);
				return;
			}
		}
		if (isImportTypeNode(current) && current.qualifier !== undefined) {
			// NS.Member resolves to a nested symbol, not to an indexed root.
			// Use NS to check whether the generator can remove the import prefix.
			let qualifier = current.qualifier;
			while (isQualifiedName(qualifier)) {
				qualifier = qualifier.left;
			}
			const symbol = project.checker.getSymbolAtLocation(qualifier);
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
			const parent = current.parent;

			if (mustPreserveLexicalName(current, node)) {
				lexicalNames.add(current.getText());
				return;
			}

			// Use the import's binding record first.
			// The resolved target alone can omit the captured path to a namespace member.
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
				const range = {
					start: current.end - current.getText().length - node.pos,
					end: current.end - node.pos,
				};
				references.push({ ...range, target: target.id });
				if (target.path !== undefined) {
					referencePaths.push({ range, path: target.path });
				}
				if (isExportSpecifier(parent) && parent.propertyName === undefined) {
					// A shorthand name is both a reference and a public name.
					// The generator must change the reference without changing the public name.
					shorthandExports.push({
						start: current.end - current.getText().length - node.pos,
						end: current.end - node.pos,
					});
					lexicalNames.add(current.getText());
				}
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
			...(shorthandExports.length === 0 ? {} : { shorthandExports }),
			...(referencePaths.length === 0 ? {} : { referencePaths }),
			...(moduleQueries.length === 0 ? {} : { moduleQueries }),
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
 * Identifies names that must remain lexical instead of becoming target references.
 *
 * @remarks
 * Preserves explicit export alias names, nested import-equals alias names, and the global augmentation name.
 * Import-equals aliases captured as standalone declarations remain eligible for output-name allocation.
 * Shorthand exports also remain eligible for reference capture because they combine a target reference and a public name.
 * The caller records preserved names and stops traversal for them; this helper does not change capture state.
 *
 * @example Explicit and shorthand exports
 * The helper returns `true` for `PublicName` and `false` for both exported occurrences of `Original`.
 * The caller handles the public name of a shorthand export separately from its target reference.
 * ```typescript
 * declare class Original {}
 * // Preserve PublicName while allowing the reference to Original to change.
 * export { Original as PublicName };
 * // Capture Original as a reference, but also retain its public export name.
 * export { Original };
 * ```
 *
 * @example Nested and standalone import-equals aliases
 * When `Aliases` is the captured declaration, the helper returns `true` for the nested alias name `PublicItem`.
 * When the standalone import-equals statement is captured, it returns `false` for `StandaloneItem`.
 * ```typescript
 * declare namespace Source {
 *     interface Item { value: string; }
 * }
 * declare namespace Aliases {
 *     // Preserve this alias name inside the captured namespace.
 *     export import PublicItem = Source.Item;
 * }
 * // Allocate an output name for this alias when capturing its own statement.
 * export import StandaloneItem = Source.Item;
 * ```
 *
 * @example Global augmentation and an ordinary namespace
 * The helper returns `true` for `global` in the augmentation and `false` for the namespace name.
 * The spelling alone does not determine whether the name must be preserved.
 * ```typescript
 * export {};
 * // This global keyword selects the scope to augment; it cannot be renamed.
 * declare global {
 *     interface String { exampleMarker?: string; }
 * }
 * // This global identifier names an ordinary namespace and can be renamed.
 * declare namespace global {
 *     interface Item { value: string; }
 * }
 * ```
 *
 * @param current - Identifier, qualified name, or property access being visited in the original syntax tree.
 * @param declaration - Root statement currently being captured.
 * @returns Whether the name must bypass target-reference capture.
 */
function mustPreserveLexicalName(current: Node, declaration: Node): boolean {
	const parent = current.parent;

	// In an explicit export alias, the public name must not follow target renaming.
	if (
		isExportSpecifier(parent) &&
		parent.name === current &&
		parent.propertyName !== undefined
	) {
		return true;
	}

	// Nested import-equals aliases keep their names inside the captured declaration.
	// A standalone alias is the captured root itself and must remain eligible for renaming.
	if (isImportEqualsDeclaration(parent) && parent !== declaration && parent.name === current) {
		return true;
	}

	// The global augmentation name denotes a scope, not a relocatable declaration.
	if (isModuleDeclaration(parent) && isGlobalAugmentation(parent) && parent.name === current) {
		return true;
	}

	// Other names still need symbol lookup, including the reference side of shorthand exports.
	return false;
}

/**
 * Distinguishes global augmentation from an ordinary module named global.
 * @remarks
 * The native syntax tree uses ModuleKeyword for both forms.
 * The official scanner distinguishes the two forms from their source tokens.
 * @param node - Original declaration node.
 * @returns Whether the declaration uses the global keyword without a module or namespace keyword.
 */
function isGlobalAugmentation(node: Node): boolean {
	if (!isModuleDeclaration(node) || !isIdentifier(node.name) || node.name.text !== "global") {
		return false;
	}
	const scanner = createScanner(true, undefined, node.getText());
	for (let token = scanner.scan(); token !== SyntaxKind.EndOfFile; token = scanner.scan()) {
		if (token === SyntaxKind.ModuleKeyword || token === SyntaxKind.NamespaceKeyword) {
			return false;
		}
		if (token === SyntaxKind.GlobalKeyword) {
			return true;
		}
	}
	return false;
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

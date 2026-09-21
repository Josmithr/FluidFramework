/* eslint-disable no-bitwise -- TypeScript exposes symbol flags as bit masks. */

import {
	SyntaxKind,
	type Node,
	type CallSignatureDeclaration,
	type ImportTypeNode,
} from "typescript/unstable/ast";
import { createFunctionTypeNode } from "typescript/unstable/ast/factory";
import {
	isIdentifier,
	isTypeReferenceNode,
	isTypeQueryNode,
	isExpressionWithTypeArguments,
	isImportTypeNode,
	isQualifiedName,
	isPropertyAccessExpression,
	isLiteralTypeNode,
	isStringLiteral,
} from "typescript/unstable/ast/is";
import {
	NodeBuilderFlags,
	SignatureKind,
	SymbolFlags,
	type Project,
	type Signature,
	type Type,
	type Symbol as CompilerSymbol,
} from "typescript/unstable/sync";
import type { CodeExcerpt } from "../analysis-types/excerpt.js";
import type { ApiItemId, SignatureText } from "../analysis-types/facts.js";
import {
	createCodeExcerpt,
	printCodeExcerpt,
	type ExcerptReference,
} from "./structuredExcerpt.js";

/**
 * Compiler effects required by excerpt capture, without program ownership or adapter state.
 */
type ExcerptCompiler = Pick<Project, "checker" | "emitter">;

/**
 * Caller-owned policy for suite membership and retained declaration identities.
 * Returning undefined leaves the symbol's text unlinked.
 */
type ReferenceTargetResolver = (symbol: CompilerSymbol) => ApiItemId | undefined;

/**
 * Prints two syntax forms from the same detached signature node without rewriting strings.
 * @param compiler - Active checker and emitter for this invocation.
 * @param node - Call-signature syntax with its final parameter and return types.
 * @param scope - Original compiler scope used to resolve printed references.
 * @param signature - Semantic signature supplying substituted types for generated import references.
 * @param getReferenceTarget - Maps eligible resolved symbols to retained identities; undefined leaves content unlinked.
 * @returns Matching call-signature and function-type text with reference tokens.
 */
export function printSignatureText(
	compiler: ExcerptCompiler,
	node: CallSignatureDeclaration,
	scope: Node | undefined,
	signature: Signature,
	getReferenceTarget: ReferenceTargetResolver,
): SignatureText {
	const types = [
		compiler.checker.getReturnTypeOfSignature(signature),
		...signature
			.getParameters()
			.map((_parameter, index) => compiler.checker.getParameterType(signature, index)),
	];
	const functionNode = createFunctionTypeNode(node.typeParameters, node.parameters, node.type);
	return {
		callSignatureText: compiler.emitter.printNode(node).trim(),
		functionTypeText: compiler.emitter.printNode(functionNode).trim(),
		callSignatureExcerpt: printNativeExcerpt(compiler, node, scope, types, getReferenceTarget),
		functionTypeExcerpt: printNativeExcerpt(
			compiler,
			functionNode,
			scope,
			types,
			getReferenceTarget,
		),
	};
}

/**
 * Captures references from compiler-generated syntax using explicit scope and semantic types.
 * @param compiler - Active compiler services.
 * @param node - Syntax to display.
 * @param scope - Original scope used for printing and lookup.
 * @param types - Resolved types that can introduce generated import references.
 * @param getReferenceTarget - Maps eligible resolved symbols to retained identities; undefined leaves content unlinked.
 * @returns Detached content and reference tokens.
 */
export function printNativeExcerpt(
	compiler: ExcerptCompiler,
	node: Node,
	scope: Node | undefined,
	types: readonly (Type | undefined)[],
	getReferenceTarget: ReferenceTargetResolver,
): CodeExcerpt {
	const print = (current: Node): string => compiler.emitter.printNode(current);
	const resolve = (
		name: Node,
		bound: ReadonlySet<string>,
		reference: Node,
	): ApiItemId | undefined => {
		// Synthesized nodes cannot be queried as original source nodes. Use their print scope,
		// or semantic types when substitution introduces an import absent from that scope.
		// A type parameter can shadow a type name without shadowing a typeof value target.
		const symbol = isImportTypeNode(reference)
			? (resolvePrintedImport(compiler, reference, scope) ??
				resolveGeneratedImport(compiler, reference, scope, types))
			: resolvePrintedName(
					compiler,
					name,
					scope,
					isTypeQueryNode(reference) ? new Set() : bound,
					isTypeQueryNode(reference)
						? SymbolFlags.Value | SymbolFlags.Namespace
						: SymbolFlags.Type | SymbolFlags.Namespace,
				);
		return symbol !== undefined && isExcerptDeclaration(symbol)
			? getReferenceTarget(symbol)
			: undefined;
	};
	return printCodeExcerpt(node, print, resolve);
}

/**
 * Matches generated import syntax to the compiler's own rendering of resolved signature types.
 * @remarks
 * This handles substitutions whose target module is not imported by the original declaration.
 * Matching includes the full module specifier and qualifier; ambiguous matches produce no target.
 * @param compiler - Active compiler services.
 * @param reference - Generated import-type reference.
 * @param scope - Scope used by the compiler to print the type.
 * @param types - Semantic types containing substitutions.
 * @returns The unique compiler symbol for this generated import, when available.
 */
function resolveGeneratedImport(
	compiler: ExcerptCompiler,
	reference: ImportTypeNode,
	scope: Node | undefined,
	types: readonly (Type | undefined)[],
): CompilerSymbol | undefined {
	// Include the module and qualifier so equal names from different modules cannot share a match.
	const key = `${compiler.emitter.printNode(reference.argument)}:${
		reference.qualifier === undefined ? "" : compiler.emitter.printNode(reference.qualifier)
	}`;
	const pending = [...types];

	// Compiler IDs are invocation-local traversal keys; they never become portable identities.
	const seen = new Set<number>();
	const matches = new Map<number, CompilerSymbol>();
	while (pending.length > 0) {
		const type = pending.pop();
		if (type === undefined || seen.has(type.id)) {
			continue;
		}
		seen.add(type.id);

		// Visit substitutions even at named types, but do not expand those types' member graphs.
		pending.push(...type.getAliasTypeArguments());
		if (type.isTypeReference()) {
			pending.push(...compiler.checker.getTypeArguments(type));
		}
		const symbol = type.getAliasSymbol() ?? type.getSymbol();
		if (symbol !== undefined && !(symbol.flags & SymbolFlags.TypeParameter)) {
			const node = compiler.checker.typeToTypeNode(type, scope, NodeBuilderFlags.NoTruncation);
			if (
				node !== undefined &&
				isImportTypeNode(node) &&
				key ===
					`${compiler.emitter.printNode(node.argument)}:${
						node.qualifier === undefined ? "" : compiler.emitter.printNode(node.qualifier)
					}`
			) {
				matches.set(symbol.id, symbol);
			}
		}
		if (type.isUnionType() || type.isIntersectionType()) {
			pending.push(...type.getTypes());
		} else if (type.isIndexedAccessType()) {
			pending.push(type.getObjectType(), type.getIndexType());
		} else if (type.isConditionalType()) {
			pending.push(
				type.getCheckType(),
				type.getExtendsType(),
				type.getTrueType(),
				type.getFalseType(),
			);
		} else if (type.isSubstitutionType()) {
			pending.push(type.getBaseType(), type.getConstraint());
		} else if (
			type.isObjectType() &&
			symbol?.declarations.some((handle) =>
				[
					SyntaxKind.ClassDeclaration,
					SyntaxKind.InterfaceDeclaration,
					SyntaxKind.TypeAliasDeclaration,
				].includes(handle.kind),
			) !== true
		) {
			// Anonymous object types can have symbols too. Their nested types remain part of this view.
			pending.push(
				...compiler.checker
					.getPropertiesOfType(type)
					.map((property) => compiler.checker.getTypeOfSymbol(property)),
			);
			for (const info of compiler.checker.getIndexInfosOfType(type)) {
				pending.push(info.keyType, info.valueType);
			}
			for (const nested of compiler.checker.getSignaturesOfType(type, SignatureKind.Call)) {
				pending.push(
					compiler.checker.getReturnTypeOfSignature(nested),
					...nested
						.getParameters()
						.map((_parameter, index) => compiler.checker.getParameterType(nested, index)),
				);
			}
		}
	}

	// An unresolved or ambiguous reference must stay plain text rather than acquire a guessed link.
	return matches.size === 1 ? matches.values().next().value : undefined;
}

/**
 * Resolves an import-type qualifier through a compiler-bound original module specifier.
 * @param compiler - Active checker services.
 * @param reference - Generated import-type syntax.
 * @param scope - Original print scope containing the module import.
 * @returns The imported declaration symbol, or undefined when no module binding is available.
 */
function resolvePrintedImport(
	compiler: ExcerptCompiler,
	reference: ImportTypeNode,
	scope: Node | undefined,
): CompilerSymbol | undefined {
	if (
		scope === undefined ||
		!isLiteralTypeNode(reference.argument) ||
		!isStringLiteral(reference.argument.literal)
	) {
		return undefined;
	}
	const specifier = reference.argument.literal.text;

	// Reuse the compiler's original module binding; resolving a path ourselves could select
	// a different package export condition or package installation.
	const original = scope
		.getSourceFile()
		.imports.find((node) => isStringLiteral(node) && node.text === specifier);
	let symbol =
		original === undefined ? undefined : compiler.checker.getSymbolAtLocation(original);
	const names: string[] = [];
	let qualifier = reference.qualifier;
	while (qualifier !== undefined && isQualifiedName(qualifier)) {
		names.unshift(qualifier.right.text);
		qualifier = qualifier.left;
	}
	if (qualifier !== undefined) {
		names.unshift(qualifier.text);
	}
	for (const name of names) {
		if (symbol === undefined) {
			return undefined;
		}
		const member = compiler.checker.getMemberInModuleExports(symbol, name);
		symbol = member === undefined ? undefined : resolveSymbolTarget(compiler.checker, member);
	}
	return symbol;
}

/**
 * Resolves generated entity names in the compiler scope used for their display.
 * @param compiler - Active checker services.
 * @param name - Generated identifier or qualified name, not parsed display text.
 * @param scope - Original declaration scope.
 * @param bound - Generated local type parameters that do not denote API declarations.
 * @param meaning - TypeScript namespace in which the reference is used.
 * @returns Original declaration symbol, or undefined for locally bound or unresolved names.
 */
function resolvePrintedName(
	compiler: ExcerptCompiler,
	name: Node,
	scope: Node | undefined,
	bound: ReadonlySet<string>,
	meaning: SymbolFlags,
): CompilerSymbol | undefined {
	if (scope === undefined) {
		return undefined;
	}
	if (isIdentifier(name)) {
		if (bound.has(name.text)) {
			return undefined;
		}
		const symbol = compiler.checker.resolveName(name.text, meaning, scope);
		if (symbol === undefined || compiler.checker.isUnknownSymbol(symbol)) {
			return undefined;
		}
		const resolved = resolveSymbolTarget(compiler.checker, symbol);
		return resolved.flags & SymbolFlags.TypeParameter ? undefined : resolved;
	}
	if (isQualifiedName(name) || isPropertyAccessExpression(name)) {
		const owner = resolvePrintedName(
			compiler,
			isQualifiedName(name) ? name.left : name.expression,
			scope,
			bound,
			meaning,
		);
		if (owner === undefined) {
			return undefined;
		}
		const member = compiler.checker
			.getExportsOfModule(owner)
			.find(
				(symbol) => symbol.name === (isQualifiedName(name) ? name.right.text : name.name.text),
			);
		return member === undefined ? undefined : resolveSymbolTarget(compiler.checker, member);
	}
	return undefined;
}

/**
 * Captures reference spans from original compiler-bound syntax without changing source text.
 * @param compiler - Active checker services.
 * @param node - Original declaration node with source positions.
 * @param getReferenceTarget - Maps eligible resolved symbols to retained identities; undefined leaves content unlinked.
 * @returns A whole-source excerpt; comments remain ordinary content tokens.
 */
export function createSourceExcerpt(
	compiler: ExcerptCompiler,
	node: Node,
	getReferenceTarget: ReferenceTargetResolver,
): CodeExcerpt {
	const text = node.getFullText();
	const references: ExcerptReference[] = [];

	/**
	 * Visits type references while leaving implementation bodies out of API excerpts.
	 * @param current - Original source node.
	 */
	function visit(current: Node): void {
		if (current.kind === SyntaxKind.Block) {
			return;
		}
		const name = isTypeReferenceNode(current)
			? current.typeName
			: isTypeQueryNode(current)
				? current.exprName
				: isExpressionWithTypeArguments(current)
					? current.expression
					: isImportTypeNode(current)
						? current.qualifier
						: undefined;
		if (name !== undefined) {
			const symbol = compiler.checker.getSymbolAtLocation(name);
			if (symbol !== undefined && !compiler.checker.isUnknownSymbol(symbol)) {
				const target = resolveSymbolTarget(compiler.checker, symbol);
				const identity = isExcerptDeclaration(target) ? getReferenceTarget(target) : undefined;
				if (identity !== undefined) {
					// getFullText includes leading trivia, so offsets are relative to pos, not getStart().
					references.push({
						start: name.getStart() - node.pos,
						end: name.end - node.pos,
						target: identity,
					});
				}
			}
		}
		current.forEachChild(visit);
	}
	visit(node);
	return createCodeExcerpt(
		text,
		references.sort((left, right) => left.start - right.start),
	);
}

/**
 * Excludes local bindings and compiler-only symbols before applying the caller's reference policy.
 * @param symbol - Resolved symbol from compiler lookup.
 * @returns Whether the symbol has a supported API declaration kind.
 */
function isExcerptDeclaration(symbol: CompilerSymbol): boolean {
	return (
		!(symbol.flags & SymbolFlags.TypeParameter) &&
		symbol.declarations.some((handle) =>
			[
				SyntaxKind.ClassDeclaration,
				SyntaxKind.InterfaceDeclaration,
				SyntaxKind.TypeAliasDeclaration,
				SyntaxKind.EnumDeclaration,
				SyntaxKind.FunctionDeclaration,
				SyntaxKind.VariableDeclaration,
				SyntaxKind.ModuleDeclaration,
				SyntaxKind.MethodDeclaration,
				SyntaxKind.MethodSignature,
				SyntaxKind.PropertyDeclaration,
				SyntaxKind.PropertySignature,
				SyntaxKind.EnumMember,
			].includes(handle.kind),
		)
	);
}

/**
 * Resolves an alias through the compiler's symbol resolver.
 *
 * @param checker - The checker for the active compiler snapshot.
 * @param symbol - The exported symbol to resolve.
 * @returns The alias target, or the original symbol if it is not an alias.
 */
function resolveSymbolTarget(
	checker: Project["checker"],
	symbol: CompilerSymbol,
): CompilerSymbol {
	return symbol.flags & SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
}

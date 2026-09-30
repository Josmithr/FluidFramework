import type { CodeExcerpt } from "./excerpt.js";
import type { ApiItemId, ExportFact, ImportFact } from "./facts.js";

/**
 * Half-open character range in its containing source text.
 * @sealed
 * @public
 */
export interface SyntaxRange {
	/**
	 * Inclusive UTF-16 character offset.
	 */
	readonly start: number;

	/**
	 * Exclusive UTF-16 character offset.
	 */
	readonly end: number;
}

/**
 * Source range and member path for a namespace reference.
 * @sealed
 * @public
 */
export interface DeclarationReferencePath {
	/**
	 * Source range of the original reference.
	 */
	readonly range: SyntaxRange;

	/**
	 * Member names from the captured target to the referenced declaration.
	 */
	readonly path: readonly string[];
}

/**
 * Original documentation and parser-resolved private section boundaries.
 * @sealed
 * @public
 */
export interface DocumentationSyntax {
	/**
	 * Original comment text, including delimiters.
	 */
	readonly text: string;

	/**
	 * Private section ranges in text, including otherwise empty comment lines.
	 */
	readonly privateRemarks: readonly SyntaxRange[];
}

/**
 * Resolved export identity with its original importable package binding.
 */
export interface DeclarationExportFact extends Omit<ExportFact, "external"> {
	/**
	 * Original package path and imported name, independent of suite membership.
	 * @defaultValue Omitted for bindings resolved within the analyzed package.
	 */
	readonly moduleReference?: NonNullable<ExportFact["external"]>;
}

/**
 * Original declaration syntax and source boundaries resolved during analysis.
 * @sealed
 * @public
 */
export interface DeclarationSyntax {
	/**
	 * Original text with declaration and import identities on name occurrences.
	 * Character offsets in this record refer to the concatenated token text.
	 */
	readonly excerpt: CodeExcerpt;

	/**
	 * Whether the source is a declaration file rather than implementation source.
	 */
	readonly isDeclarationFile: boolean;

	/**
	 * First declaration token after leading comments and whitespace.
	 */
	readonly declarationStart: number;

	/**
	 * Original modifiers and the end of their following whitespace, excluding comments.
	 */
	readonly modifiers: readonly {
		/**
		 * Original modifier keyword.
		 */
		readonly keyword: string;

		/**
		 * Modifier token range.
		 */
		readonly range: SyntaxRange;

		/**
		 * End of whitespace immediately after the token.
		 */
		readonly trailingEnd: number;
	}[];

	/**
	 * Attached documentation comment ranges and parsed sections.
	 */
	readonly comments: readonly {
		/**
		 * Complete comment range in the declaration excerpt.
		 */
		readonly range: SyntaxRange;

		/**
		 * Whether this comment declares package documentation.
		 */
		readonly packageDocumentation: boolean;

		/**
		 * Private section ranges relative to the declaration excerpt.
		 */
		readonly privateRemarks: readonly SyntaxRange[];
	}[];

	/**
	 * Import-type prefixes whose qualified target has a captured local identity.
	 */
	readonly importTypes: readonly {
		/**
		 * Range before the qualifier, including an original typeof keyword when present.
		 */
		readonly prefix: SyntaxRange;

		/**
		 * Whether the original expression is a type query.
		 */
		readonly isTypeOf: boolean;
	}[];

	/**
	 * Source ranges for shorthand export names.
	 * @remarks
	 * Each name also references a captured local binding.
	 * @defaultValue Omitted when no shorthand exports reference captured bindings.
	 */
	readonly shorthandExports?: readonly SyntaxRange[];

	/**
	 * Paths to namespace members.
	 * @remarks
	 * Each reference token identifies a captured enclosing declaration.
	 * The path identifies a member relative to that declaration.
	 * @defaultValue Omitted when references do not need member paths.
	 */
	readonly referencePaths?: readonly DeclarationReferencePath[];

	/**
	 * Source ranges for module type queries without qualifiers.
	 * @remarks
	 * Each range covers one reference token that identifies a source-file module.
	 * @defaultValue Omitted when no module queries reference captured source files.
	 */
	readonly moduleQueries?: readonly SyntaxRange[];

	/**
	 * Variable list and this record's individual binding within it.
	 * @defaultValue Omitted for non-variable declarations.
	 */
	readonly variable?: {
		/**
		 * Complete comma-separated binding list, excluding the declaration keyword and terminator.
		 */
		readonly list: SyntaxRange;

		/**
		 * Individual binding represented by this declaration record.
		 */
		readonly binding: SyntaxRange;
	};

	/**
	 * End of the function or class keyword for an anonymous default declaration.
	 * @defaultValue Omitted for named declarations.
	 */
	readonly anonymousNameOffset?: number;
}

/**
 * Original syntax parts associated with semantic declaration and overload identities.
 */
export interface DeclarationSyntaxFact {
	/**
	 * Original module specifier of a string-named module declaration.
	 * @defaultValue Omitted for declarations without a string module name.
	 */
	readonly moduleAugmentation?: string;

	/**
	 * Merged declaration identities contributed by a relative augmentation of a package-owned module.
	 *
	 * @remarks
	 * Their original member syntax is also captured under those identities.
	 *
	 * @defaultValue Omitted when the augmentation target is not a captured local module.
	 */
	readonly moduleAugmentationMembers?: readonly ApiItemId[];

	/**
	 * Whether this declaration is a global augmentation.
	 * @defaultValue Omitted for ordinary declarations.
	 */
	readonly globalAugmentation?: true;

	/**
	 * Original declaration identity.
	 */
	readonly id: ApiItemId;

	/**
	 * Original binding name, or a descriptive name for an anonymous declaration.
	 */
	readonly name: string;

	/**
	 * Source parts in compiler order, with their associated callable signatures.
	 */
	readonly fragments: readonly {
		/**
		 * Original declaration syntax.
		 */
		readonly syntax: DeclarationSyntax;

		/**
		 * Standalone overload identities associated with this source part.
		 */
		readonly signatures: readonly ApiItemId[];
	}[];

	/**
	 * Resolved module bindings.
	 * @defaultValue Omitted for records without module exports.
	 */
	readonly exports?: readonly DeclarationExportFact[];

	/**
	 * Original comments attached to a module namespace binding.
	 * @defaultValue Omitted when comments are represented in the declaration syntax.
	 */
	readonly documentation?: readonly DocumentationSyntax[];
}

/**
 * Package-owned syntax and binding facts, including unexported supporting declarations.
 */
export interface DeclarationSyntaxFacts {
	/**
	 * Original external import statements without bindings, including import attributes.
	 * These imports can load global declarations or module augmentations.
	 * @defaultValue Omitted when no external imports without bindings occur.
	 */
	readonly sideEffectImports?: readonly string[];

	/**
	 * Captured source declarations and module bindings.
	 */
	readonly declarations: readonly DeclarationSyntaxFact[];

	/**
	 * External imports with identities used by source reference tokens.
	 */
	readonly imports: readonly (ImportFact & { readonly id: string })[];

	/**
	 * Lexical identifiers not represented by replaceable reference tokens.
	 */
	readonly lexicalNames: readonly string[];

	/**
	 * Configured entrypoint bindings with original package import paths and target ownership.
	 */
	readonly surfaces: readonly {
		/**
		 * Configured entrypoint name.
		 */
		readonly name: string;

		/**
		 * Bindings and whether their targets are defined outside the analyzed suite.
		 */
		readonly exports: readonly (DeclarationExportFact & { readonly outsideSuite: boolean })[];
	}[];

	/**
	 * Original package comment with parser-resolved private section boundaries.
	 * @defaultValue Omitted when no package comment exists.
	 */
	readonly packageDocumentation?: DocumentationSyntax;
}

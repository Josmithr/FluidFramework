import type { CodeExcerpt } from "../analysis-types/excerpt.js";
import type { ApiItemId, ExportFact, ImportFact } from "../analysis-types/facts.js";

/**
 * One declaration fragment after generator-owned output transformations.
 */
export interface RollupFragment {
	/**
	 * Declaration syntax with compiler-bound names represented as references.
	 */
	readonly excerpt: CodeExcerpt;

	/**
	 * Original overload identities; empty for atomic declarations and supporting syntax.
	 */
	readonly signatures: readonly ApiItemId[];
}

/**
 * A local declaration prepared for rollup selection and rendering.
 */
export interface RollupDeclaration {
	/**
	 * Whether augmentation fragments must remain outside the shared namespace for every selection.
	 * @defaultValue Omitted for ordinary module declarations.
	 */
	readonly moduleScope?: true;

	/**
	 * Original comments for a synthesized namespace wrapper, without private remarks.
	 * @defaultValue Omitted when documentation is absent or retained in original syntax.
	 */
	readonly documentation?: string;

	/**
	 * Nested bindings for a module namespace wrapper.
	 * @defaultValue Omitted for declarations represented by original syntax.
	 */
	readonly exports?: readonly ExportFact[];

	/**
	 * Compiler-resolved declaration identity.
	 */
	readonly id: ApiItemId;

	/**
	 * Preferred local name before collision resolution.
	 */
	readonly name: string;

	/**
	 * Original declaration parts in source order.
	 */
	readonly fragments: readonly RollupFragment[];

	/**
	 * Explanation when this declaration cannot be represented safely.
	 * @defaultValue Omitted for supported declaration inputs.
	 */
	readonly unsupported?: string;
}

/**
 * Generator-owned declaration inputs prepared from neutral analysis facts.
 */
export interface RollupData {
	/**
	 * External imports retained independently of named-export selection.
	 * @defaultValue Omitted when no external imports without bindings occur.
	 */
	readonly sideEffectImports?: readonly string[];

	/**
	 * Original package comment without private remarks.
	 * @defaultValue Omitted when the analyzed package has no package documentation.
	 */
	readonly packageDocumentation?: string;

	/**
	 * Lexical names that generated declaration names must not capture.
	 */
	readonly reservedNames: readonly string[];

	/**
	 * External imports referenced by declaration fragments.
	 */
	readonly imports: readonly (ImportFact & { readonly id: string })[];

	/**
	 * Configured entrypoints; cross-package targets retain importable export bindings.
	 */
	readonly surfaces: readonly {
		readonly name: string;
		readonly exports: readonly (ExportFact & { readonly untrimmed: boolean })[];
	}[];

	/**
	 * Local declaration syntax, including unexported supporting declarations.
	 */
	readonly declarations: readonly RollupDeclaration[];
}

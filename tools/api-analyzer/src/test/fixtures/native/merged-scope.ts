/*
 * Supplies the first half of a merged interface whose link name has a local meaning.
 * merged-scope-augmentation.ts contributes the second half from a different module scope.
 */

/**
 * Original destination.
 *
 * @beta
 */
// The original module sees this private name; the augmentation's module cannot see it lexically.
declare function localTarget(): void;

/**
 * Keeps the private destination in declaration output.
 *
 * @internal
 */
// Documentation references alone do not require the TypeScript emitter to retain private symbols.
export type KeepLocalTarget = typeof localTarget;

/** Shared description. See {@link localTarget}. @public */
// Keep this TSDoc on one line so emission into differently indented scopes preserves identical text.
// Identical content retains this first occurrence and its original reference provenance.
export interface SharedSettings {
	/**
	 * First setting.
	 *
	 * @public
	 */
	// This member keeps both halves structurally useful without introducing its own references.
	first: string;
}

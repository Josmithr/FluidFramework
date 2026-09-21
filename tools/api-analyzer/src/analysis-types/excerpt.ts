/**
 * A text fragment with an optional producer-resolved API target.
 * @remarks
 * Content tokens include punctuation, whitespace, and names without a retained API target.
 * Reference tokens carry opaque declaration identities, not names for a reader to resolve.
 * @public
 */
export type ExcerptToken =
	| { readonly kind: "Content"; readonly text: string }
	| { readonly kind: "Reference"; readonly text: string; readonly target: string };

/**
 * A readonly range of tokens with an inclusive start and an exclusive end.
 * @remarks
 * Indexes refer to positions in a token array, not character offsets.
 * Both indexes must be nonnegative integers, with the start no greater than the end.
 * Equal indexes represent an empty excerpt.
 * @public
 */
export interface ExcerptTokenRange {
	/**
	 * Inclusive index into the token array, not a character offset.
	 */
	readonly startIndex: number;

	/**
	 * Exclusive index into the token array, no greater than its length.
	 */
	readonly endIndex: number;
}

/**
 * A readonly code excerpt represented by tokens and an exclusive-end token range.
 * @remarks
 * Concatenate the tokens in the range to reproduce the displayed text exactly.
 * Token boundaries are presentation data, not TypeScript lexical token boundaries.
 * @public
 */
export interface CodeExcerpt {
	/**
	 * Content and resolved reference tokens in display order.
	 */
	readonly tokens: readonly ExcerptToken[];

	/**
	 * Included token range; equal indexes represent an empty excerpt.
	 */
	readonly tokenRange: ExcerptTokenRange;
}

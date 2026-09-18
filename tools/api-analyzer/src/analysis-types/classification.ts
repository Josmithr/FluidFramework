import type { ApiItemId } from "./facts.js";
import type { TsdocOptions } from "./tsdocOptions.js";
import { DiagnosticCode, reportFailure, type Result } from "./result.js";
import { freezeData } from "../utilities/freezeData.js";

/**
 * An API release level ordered by increasing permissiveness.
 *
 * @remarks
 * Numeric comparisons follow `Public < Beta < Alpha < Internal`.
 * Higher levels permit references to lower levels under release-level compatibility rules.
 * Selections still use explicit sets; the ordering does not add implicit inclusions.
 */
export enum ReleaseLevel {
	/**
	 * Public APIs, the least permissive release level.
	 */
	Public = 0,

	/**
	 * Beta APIs, more permissive than public APIs.
	 */
	Beta = 1,

	/**
	 * Alpha APIs, more permissive than beta APIs.
	 */
	Alpha = 2,

	/**
	 * Internal APIs, the most permissive release level.
	 */
	Internal = 3,
}

/**
 * Supported release levels in increasing permissiveness order.
 */
export const releaseLevels: readonly ReleaseLevel[] = [
	ReleaseLevel.Public,
	ReleaseLevel.Beta,
	ReleaseLevel.Alpha,
	ReleaseLevel.Internal,
];

/**
 * Standard TSDoc modifier spellings for each release level.
 */
export const releaseLevelTags: Readonly<Record<ReleaseLevel, string>> = {
	[ReleaseLevel.Public]: "@public",
	[ReleaseLevel.Beta]: "@beta",
	[ReleaseLevel.Alpha]: "@alpha",
	[ReleaseLevel.Internal]: "@internal",
};

/**
 * An identified documentation input, such as a callable signature fact.
 */
export interface ApiItemDocumentation {
	/**
	 * The caller-supplied identifier. See {@link ApiItemId} for identity and uniqueness rules.
	 */
	readonly id: ApiItemId;

	/**
	 * The associated TSDoc comment, including its delimiters, or `undefined` if absent.
	 *
	 * @remarks
	 * An explicit empty TSDoc comment is present documentation.
	 * An empty string is invalid comment text, not an absent comment. Declaration text is not accepted.
	 *
	 * @example
	 * A tagged comment retains both delimiters.
	 *
	 * Note: The closing slash is escaped here to avoid ending this source comment.
	 *
	 * ```typescript
	 * const item: ApiItemDocumentation = {
	 *     id: "example",
	 *     documentation: "/** Describes the API. @public *\/",
	 * };
	 * ```
	 *
	 * @example
	 * An explicit empty comment differs from no comment. The empty comment retains its delimiters.
	 *
	 * Note: Closing slashes are escaped here to avoid ending this source comment.
	 *
	 * ```typescript
	 * const empty: ApiItemDocumentation = { id: "empty", documentation: "/** *\/" };
	 * const absent: ApiItemDocumentation = { id: "absent", documentation: undefined };
	 * ```
	 */
	readonly documentation: string | undefined;
}

/**
 * Independently configurable diagnostic rules for classification.
 */
export interface ClassificationRules {
	/**
	 * Whether a missing release level fails classification.
	 *
	 * @defaultValue `true`
	 */
	readonly requireReleaseLevel?: boolean;

	/**
	 * Whether TSDoc parser diagnostics cause classification to fail.
	 *
	 * @remarks
	 * Set to `false` to ignore parser diagnostics while retaining recognized tags.
	 * These diagnostics include unrecognized tags, malformed inline tags, and missing comment delimiters.
	 * This does not disable parsing, change {@link ClassificationRules.requireReleaseLevel}, or suppress release-level conflicts.
	 *
	 * @defaultValue `true`
	 *
	 * @example
	 * Disable classification syntax diagnostics when creating the context.
	 * The recognized public release level remains available even when an unknown tag is present.
	 * The context still retains syntax diagnostics for later documentation validation.
	 *
	 * Note: The closing slash is escaped here to avoid ending this source comment.
	 *
	 * ```typescript
	 * const inputs = [{ id: "example", documentation: "/** @public @unconfigured *\/" }];
	 * const context = createDocumentationContext(inputs, {
	 *     rules: { validateTsdocSyntax: false },
	 * });
	 * if (context.ok) {
	 *     const classified = classifyApiItems(context.value);
	 *     // Classification succeeds; strict documentation validation would still fail.
	 *     console.log(classified.ok, context.value.validation.ok); // true, false
	 * }
	 * ```
	 */
	readonly validateTsdocSyntax?: boolean;
}

/**
 * Parser configuration and diagnostic policy used when creating a documentation context.
 */
export interface ClassificationOptions extends TsdocOptions {
	/**
	 * Diagnostic overrides. Conflicting release levels always fail.
	 *
	 * @defaultValue All classification rules are enabled.
	 */
	readonly rules?: ClassificationRules;
}

/**
 * Detached classification of one documentation input.
 */
export interface ApiItemMetadata {
	/**
	 * The input identifier. See {@link ApiItemId} for identity and preservation rules.
	 */
	readonly id: ApiItemId;

	/**
	 * The declared release level, or `undefined` when missing and permitted by policy.
	 *
	 * @remarks
	 * JSON serialization omits this property when its value is `undefined`.
	 * Check absence explicitly; {@link ReleaseLevel.Public} has the numeric value zero.
	 */
	readonly releaseLevel: ReleaseLevel | undefined;

	/**
	 * Recognized modifier names, including release tags, deduplicated and sorted.
	 */
	readonly modifierTags: readonly string[];
}

/**
 * Classified metadata and the tag vocabulary available for selection.
 */
export interface ApiClassification {
	/**
	 * Independently classified items, sorted by identifier.
	 */
	readonly items: readonly ApiItemMetadata[];

	/**
	 * Standard and configured modifier names, sorted for deterministic output.
	 */
	readonly modifierTags: readonly string[];
}

/**
 * An explicit release-level and modifier-tag selection, independent of repository policy.
 */
export interface ApiItemSelection {
	/**
	 * A nonempty caller-defined name for this metadata view.
	 */
	readonly name: string;

	/**
	 * Release levels to include. No less-stable levels are added implicitly.
	 */
	readonly releaseLevels: readonly ReleaseLevel[];

	/**
	 * Whether untagged items may pass the release-level filter.
	 *
	 * @defaultValue `false`
	 */
	readonly includeUntagged?: boolean;

	/**
	 * Modifier names that must all be present, using their configured spelling.
	 *
	 * @defaultValue No required tags.
	 */
	readonly requireTags?: readonly string[];

	/**
	 * Modifier names that must all be absent, using their configured spelling.
	 *
	 * @defaultValue No excluded tags.
	 */
	readonly excludeTags?: readonly string[];
}

/**
 * A named metadata view, not a trimmed declaration graph or generated artifact.
 */
export interface SelectedApiItems {
	/**
	 * The caller-supplied selection name.
	 */
	readonly name: string;

	/**
	 * Matching metadata, copied and sorted by identifier.
	 */
	readonly items: readonly ApiItemMetadata[];
}

/**
 * Selects a named metadata view without changing its input.
 *
 * @remarks
 * Required tags are combined with AND. Any excluded tag rejects an item.
 * Rejects empty selection names, unsupported release levels, and unknown modifier names.
 * Returns deeply frozen copies without mutating or freezing caller-owned inputs.
 * Does not trim the original facts or validate references to excluded items.
 *
 * @param classification - The classified metadata to select from.
 * @param selection - Release levels and modifier-tag filters.
 * @returns The selected metadata or diagnostics.
 */
export function selectApiItems(
	classification: ApiClassification,
	selection: ApiItemSelection,
): Result<SelectedApiItems> {
	if (
		selection.name.trim().length === 0 ||
		selection.releaseLevels.some((level) => !releaseLevels.includes(level))
	) {
		return reportFailure(
			DiagnosticCode.SelectionConfiguration,
			"Supply a nonempty selection name and supported release levels.",
		);
	}
	const requireTags = selection.requireTags ?? [];
	const excludeTags = selection.excludeTags ?? [];

	// Reject unknown filters instead of silently producing misleading matches or exclusions.
	for (const tag of [...requireTags, ...excludeTags]) {
		if (!classification.modifierTags.includes(tag)) {
			return reportFailure(
				DiagnosticCode.SelectionConfiguration,
				`Unknown modifier filter ${tag}. Use a standard or configured modifier name.`,
			);
		}
	}

	// Match exact release levels, not a threshold. Explicit absence checks preserve Public (zero).
	const items = classification.items
		.filter(
			(item) =>
				(item.releaseLevel === undefined
					? selection.includeUntagged === true
					: selection.releaseLevels.includes(item.releaseLevel)) &&
				requireTags.every((tag) => item.modifierTags.includes(tag)) &&
				excludeTags.every((tag) => !item.modifierTags.includes(tag)),
		)

		// Copy both records and tag arrays so freezing the result does not freeze caller-owned data.
		.map((item) => ({
			id: item.id,
			releaseLevel: item.releaseLevel,
			modifierTags: [...item.modifierTags],
		}))
		.sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
	return freezeData({ ok: true, value: { name: selection.name, items } });
}

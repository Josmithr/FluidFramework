import type { ApiClassification } from "./classification.js";
import type { ResolvedDocumentation, DocumentationLinkBinding } from "./documentation.js";
import type { AnalysisFacts, PackageDocumentationFact } from "./facts.js";
import type { DependencyModel } from "./dependencyModel.js";

/**
 * Resolved documentation with original metadata retained separately from inherited content.
 */
export interface CompletedDocumentation extends ResolvedDocumentation {
	/**
	 * Whether the resolved comment contains descriptive content, not merely metadata tags.
	 */
	readonly documented: boolean;

	/**
	 * Local block tags captured before inheritance, for output annotations.
	 */
	readonly originalBlockTags: readonly string[];
}

/**
 * Immutable semantic data shared by output generators for the currently supported analysis scope.
 *
 * @remarks
 * Contains no compiler objects, TSDoc nodes, or mutable construction indexes.
 * This internal graph is not a versioned serialized model.
 * Supported interface, property, and named namespace merges retain combined documentation and original link origins.
 * Broader structural merges and complete type-reference edges remain pending.
 */
export interface CompletedAnalysis {
	/**
	 * Package-owned documentation with validated targets, outside API-item classification.
	 * @defaultValue Omitted when no package comment was found.
	 */
	readonly packageDocumentation?: CompletedPackageDocumentation;

	/**
	 * Validated dependency documentation needed to retain external identities in generated models.
	 * @defaultValue Omitted for internal graphs without selected dependencies; generators treat it as an empty list.
	 */
	readonly dependencies?: readonly DependencyModel[];

	/**
	 * Original declaration, relationship, and export facts from compiler extraction.
	 */
	readonly facts: AnalysisFacts;

	/**
	 * Original release and custom metadata, unaffected by inheritance.
	 */
	readonly classification: ApiClassification;

	/**
	 * Resolved callable and single-declaration non-callable property comments, links, and inheritance paths in identifier order.
	 */
	readonly documentation: readonly CompletedDocumentation[];
}

/**
 * The single package comment and its validated link occurrences.
 */
export interface CompletedPackageDocumentation
	extends Omit<PackageDocumentationFact, "references"> {
	/**
	 * Links in comment traversal order, without a synthetic API-item source identity.
	 */
	readonly links: readonly Omit<DocumentationLinkBinding, "source">[];
}

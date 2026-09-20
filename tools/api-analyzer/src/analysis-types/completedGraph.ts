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
 * Supported merged declarations retain resolved contributions, section provenance, and original link origins.
 * Type-reference validation follows the configured suite boundary and does not revalidate inherited member views.
 * Complete portable type graphs and rollup data remain Stage 3 and Stage 4 work.
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
	 * Resolved declaration and member comments, links, section sources, and inheritance paths in identifier order.
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

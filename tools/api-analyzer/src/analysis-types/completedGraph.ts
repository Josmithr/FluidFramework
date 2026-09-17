import type { ApiClassification } from "./classification.js";
import type { ResolvedDocumentation } from "./documentation.js";
import type { AnalysisFacts } from "./facts.js";

/**
 * Resolved callable documentation with original metadata retained separately from inherited content.
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
 * General declaration documentation, complete type-reference edges, and per-section provenance remain pending.
 */
export interface CompletedAnalysis {
	/**
	 * Original declaration, relationship, and export facts from compiler extraction.
	 */
	readonly facts: AnalysisFacts;
	/**
	 * Original release and custom metadata, unaffected by inheritance.
	 */
	readonly classification: ApiClassification;
	/**
	 * Resolved callable comments, link targets, and inheritance paths in identifier order.
	 */
	readonly documentation: readonly CompletedDocumentation[];
}

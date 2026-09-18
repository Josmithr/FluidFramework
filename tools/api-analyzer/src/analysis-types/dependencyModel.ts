import type { ApiItemMetadata } from "./classification.js";
import type { CompletedDocumentation } from "./completedGraph.js";
import type { ApiItemId, FunctionParameterFact, Origin, InputFileFact } from "./facts.js";

/**
 * A versioned documentation target supplied by a dependency package.
 */
export interface DependencyApi {
	/**
	 * Documentation input identity scoped by the model's identity version.
	 */
	readonly id: ApiItemId;

	/**
	 * Owning declaration identity used to associate links and callable overloads.
	 */
	readonly declarationId: ApiItemId;

	/**
	 * Original declaration or member name, not necessarily its exported alias.
	 */
	readonly name: string;

	/**
	 * Compiler syntax-kind name of the original documentation input.
	 */
	readonly kind: string;

	/**
	 * Original comment location, unchanged by inheritance or re-exports.
	 */
	readonly origin: Origin;

	/**
	 * Original callable parameter names and flags for explicit inheritance compatibility.
	 * @defaultValue Omitted when callable parameter context is unavailable or inapplicable.
	 * An empty array represents a supported callable with no parameters; it is not equivalent to omission.
	 */
	readonly parameters?: readonly FunctionParameterFact[];

	/**
	 * Original callable type-parameter names in declaration order.
	 * @defaultValue Omitted together with parameters for non-callable or unavailable callable contexts.
	 * An empty array means that a supported callable declares no type parameters.
	 */
	readonly typeParameters?: readonly string[];

	/**
	 * Effective release and local custom-tag classification, not reclassified inherited documentation.
	 *
	 * @remarks
	 * Includes the declaring container's release level for an originally untagged member.
	 */
	readonly metadata: ApiItemMetadata;

	/**
	 * Resolved content, structured links, and section provenance supplied by the producing package.
	 */
	readonly documentation: CompletedDocumentation;
}

/**
 * An exported target path; callable targets retain overload order.
 */
export interface DependencyExport {
	/**
	 * The class or interface member side for this terminal path component.
	 * @defaultValue Omitted for top-level and namespace exports.
	 */
	readonly memberKind?: "static" | "instance";

	/**
	 * An enclosing namespace path used instead of recursively expanding this alias.
	 *
	 * @remarks
	 * Refers to a shorter prefix in the same entrypoint. Lookup replaces this alias prefix and continues through the target.
	 * @defaultValue Omitted when this path is expanded normally.
	 */
	readonly referencePath?: readonly string[];

	/**
	 * Configured entrypoint name that exposes the target path.
	 */
	readonly entrypoint: string;

	/**
	 * Exported names from the entrypoint through namespaces and members, preserving aliases.
	 */
	readonly path: readonly string[];

	/**
	 * Whether any export step on this path is type-only.
	 */
	readonly typeOnly: boolean;

	/**
	 * Documentation input identities in compiler overload order for callable targets.
	 */
	readonly items: readonly ApiItemId[];
}

/**
 * A referenced API whose documentation is owned by another selected package model.
 */
export interface ExternalDependencyApi {
	/**
	 * Target documentation input identity that the selected suite must supply.
	 */
	readonly id: ApiItemId;

	/**
	 * Package whose model owns the target identity.
	 */
	readonly packageName: string;
}

/**
 * A content fingerprint for a dependency model selected during analysis.
 *
 * @remarks
 * Selected models are recorded even when no retained API references their content.
 */
export interface DependencyModelInput {
	/**
	 * Package owning the model used by the producer.
	 */
	readonly packageName: string;

	/**
	 * A 256-bit Secure Hash Algorithm (SHA-256) digest of the model content.
	 *
	 * @remarks
	 * Serialization whitespace and object property order do not affect the digest.
	 * Array order is preserved because it carries overload and provenance information.
	 * The digest detects stale content; it does not authenticate the model.
	 */
	readonly sha256: string;
}

/**
 * The versioned dependency documentation format, not a restored analysis or compiler graph.
 */
export interface DependencyModel {
	/**
	 * Format discriminator checked before interpreting artifact records.
	 */
	readonly format: "api-analyzer-documentation";

	/**
	 * Structural schema version of this artifact.
	 */
	readonly version: 1;

	/**
	 * Version of the identity-generation rules used by this artifact.
	 */
	readonly identityVersion: 1;

	/**
	 * Compiler version used to produce identities and callable facts; decoding requires the supported version.
	 */
	readonly compilerVersion: string;

	/**
	 * Package owning the local API records in this artifact.
	 */
	readonly packageName: string;

	/**
	 * Analyzed package files used by root composition to reject stale installed models.
	 */
	readonly inputFiles: readonly InputFileFact[];

	/**
	 * Content fingerprints for all dependency models selected during analysis.
	 *
	 * @remarks
	 * Includes selected models that no retained API references.
	 * The array is empty when the producer analyzed without a dependency suite.
	 */
	readonly dependencyModels: readonly DependencyModelInput[];

	/**
	 * Standard and registered custom modifier vocabulary used to validate stored comments and selectors.
	 */
	readonly modifierTags: readonly string[];

	/**
	 * Local API records sorted by identity, including retained unexported documentation targets.
	 */
	readonly apis: readonly DependencyApi[];

	/**
	 * Exported paths used for qualified documentation lookup and alias preservation.
	 */
	readonly exports: readonly DependencyExport[];

	/**
	 * External identities whose owning models must also be present in the selected suite.
	 */
	readonly external: readonly ExternalDependencyApi[];
}

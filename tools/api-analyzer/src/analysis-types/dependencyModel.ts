import type { ReleaseLevel } from "./classification.js";
import type { ModelGraph, ModelOrigin } from "./modelGraph.js";

/**
 * Resolved API link occurrence retained in effective comment order.
 * @public
 */
export interface ModelLink {
	/**
	 * Original documentation input identity.
	 */
	readonly source: string;

	/**
	 * Index in the original comment's API links, excluding URL links.
	 */
	readonly linkIndex: number;

	/**
	 * Original TSDoc reference text, not a reference to resolve downstream.
	 */
	readonly reference: string;

	/**
	 * Target declaration identity.
	 */
	readonly target: string;

	/**
	 * Independently documented target identity.
	 */
	readonly targetSignature: string;

	/**
	 * Original comment location, unchanged by inheritance.
	 */
	readonly origin: ModelOrigin;
}

/**
 * Original documentation input that supplies a resolved section, including inherited content.
 *
 * @remarks
 * Records the section's source identity and package, not the section's text.
 * @public
 */
export interface ModelDocumentationSection {
	/**
	 * Section name, including the parameter name for parameter documentation.
	 */
	readonly section: string;

	/**
	 * Original documentation input identity, which can belong to another package.
	 */
	readonly source: string;

	/**
	 * Package that owns the original documentation input.
	 */
	readonly packageName: string;
}

/**
 * Fully resolved documentation and original-section provenance.
 * @public
 */
export interface ModelDocumentation {
	/**
	 * Receiving API identity.
	 */
	readonly id: string;

	/**
	 * Receiving API's package.
	 */
	readonly packageName: string;

	/**
	 * Resolved TSDoc comment, or undefined when no documentation is available.
	 */
	readonly documentation: string | undefined;

	/**
	 * Whether the resolved comment contains descriptive content.
	 */
	readonly documented: boolean;

	/**
	 * Block tags present on the original local comment, not inherited metadata.
	 */
	readonly originalBlockTags: readonly string[];

	/**
	 * Inheritance targets in resolution order.
	 */
	readonly inheritedFrom: readonly string[];

	/**
	 * Resolved API links in effective comment order.
	 */
	readonly links: readonly ModelLink[];

	/**
	 * Source identities for summary, remarks, and named parameter sections.
	 * Empty when the resolved comment supplies no sections.
	 */
	readonly sections: readonly ModelDocumentationSection[];
}

/**
 * The single package-owned comment, separate from declarations and entrypoints.
 * @public
 */
export interface ModelPackageDocumentation {
	/**
	 * Original package comment location.
	 */
	readonly origin: ModelOrigin;

	/**
	 * Package TSDoc comment, with no unresolved inheritance.
	 */
	readonly documentation: string;

	/**
	 * Resolved package links without a synthetic source API identity.
	 */
	readonly links: readonly Omit<ModelLink, "source">[];
}

/**
 * Original callable parameter information used to check explicit documentation inheritance.
 * @public
 */
export interface DependencyApiParameter {
	/**
	 * Original parameter name.
	 * @defaultValue Omitted for destructured parameters.
	 */
	readonly name?: string;

	/**
	 * Whether the parameter can be omitted.
	 */
	readonly optional: boolean;

	/**
	 * Whether the declaration uses a rest parameter.
	 */
	readonly rest: boolean;
}

/**
 * Release and modifier-tag classification of an original documentation input.
 *
 * @remarks
 * An originally untagged member uses its declaring container's release level.
 * Documentation inheritance does not change this classification.
 * @public
 */
export interface DependencyApiMetadata {
	/**
	 * Identity of the classified documentation input.
	 */
	readonly id: string;

	/**
	 * Original release classification, or undefined for a permitted untagged input.
	 */
	readonly releaseLevel: ReleaseLevel | undefined;

	/**
	 * Recognized original modifier tags, not tags copied through inheritance.
	 */
	readonly modifierTags: readonly string[];
}

/**
 * A versioned documentation target supplied by a dependency package.
 * @public
 */
export interface DependencyApi {
	/**
	 * Documentation input identity scoped by the model's identity version.
	 */
	readonly id: string;

	/**
	 * Owning declaration identity used to associate links and callable overloads.
	 */
	readonly declarationId: string;

	/**
	 * Original declaration or member name, not necessarily its exported alias.
	 */
	readonly name: string;

	/**
	 * Compiler syntax-kind name of the original documentation input.
	 */
	readonly kind: string;

	/**
	 * Original syntax kinds contributing to this documentation input, deduplicated in declaration order.
	 * Compound declarations retain every kind so named TSDoc selectors can validate their requested facet.
	 */
	readonly declarationKinds: readonly string[];

	/**
	 * Labels attached to original documentation, excluding inherited labels.
	 */
	readonly labels: readonly string[];

	/**
	 * Original comment location, unchanged by inheritance or re-exports.
	 */
	readonly origin: ModelOrigin;

	/**
	 * Original callable parameter names and flags for explicit inheritance compatibility.
	 *
	 * @remarks
	 * An empty array represents a supported callable with no parameters; it is not equivalent to omission.
	 *
	 * @defaultValue Omitted for non-callable documentation records. Callable signature records require this array.
	 */
	readonly parameters?: readonly DependencyApiParameter[];

	/**
	 * Original callable, class, interface, or type-alias type-parameter names in declaration order.
	 * @defaultValue Omitted for other non-callable forms or unavailable parameter contexts.
	 * An empty array means that a supported declaration declares no type parameters.
	 */
	readonly typeParameters?: readonly string[];

	/**
	 * Effective release and local custom-tag classification, not reclassified inherited documentation.
	 *
	 * @remarks
	 * Includes the declaring container's release level for an originally untagged member.
	 */
	readonly metadata: DependencyApiMetadata;

	/**
	 * Resolved content, structured links, and section provenance supplied by the producing package.
	 */
	readonly documentation: ModelDocumentation;
}

/**
 * An exported target path; callable targets retain overload order.
 * @public
 */
export interface DependencyExport {
	/**
	 * Unique symbol declaration used as this member's key.
	 * @defaultValue Omitted for ordinary exported names.
	 */
	readonly symbolId?: string;

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
	 * Compound functions prepend their declaration identity; numeric selection uses the following callable identities.
	 */
	readonly items: readonly string[];
}

/**
 * A referenced API whose documentation is owned by another selected package model.
 * @public
 */
export interface ExternalDependencyApi {
	/**
	 * Target documentation input identity that the selected suite must supply.
	 */
	readonly id: string;

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
 * @public
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
 * An analyzed package file and its content fingerprint, used to detect stale installed models.
 * @public
 */
export interface DependencyModelInputFile {
	/**
	 * Analyzed input path relative to the owning package root.
	 */
	readonly file: string;

	/**
	 * A 256-bit Secure Hash Algorithm (SHA-256) digest of the analyzed UTF-8 input text.
	 */
	readonly sha256: string;
}

/**
 * The versioned portable documentation format, not a restored analysis or compiler graph.
 * @sealed
 * @public
 */
export interface DependencyModel {
	/**
	 * Portable declaration shapes and resolved relationships for source-free documentation readers.
	 */
	readonly graph: ModelGraph;

	/**
	 * The owning package's documentation, separate from API records and entrypoint exports.
	 * @defaultValue Omitted when the package has no package documentation comment.
	 */
	readonly packageDocumentation?: ModelPackageDocumentation;

	/**
	 * Format discriminator checked before interpreting artifact records.
	 */
	readonly format: "api-analyzer-documentation";

	/**
	 * Structural schema version of this artifact.
	 * @remarks
	 * Remains 1 during initial development, including incompatible schema changes.
	 * No backward compatibility is promised; regenerate artifacts when the schema changes.
	 */
	readonly version: 1;

	/**
	 * Version of the identity-generation rules used by this artifact.
	 * @remarks
	 * Remains 1 during initial development, including changes to identity-generation rules.
	 * This value does not establish compatibility with earlier development artifacts.
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
	readonly inputFiles: readonly DependencyModelInputFile[];

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

import type { ApiItemSelection } from "./classification.js";

/**
 * A directional prohibition between independently selected source and target metadata.
 * @public
 */
export interface DirectionalReferenceRule {
	/**
	 * Nonempty diagnostic identity of this rule.
	 */
	readonly name: string;

	/**
	 * Source API metadata matched by the rule, independent of report selection.
	 */
	readonly source: Omit<ApiItemSelection, "name">;

	/**
	 * Target API metadata forbidden for a matching source; the reverse relationship is not implied.
	 */
	readonly target: Omit<ApiItemSelection, "name">;

	/**
	 * Whether this rule runs.
	 * @defaultValue `true`. Set to false to skip both selector evaluation and enforcement for this rule.
	 */
	readonly enabled?: boolean;
}

/**
 * Independent semantic reference checks, separate from report selection.
 * @public
 */
export interface ReferencePolicies {
	/**
	 * Whether to reject locally declared type references to less-public APIs using original release metadata.
	 * Inherited effective member views are not revalidated on each receiver.
	 * @defaultValue `false`. Release compatibility is not checked when omitted.
	 */
	readonly releaseCompatibility?: boolean;

	/**
	 * Whether same-package type targets must be exposed by the referring entrypoint.
	 * Dependency targets do not require consumer re-exports.
	 * @defaultValue `false`. Entrypoint exposure is not checked when omitted.
	 */
	readonly entrypointExposure?: boolean;

	/**
	 * Whether to reject explicit documentation inheritance from internal APIs by non-internal APIs.
	 * Does not disable the separate API-link visibility check.
	 * @defaultValue `false`. Explicit inheritance visibility is not checked when omitted.
	 */
	readonly inheritanceVisibility?: boolean;

	/**
	 * Configured directional prohibitions in diagnostic evaluation order.
	 * No repository-specific tags are built in.
	 * @defaultValue Omitted; no directional prohibitions are evaluated.
	 */
	readonly directional?: readonly DirectionalReferenceRule[];
}

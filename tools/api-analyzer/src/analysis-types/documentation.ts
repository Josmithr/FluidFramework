import type { ApiItemId, Origin } from "./facts.js";
import type { ApiItemMetadata } from "./classification.js";

/**
 * A local documentation comment and the name of the package that contains its declaration.
 */
export interface DocumentationInput {
	/**
	 * The identifier of the declaration or individual signature.
	 */
	readonly id: ApiItemId;
	/**
	 * The name of the package that contains the original comment.
	 *
	 * @remarks
	 * Do not replace this name with the name of a package that re-exports the declaration.
	 */
	readonly packageName: string;
	/**
	 * The local TSDoc comment, or `undefined` when no local comment exists.
	 */
	readonly documentation: string | undefined;
}

/**
 * An association between an explicit documentation inheritance request and its target.
 *
 * @remarks
 * This association is called a binding.
 * The internal reference binder creates bindings from supported compiler facts.
 * If you create a binding directly, resolve the target in the original comment's declaration scope.
 * Verify that the target signature and its parameters are compatible with the source signature.
 * Documentation resolution does not repeat these checks or rename inherited parameters.
 */
export interface DocumentationReferenceBinding {
	/**
	 * The identifier of the item that contains the inheritance request.
	 */
	readonly source: ApiItemId;
	/**
	 * The declaration reference in the format produced by TSDoc's `emitAsTsdoc()` method.
	 */
	readonly reference: string;
	/**
	 * The identifier of the target declaration or individual signature.
	 */
	readonly target: ApiItemId;
}

/**
 * A confidently selected non-overloaded member documentation source.
 *
 * @remarks
 * Callers must establish compiler compatibility and exclude overloaded or uncertain sources.
 * The resolver suppresses this binding when any local comment exists.
 */
export interface AutomaticDocumentationBinding {
	/**
	 * The receiving member identifier.
	 */
	readonly source: ApiItemId;
	/**
	 * The original source member identifier, not an instantiated view identifier.
	 */
	readonly target: ApiItemId;
}

/**
 * A validated API link occurrence in an original function comment.
 *
 * @remarks
 * Created by the internal compiler-backed binder and consumed by documentation resolution.
 * Manual bindings must pass the same original-scope and target-form checks as the binder.
 * Identifiers belong to the supplied analysis and are not portable model identities.
 */
export interface DocumentationLinkBinding {
	/**
	 * The identifier of the signature that contains the original comment.
	 */
	readonly source: ApiItemId;
	/**
	 * The zero-based API link index in TSDoc tree traversal order, excluding URL links.
	 */
	readonly linkIndex: number;
	/**
	 * The declaration reference printed by TSDoc, without the display label.
	 */
	readonly reference: string;
	/**
	 * The resolved declaration identifier, not its signature identifier.
	 */
	readonly target: ApiItemId;
	/**
	 * The target's single callable signature identifier used for original release classification.
	 */
	readonly targetSignature: ApiItemId;
	/**
	 * The original comment's location, independent of re-exporting entrypoints.
	 */
	readonly origin: Origin;
}

/**
 * Validated original API links and release metadata for content resolution.
 */
export interface DocumentationLinkValidation {
	/**
	 * One binding per API link in the supplied original comments, including repeated links.
	 *
	 * @remarks
	 * Use the compiler-backed binder or perform equivalent original-scope and target-form checks.
	 * The resolver trusts the binder's validated identities, occurrence indices, reference text, and scope.
	 * Bindings must belong to the same context and must not be modified after binding.
	 */
	readonly bindings: readonly DocumentationLinkBinding[];
	/**
	 * Original classification for all linked targets and receiving APIs, independent of report selection.
	 */
	readonly metadata: ReadonlyMap<ApiItemId, ApiItemMetadata>;
}

/**
 * Validated automatic inheritance and API link inputs for documentation resolution.
 */
export interface DocumentationResolutionOptions {
	/**
	 * Confident non-overloaded member bindings established from compiler relationships.
	 *
	 * @remarks
	 * Any local comment, including empty or tag-only TSDoc, suppresses automatic inheritance.
	 * Multiple distinct targets for one receiver are skipped rather than guessed.
	 * Supply original comments for every source and target, independently of report selection.
	 *
	 * @defaultValue Omitted. No automatic inheritance is requested.
	 */
	readonly automaticInheritance?: readonly AutomaticDocumentationBinding[];
	/**
	 * Original link bindings and classification required when comments contain API links.
	 *
	 * @defaultValue Omitted. Only comments without API links can be resolved.
	 */
	readonly linkValidation?: DocumentationLinkValidation;
}

/**
 * Documentation after the resolver applies explicit or validated automatic inheritance.
 */
export interface ResolvedDocumentation extends DocumentationInput {
	/**
	 * Validated links in effective comment traversal order, excluding links with URL destinations.
	 *
	 * @remarks
	 * Each binding retains its original source signature, link index, and location through inheritance.
	 * The containing result's identifier identifies the receiving API. Repeated references remain separate.
	 */
	readonly links: readonly DocumentationLinkBinding[];
	/**
	 * The comment printed by TSDoc after inheritance, or `undefined` when no local comment or target exists.
	 *
	 * @remarks
	 * The resolver copies the target's summary, remarks, parameter documentation,
	 * type-parameter documentation, and return documentation.
	 * Other blocks and modifier tags come from the local comment.
	 * Do not use this output to classify release levels.
	 * This text format can change. It is not a complete portable documentation model.
	 */
	readonly documentation: string | undefined;
	/**
	 * Target identifiers in traversal order, from the immediate target to the last target.
	 *
	 * @remarks
	 * Empty when no explicit or automatic inheritance is applied.
	 */
	readonly inheritedFrom: readonly ApiItemId[];
}

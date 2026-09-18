/*
 * Validates original-scope lookup for inherited effective method and property comments.
 * Generic substitution must preserve namespace lookup, explicit inheritance, and public-to-beta links.
 * An unrelated outer target makes incorrect receiver-scope lookup fail link policy.
 */

/**
 * Original beta lookup scope.
 * @beta
 */
// This namespace supplies original lookup scope for member views inherited outside the namespace.
export namespace OriginalMemberScope {
	/** Original link target. @beta */
	// Public inherited methods can link here, but not to the outer internal function with the same name.
	export declare function memberLinkTarget(): void;

	/** Base operation. See {@link memberLinkTarget}. @beta */
	// Explicit method inheritance must copy this link with its namespace-scoped origin.
	export declare function memberBase(value: string): string;

	// Substitution with string supplies compiler-compatible automatic property sources.
	export interface PropertySource<Value> {
		/** Property documentation. @beta */
		// An uncommented implementing property inherits this descriptive content.
		value: Value;
		/** Must not replace an empty local comment. @beta */
		// The matching implementation deliberately suppresses this text with empty TSDoc.
		empty: Value;
		/** Must not replace local metadata. @beta */
		// The matching implementation deliberately suppresses this text with a release tag alone.
		tagOnly: Value;
	}

	export interface Source<Value> {
		/** Linked property. See {@link memberLinkTarget}. @beta */
		// Property links keep their original lookup scope after generic substitution.
		readonly linkedProperty: Value;
		/** {@inheritDoc Source.linkedProperty} @beta */
		// This is the first explicit property inheritance step in the tested chain.
		readonly redirectedProperty: Value;
		/** Linked member. See {@link memberLinkTarget}. @beta */
		// Generic substitution must not change the original link lookup scope.
		linked(value: Value): Value;
		/** {@inheritDoc memberBase} @beta */
		// Retain the explicit lookup on both the original method and its inherited view.
		redirected(value: string): string;
	}
}

/** Public receiving view. @public */
// Method and property comments must resolve inside OriginalMemberScope after generic substitution.
export interface ScopedMemberReceiver extends OriginalMemberScope.Source<string> {}

/**
 * A public redirect container.
 * @public
 */
// The second property inheritance step must preserve the first source's link and section origins.
export interface PropertyRedirect {
	/** {@inheritDoc OriginalMemberScope.Source.redirectedProperty} @public */
	// A qualified local path identifies a property, not a callable signature.
	value: string;
}

/**
 * A public property implementation.
 * @public
 */
// A local uncommented property receives content only after a proven instantiated match.
export declare class PropertyImplementation
	implements OriginalMemberScope.PropertySource<string>
{
	// Absence of TSDoc permits automatic inheritance from the instantiated contract.
	value: string;
	/** */
	// Explicit empty TSDoc suppresses all automatic content copying.
	empty: string;
	/** @public */
	// Local metadata also suppresses automatic inheritance without becoming descriptive content.
	tagOnly: string;
}

/**
 * A public method implementation.
 * @public
 */
// One method tests automatic content inheritance; the local tag on the other suppresses it.
export declare class ScopedAutomaticReceiver implements OriginalMemberScope.Source<string> {
	/** @public */
	// Local tags prevent the property link from being copied automatically.
	readonly linkedProperty: string;
	/** @public */
	// The source's explicit request must not override this local suppression.
	readonly redirectedProperty: string;
	// The untagged member inherits its container's release level before its links are validated.
	linked(value: string): string;
	/** @public */
	// This method remains tag-only rather than inheriting its source's explicit request.
	redirected(value: string): string;
}

/** Unrelated outer target. @internal */
// Receiver-scope lookup would incorrectly reject a valid inherited public-to-beta link.
export declare function memberLinkTarget(): void;

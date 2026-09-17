/*
 * Selects the second callable overload explicitly, without inferring signature compatibility.
 * Method chains preserve inherited link origins, and static/instance collisions remain unsupported.
 */

/** Number overload. @public */
// Callable declaration order makes the string signature overload 2, not overload 1.
export declare function base(value: number): number;
/** String overload. @public */
export declare function base(value: string): string;
/** {@inheritDoc (base:2)} @public */
// The explicit selector chooses the overload whose parameter name and shape match the receiver.
export declare function derived(value: string): string;

export interface MethodSource {
	/** Number method. @public */
	// Only the second overload supplies the link that must survive both inheritance steps.
	operation(value: number): number;
	/** String method. See {@link methodLink}. @public */
	operation(value: string): string;
}

export interface MethodRedirect {
	/** {@inheritDoc MethodSource.(operation:2)} @public */
	// A terminal numeric selector resolves an interface method, not a standalone function.
	operation(value: string): string;
}

/** {@inheritDoc MethodRedirect.operation} @public */
// This second step needs no selector because MethodRedirect has only one callable signature.
export declare function fromMethod(value: string): string;

/** Method link destination. @beta */
// A public receiver may inherit a link to the original beta target.
export declare function methodLink(): void;

export declare class AmbiguousMethodScope {
	// Both sides expose the same name; an unqualified path must not silently choose the instance member.
	static operation(value: string): string;
	operation(value: string): string;
}

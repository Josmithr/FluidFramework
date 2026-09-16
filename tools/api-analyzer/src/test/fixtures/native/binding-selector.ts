/*
 * Selects the second callable overload explicitly, without inferring signature compatibility.
 */

/** Number overload. @public */
export declare function base(value: number): number;
/** String overload. @public */
export declare function base(value: string): string;
/** {@inheritDoc (base:2)} @public */
export declare function derived(value: string): string;

export interface MethodSource {
	/** Number method. @public */
	operation(value: number): number;
	/** String method. See {@link methodLink}. @public */
	operation(value: string): string;
}

export interface MethodRedirect {
	/** {@inheritDoc MethodSource.(operation:2)} @public */
	operation(value: string): string;
}

/** {@inheritDoc MethodRedirect.operation} @public */
export declare function fromMethod(value: string): string;

/** Method link destination. @beta */
export declare function methodLink(): void;

export declare class AmbiguousMethodScope {
	static operation(value: string): string;
	operation(value: string): string;
}

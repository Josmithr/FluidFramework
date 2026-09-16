/*
 * Preserves original comments for class and interface declarations and their members.
 * Inherited members retain their source comments, while local overrides remain local.
 * Overloads and merged interfaces must retain separate comments instead of choosing one.
 */

/** Base contract. @public */
export interface DocumentedBase<Value> {
	/** Inherited value. @public */
	value: Value;
	/** Base operation. @public */
	convert(value: Value): Value;
	/** Inherited generic operation. @public */
	forward(value: Value): Value;
}

/** Derived contract. @beta */
export interface DocumentedDerived extends DocumentedBase<string> {
	/** */
	convert(value: string): string;
	/** @public */
	tagOnly: string;
	absent: string;
	// Ordinary comments are not documentation.
	ordinary: string;
	/** String overload. @public */
	parse(value: string): string;
	/** Number overload. @internal */
	parse(value: number): number;
	/** Optional operation. @public */
	optionalOperation?(value: string): string;
	/** Callable property, not the call signature's own comment. @public */
	callback: (value: string) => string;
}

/** First declaration. @public */
export interface DocumentedMerged {
	/** First member declaration. @public */
	shared: string;
}

/** Second declaration. @beta */
export interface DocumentedMerged {
	/** Second member declaration. @beta */
	shared: string;
}

/** Base class. @public */
export declare class DocumentedClassBase {
	/** Inherited class value. @public */
	value: string;
	/** Base class operation. @public */
	convert(value: string): string;
}

/** Derived class. @public */
export declare class DocumentedClass extends DocumentedClassBase {
	convert(value: string): string;
}

/** Hidden root contract. @internal */
interface HiddenRoot<Value> {
	/** Root operation. @public */
	root(value: Value): Value;
}

interface HiddenLeft extends HiddenRoot<string> {}

interface HiddenRight extends HiddenRoot<string> {}

/** Diamond contract. @public */
export interface DocumentedDiamond extends HiddenLeft, HiddenRight {}

/** Implemented contract. @public */
export declare class DocumentedImplementation
	implements HiddenRoot<string>, HiddenImplementationOnly<string>
{
	root(value: string): string;
}

/** Implementation-only contract. @internal */
interface HiddenImplementationOnly<Value> {
	/** Implementation-only operation. @public */
	root(value: Value): Value;
	/** Optional contract property. @public */
	optionalContractProperty?: Value;
}

type HiddenImplementationAlias = HiddenImplementationOnly<string>;

/** Alias implementation. @public */
export declare class DocumentedAliasImplementation implements HiddenImplementationAlias {
	root(value: string): string;
}

/** Inherited implementation. @public */
export declare class DocumentedImplementationDerived extends DocumentedImplementation {}

/** Generic overload contract. @public */
export interface GenericOverloadContract {
	/** Maps an array. @public */
	map<Value>(value: Value[]): Value[];
	/** Maps a scalar. @public */
	map<Value>(value: Value): Value;
}

/** Generic overload implementation. @public */
export declare class GenericOverloadImplementation implements GenericOverloadContract {
	map<Value>(value: Value): Value;
	map<Value>(value: Value[]): Value[];
}

export declare class RenamedImplementation implements HiddenRoot<string> {
	root(renamed: string): string;
}

interface SingleCallContract {
	/** Single source. @public */
	operation(value: string): string;
}

export declare class OverloadedReceiver implements SingleCallContract {
	operation(value: string): string;
	operation(value: number): string;
}

interface OverloadedSource {
	/** String source. @public */
	operation(value: string): string;
	/** Number source. @public */
	operation(value: number): string;
}

export declare class SingleCallReceiver implements OverloadedSource {
	operation(value: string | number): string;
}

export declare class UnconstrainedReceiver implements SingleCallContract {
	operation(value: unknown): string;
}

export declare class DocumentedAliasDerived extends DocumentedAliasImplementation {}

export declare class DiamondImplementation implements HiddenLeft, HiddenRight {
	root(value: string): string;
}

export declare class EmptyImplementation implements HiddenRoot<string> {
	/** */
	root(value: string): string;
}

export declare class TagOnlyImplementation implements HiddenRoot<string> {
	/** @public */
	root(value: string): string;
}

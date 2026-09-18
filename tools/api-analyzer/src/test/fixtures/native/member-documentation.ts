/*
 * Preserves original comments for class and interface declarations and their members.
 * Inherited members retain their source comments, while local overrides remain local.
 * Overloads and merged interfaces must retain separate comments instead of choosing one.
 */

/** Base contract. @public */
// Generic source members must retain their original comments after substitution with string.
export interface DocumentedBase<Value> {
	/** Inherited value. @public */
	value: Value;
	/** Base operation. @public */
	convert(value: Value): Value;
	/** Inherited generic operation. @public */
	// Unlike convert, this method has no local override in DocumentedDerived.
	forward(value: Value): Value;
}

/** Derived contract. @beta */
// This type combines inherited members with local comments that must remain distinct.
export interface DocumentedDerived extends DocumentedBase<string> {
	/** */
	// An explicit empty comment suppresses automatic inheritance from the base method.
	convert(value: string): string;
	/** @public */
	// A release tag is local documentation even when it contains no descriptive text.
	tagOnly: string;
	// No attached TSDoc must remain distinguishable from an empty or tag-only comment.
	absent: string;
	// Ordinary comments are not documentation.
	ordinary: string;
	/** String overload. @public */
	// Each overload has independent documentation, release metadata, and signature identity.
	parse(value: string): string;
	/** Number overload. @internal */
	parse(value: number): number;
	/** Optional operation. @public */
	// Removing undefined from an optional method's type must preserve its callable signature.
	optionalOperation?(value: string): string;
	/** Callable property, not the call signature's own comment. @public */
	// The property's comment must not be assigned to its function type's call signature.
	callback: (value: string) => string;
}

/** First declaration. @public */
// Merging must retain both source records rather than choose one declaration's comment or release tag.
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
	// This uncommented override can inherit content later, but extraction must not copy it.
	convert(value: string): string;
}

/** Hidden root contract. @public */
// Unexported bases must be collected for reference resolution without becoming entrypoint exports.
interface HiddenRoot<Value> {
	/** Root operation. @public */
	root(value: Value): Value;
}

// Both paths lead to the same original root member, not two competing documentation sources.
interface HiddenLeft extends HiddenRoot<string> {}

interface HiddenRight extends HiddenRoot<string> {}

/** Diamond contract. @public */
export interface DocumentedDiamond extends HiddenLeft, HiddenRight {}

/** Implemented contract. @public */
// Two compatible contracts provide distinct root comments; automatic inheritance must not choose one.
export declare class DocumentedImplementation
	implements HiddenRoot<string>, HiddenImplementationOnly<string>
{
	root(value: string): string;
}

/** Implementation-only contract. @public */
interface HiddenImplementationOnly<Value> {
	/** Implementation-only operation. @public */
	root(value: Value): Value;
	/** Optional contract property. @public */
	// An optional implemented member must not be added to the class's own effective members.
	optionalContractProperty?: Value;
}

// Keep this alias as the implements target while retaining its substituted member view separately.
type HiddenImplementationAlias = HiddenImplementationOnly<string>;

/** Alias implementation. @public */
export declare class DocumentedAliasImplementation implements HiddenImplementationAlias {
	root(value: string): string;
}

/** Inherited implementation. @public */
// A derived class must not repeat the implements clauses declared only on its base class.
export declare class DocumentedImplementationDerived extends DocumentedImplementation {}

/** Generic overload contract. @public */
// The corresponding implementation reverses overload order and declares independent type parameters.
// This probes compiler compatibility; declaration position cannot establish a semantic match.
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
	// Assignable types do not make documentation reusable when the parameter name changes.
	root(renamed: string): string;
}

// A single source isolates the overloaded-receiver and unconstrained-type rejection cases below.
/**
 * A public source container.
 * @public
 */
interface SingleCallContract {
	/** Single source. @public */
	operation(value: string): string;
}

export declare class OverloadedReceiver implements SingleCallContract {
	// An overloaded receiver must not inherit automatically from a single callable source.
	operation(value: string): string;
	operation(value: number): string;
}

// Distinct overload comments must not be combined into documentation for a single receiving signature.
/**
 * A public overload container.
 * @public
 */
interface OverloadedSource {
	/** String source. @public */
	operation(value: string): string;
	/** Number source. @public */
	operation(value: number): string;
}

export declare class SingleCallReceiver implements OverloadedSource {
	// This accepts both source parameter types, but automatic overload-source selection is excluded.
	operation(value: string | number): string;
}

export declare class UnconstrainedReceiver implements SingleCallContract {
	// Whole-method assignability is insufficient: unknown does not establish matching parameter semantics.
	operation(value: unknown): string;
}

// The documentation source chain passes through a class that implements a type alias.
export declare class DocumentedAliasDerived extends DocumentedAliasImplementation {}

export declare class DiamondImplementation implements HiddenLeft, HiddenRight {
	// The two implemented paths identify one original source and can supply documentation unambiguously.
	root(value: string): string;
}

export declare class EmptyImplementation implements HiddenRoot<string> {
	/** */
	// Empty local TSDoc suppresses the otherwise compatible implemented source.
	root(value: string): string;
}

/**
 * A public receiver whose local comment suppresses documentation inheritance.
 * @public
 */
export declare class TagOnlyImplementation implements HiddenRoot<string> {
	/** @public */
	// Tag-only local TSDoc also suppresses automatic content inheritance.
	root(value: string): string;
}

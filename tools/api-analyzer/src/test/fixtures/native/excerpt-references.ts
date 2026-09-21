/*
 * Exercises producer-resolved excerpt tokens for aliases, qualified names, local binders, and substitution.
 * Requires excerpt-base.ts and signature-views.ts; same-spelled identifiers must not select the wrong target.
 */
import type { GenericBase } from "./excerpt-base.js";
import type { View as ImportedView } from "./signature-views.js";

/**
 * Receiver-file value, distinct from the base-file value.
 * @public
 */
export interface Value { local: string; }

/**
 * Value-space declaration sharing the interface name.
 * @public
 */
export declare const Value: { local: string };

/**
 * Receiver whose effective members use this file's Value in the base declaration's print scope.
 * @public
 */
export interface Receiver extends GenericBase<Value> {}

/**
 * Separate namespace to test qualified names.
 * @public
 */
export namespace Nested {
	/**
	 * Named namespace value.
	 */
	export interface Value { nested: boolean; }
}

/**
 * Repeated type names refer to different declarations.
 * @public
 */
export declare function qualified(value: Value, nested: Nested.Value): Value | Nested.Value;

/**
 * An alias must link to the original declaration, not a new alias API.
 * @public
 */
export declare function aliased(value: ImportedView): ImportedView;

/**
 * An explicit import type has no local binding for its qualifier.
 * @public
 */
export declare function imported(value: import("./signature-views.js").View): import("./signature-views.js").View;

/**
 * A type parameter shadows the package API; only its constraint refers to that API.
 * @public
 */
export declare function shadow<Value extends ImportedView>(value: Value): Value;

/**
 * A type parameter does not shadow the value-space target of a type query.
 * @public
 */
export declare function query<Value>(): typeof Value;

/**
 * Nested function binders do not change the outer Value reference.
 * @public
 */
export declare function nested(callback: <Value>(value: Value) => Value): Value;

/**
 * Mapped keys are local bindings, not references to the package Value interface.
 * @public
 */
export declare function mapped<Item>(value: { [Value in keyof Item]: Value }): Value;

/**
 * An inferred type parameter applies only to the true branch of a conditional type.
 * @public
 */
export declare function conditional<Item>(value: Item): Item extends infer Value ? Value : Value;

/**
 * Alias syntax must link both the local and qualified type occurrences.
 * @public
 */
export type Pair = readonly [Value, Nested.Value];

/**
 * Variable syntax retains a link to the alias rather than expanding it for display.
 * @public
 */
export declare const pair: Pair;

/**
 * Separately stored declaration members need their own linked source excerpts.
 * @public
 */
export declare class Special {
	/**
	 * Accepts a local value.
	 */
	constructor(value: Value);
	/**
	 * Current value.
	 */
	get current(): Value;
	set current(value: Value);
	/**
	 * Creates an instance.
	 */
	static create(value: Value): Special;
	/**
	 * Named values.
	 */
	readonly [key: string]: Value;
}

/**
 * Type queries can link a static member declaration rather than its containing class.
 * @public
 */
export declare function staticQuery(): typeof Special.create;

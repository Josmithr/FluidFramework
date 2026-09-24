// Exercises import filtering for selected APIs without expanding the external package.
import DefaultInput, { type Input as NamedInput, type Preview, type Unused, token, key } from "dependency";
import type * as Types from "dependency";

/**
 * Uses two import forms and a value query.
 * @public
 */
export declare function consume(value: DefaultInput, other: NamedInput): typeof token;

/**
 * Selects the stable overload independently.
 * @public
 */
export declare function choose(value: NamedInput): NamedInput;
/**
 * Selects the preview overload independently.
 * @beta
 */
export declare function choose(value: Preview): Preview;

/**
 * Retains imports from complete namespace contents.
 * @public
 */
export namespace Group {
	/**
	 * Uses a namespace import in a nested alias.
	 */
	export type Nested = Types.Input;
}

/**
 * Retains header and declared-member imports.
 * @public
 */
export declare class Box<Value extends NamedInput> {
	/**
	 * Constructs the container.
	 */
	constructor(value: DefaultInput);
	/**
	 * Imported computed key.
	 */
	[key]: Value;
}

/**
 * Keeps an explicit import expression without adding a local binding.
 * @public
 */
export type Inline = import("dependency").Input;

/**
 * A local binder must not retain the unused import of the same name.
 * @public
 */
export declare function shadow<Unused>(value: Unused): Unused;

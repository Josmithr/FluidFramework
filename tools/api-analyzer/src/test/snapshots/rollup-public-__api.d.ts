import type { Input as Input } from "foreign";

import * as foreignNamespace from "foreign";

export declare namespace __api {
/** Selected namespace with a type-only class alias. @public @sealed */

export namespace All {
import alias_0 = foreignNamespace.ForeignClass;
export type { alias_0 as ForeignClass };
import alias_1 = __api.Store;
export { alias_1 as Store };
import alias_2 = __api.Store;
export type { alias_2 as StoreType };
import alias_3 = __api.atomic;
export { alias_3 as atomic };
}

/** Resolves a local import-type expression before files are removed. @public */
export type LocalImport = Item_1;

/** Retains the complete local module type after relocation. @public */
export type LocalModule = typeof moduleNamespace;

/** Nominal value. @public */
export class Store {
	private state;
	/** Reads the value. */
	read(): Support;
}

/** Supporting shape, not a package export. @public */
export interface Support {
	readonly value: string;
}

/** Atomic namespace callable, selected through its container. @public */
export function atomic(value: string): string;

/** Second atomic namespace overload. @public */
export function atomic(value: number): number;

/** Uses an external dependency without bundling it. @public */
export function external(input: Input): string;

/** Multiple bindings retain their individual identities. @public */
export /* Preserve  modifier comment spacing. */ const first: "first";

/** Public overload. @public */
export function overloaded(value: string): string;

/** Keeps imported names distinct from a local type parameter. @public */
export function pair<Item>(left: Item_1, right: Item_2, value: Item): [Item_1, Item_2, Item];

/**
 * Reads a value.
 * @param input - Value to read.
 * @returns The stored text.
 * @public
 */
export // Preserve the line-comment boundary.
	function read_1(input: Support): string;

/** Multiple bindings retain their individual identities. @public */
export /* Preserve  modifier comment spacing. */ const second: "second";

/* Supplies one of two same-named declarations whose identities must remain distinct. */

/** Left input. @public */
export interface Item_1 { readonly left: string; }

/* Supplies a distinct same-named declaration to test bound-reference renaming. */

/** Right input. @public */
export interface Item_2 { readonly right: number; }

export namespace moduleNamespace {
import alias_0 = __api.Store;
export { alias_0 as Store };
import alias_1 = __api.atomic;
export { alias_1 as atomic };
import alias_2 = __api.Store;
export type { alias_2 as StoreType };
import alias_3 = foreignNamespace.ForeignClass;
export type { alias_3 as ForeignClass };
}
}

/* Tests detached declaration generation, supporting-type closure, and release trimming. */

/**
 * Package overview retained in every generated entrypoint.
 * @privateRemarks
 * Private package implementation note.
 * @packageDocumentation
 */

import type { Item as Left } from "./left.js";
import type { Item as Right } from "./right.js";
import type { Input, PreviewOnly } from "foreign";
import * as LocalNamespace from "./second.js";

/** Retains the complete local module type after relocation. @public */
export type LocalModule = typeof LocalNamespace;

/** Uses an external dependency without bundling it. @public */
export
	declare   function external(input: Input): string;

/** Uses an import needed only by an excluded API. @beta */
export declare function externalPreview(input: PreviewOnly): number;

/** Resolves a local import-type expression before files are removed. @public */
export type LocalImport = import("./left.js").Item;

export * as Foreign from "foreign";

/** Keeps imported names distinct from a local type parameter. @public */
export declare function pair<Item>(left: Left, right: Right, value: Item): [Left, Right, Item];

/** Selected namespace with a type-only class alias. @public @sealed */
export * as All from "./second.js";

/** Public overload. @public */
export declare function overloaded(value: string): string;
/** Excluded overload. @beta */
export declare function overloaded(value: number): number;

/** Atomic namespace callable, selected through its container. @public */
export declare function atomic(value: string): string;
/** Second atomic namespace overload. @public */
export declare function atomic(value: number): number;

/** Multiple bindings retain their individual identities. @public */
export /* Preserve  modifier comment spacing. */ declare	const first: "first", second: "second";

/** Supporting shape, not a package export. @public */
interface Support {
	readonly value: string;
}

/**
 * Reads a value.
 * @param input - Value to read.
 * @returns The stored text.
 * @privateRemarks
 * This implementation note must never be published.
 * @public
 */
export // Preserve the line-comment boundary.
	declare function read(input: Support): string;

/** Preview API. @beta */
export declare function preview(): number;

/** Nominal value. @public */
export declare class Store {
	private state;
	/** Reads the value. */
	read(): Support;
}

export type { Store as StoreType };

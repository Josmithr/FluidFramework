/*
 * Supplies type-only export paths for chain.ts and an interface merged with a namespace.
 * Collection must retain both Merged declarations and its exported label.
 * The unresolved conditional type Deferred must report partial member expansion.
 */

export type { Identity as OnlyIdentity } from "./api.js";
export type * from "./api.js";
export interface Merged {
	property: string;
}
export namespace Merged {
	export const label: string = "label";
}
export type Deferred<Value> = Value extends string ? { text: Value } : { value: Value };

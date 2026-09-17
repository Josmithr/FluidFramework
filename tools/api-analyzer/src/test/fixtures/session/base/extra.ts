/*
 * Supplies type-only export paths for chain.ts and an interface merged with a namespace.
 * Collection must retain both Merged declarations and its exported label.
 * The unresolved conditional type Deferred must report partial member expansion.
 */

// A later value-form re-export must not restore the value side removed by this type-only alias.
export type { Identity as OnlyIdentity } from "./api.js";
// Type-only restrictions must also survive a later ordinary star export.
export type * from "./api.js";
// The interface and namespace share a symbol but contribute separate source declarations.
export interface Merged {
	property: string;
}
export namespace Merged {
	// This namespace member must be collected as an export, not confused with the interface property.
	export const label: string = "label";
}
// Without a concrete Value argument, neither branch is a complete effective member view.
export type Deferred<Value> = Value extends string ? { text: Value } : { value: Value };

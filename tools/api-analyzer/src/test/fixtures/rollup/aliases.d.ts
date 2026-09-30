/* Tests that public alias names do not change when the generator renames their targets. */

import type { Item } from "./local.js";

/** @public */
export interface Api {
	value: Item;
	nested: import("./local.js").Local.Item;
}
/** @public */
export type Module = typeof import("./right.js");

/** @public */
export * as External from "./external.js";

/** @public */
declare class Original { private brand; }

declare global {
	interface String { extra(): Original; }
}

/** @public */
declare namespace global { interface Ordinary { ordinary: true; } }
export { global as OrdinaryModule };

/** @public */
declare namespace Source {
	interface Item { value: string; }
	class Value { private brand; readonly value: string; }
}

/** @public */
// A top-level alias must keep its member path when Source is relocated.
export import PublicItem = Source.Item;

/** @public */
export import PublicValue = Source.Value;
/** @public */
export import OtherValue = Source.Value;

/** @public */
// The type parameter forces the namespace root to receive a different output name.
export declare function useAlias<Source>(item: PublicItem, value: Source): PublicItem;

/** @public */
declare namespace Aliases {
	export { Original as Alias };
	export { Original };
	export import Namespace = Source;
}
export { Aliases };

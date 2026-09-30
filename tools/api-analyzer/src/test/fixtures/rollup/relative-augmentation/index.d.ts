/* Loads both augmentation modules and exposes their targets to consumer.ts. */
import "./augmentation.js";
import "./nested/augmentation.js";
export { Item, Store, Nested } from "./local.js";
export type { Item as OtherItem } from "./other.js";
/** @public */
// The module query must still expose the augmented class after relocation.
export type Module = typeof import("./local.js");
/** @public */
// The generic parameter must remain distinct from the relocated class name.
export declare function collide<Store>(value: Store): Store;
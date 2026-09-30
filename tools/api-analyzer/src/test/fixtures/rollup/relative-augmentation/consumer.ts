/* Checks original and generated declarations through root and subpath package exports. */
import { Store, collide } from "relative-package";
import type { Item, OtherItem, Nested, Module } from "relative-package";
import { Store as OtherStore } from "relative-package/second";
// Both entrypoints must expose the same private class identity.
const store: Store = new OtherStore();
const item: Item = { value: "x", extra: 1, related: { other: true }, store };
const extra: number = item.extra;
const repeated: true = store.repeated;
const support = store.read();
const state: true = support.support;
const shape: Nested.Shape = { base: "x", added: 1 };
declare const module: Module;
// Module queries must retain the class constructor and its identity.
const fromQuery: Store = new module.Store();
const collision: boolean = collide(true);
// @ts-expect-error Private support identity must survive relocation.
const invalidSupport: typeof support = { support: true };
// @ts-expect-error The other module's Item must not receive this augmentation.
const invalidOther: OtherItem = { other: true, extra: 1 };
// @ts-expect-error The class must retain its private identity.
const invalidStore: Store = { value: "x", repeated: true, read: () => support };

/* Validates public exports, private supporting declarations, and nominal class identity. */

import { read, Store, pair, All, external, Foreign } from "./index.js";
import type { LocalImport, LocalModule } from "./index.js";
import type { StoreType } from "./index.js";
import { Store as SecondStore } from "./second.js";
import { overloaded, first, second } from "./index.js";

const selectedOverload: string = overloaded("text");
const firstValue: "first" = first;
const secondValue: "second" = second;
void [selectedOverload, firstValue, secondValue];
// @ts-expect-error Excluded standalone overloads must not remain callable.
overloaded(1);

const store: StoreType = new Store();
const shared: Store = new SecondStore();
const fromNamespace: Store = new All.Store();
const moduleShape: LocalModule = All;
const moduleStore: Store = new moduleShape.Store();
void moduleStore;
const typeFromNamespace: All.StoreType = store;
const paired = pair({ left: "text" }, { right: 1 }, true);
const left: string = paired[0].left;
const right: number = paired[1].right;
const payload: boolean = paired[2];
void [fromNamespace, typeFromNamespace, left, right, payload];
const imported: LocalImport = { left: "local" };
const foreign: All.ForeignClass = new Foreign.ForeignClass();
const externalText: string = external({ text: foreign.value });
void [imported, foreign, externalText];
// @ts-expect-error Namespace type-only aliases must not regain their runtime values.
new All.StoreType();
void shared;
const value: string = read(store.read());
void value;

// @ts-expect-error Supporting types must not become package exports.
import type { Support } from "./index.js";
// @ts-expect-error Beta APIs must not appear in the public rollup.
import { preview } from "./index.js";
// @ts-expect-error Type-only aliases must not regain their runtime values.
new StoreType();
// @ts-expect-error Private members preserve nominal identity.
const invalid: Store = { read: () => ({ value: "text" }) };
void invalid;

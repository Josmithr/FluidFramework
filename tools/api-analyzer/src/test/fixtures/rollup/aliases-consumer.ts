/* Checks that generated declarations keep public alias names and class identity. */

import { Aliases, External } from "./index.js";
import type { Api, Module, OrdinaryModule } from "./index.js";

const value: Aliases.Alias = new Aliases.Original();
const item: Aliases.Namespace.Item = { value: "text" };
const api: Api = { value: item, nested: item };
const module: Module = {};
const external: string = External.value;
const augmented: Aliases.Alias = "".extra();
const ordinary: OrdinaryModule.Ordinary = { ordinary: true };
void [value, item, api, module, external, augmented, ordinary];

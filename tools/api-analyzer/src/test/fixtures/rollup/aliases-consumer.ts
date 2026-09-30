/* Checks that generated declarations keep public alias names and class identity. */

import { Aliases, External, PublicValue, OtherValue, useAlias } from "./index.js";
import type { Api, Module, OrdinaryModule, PublicItem } from "./index.js";

const value: Aliases.Alias = new Aliases.Original();
const item: Aliases.Namespace.Item = { value: "text" };
const publicItem: PublicItem = item;
const aliasResult: PublicItem = useAlias(publicItem, true);
const nominal: PublicValue = new OtherValue();
// @ts-expect-error Both exported aliases must retain the class's private identity.
const invalidNominal: PublicValue = { value: "text" };
const api: Api = { value: item, nested: item };
const module: Module = {};
const external: string = External.value;
const augmented: Aliases.Alias = "".extra();
const ordinary: OrdinaryModule.Ordinary = { ordinary: true };
void [value, item, publicItem, aliasResult, nominal, invalidNominal, api, module, external, augmented, ordinary];

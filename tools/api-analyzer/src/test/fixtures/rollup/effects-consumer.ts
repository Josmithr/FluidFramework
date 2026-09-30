/* Checks side-effect imports and module extensions through a package entrypoint. */

import "effects-package";
import type { Input } from "foreign";

declare const global: RollupGlobal;
declare const input: Input;
const tag: "effects" = global.tag;
const extra: number = input.extra;
const support = input.support();
const value: string = support.value;
// @ts-expect-error Relocation must preserve the supporting class's private identity.
const invalid: typeof support = { value: "text" };
void [tag, extra, value, invalid];

/* Checks selected overloads, aliases, type-only exports, and dependency nominal identity. */

import { convert, renamed, preserve, ResultValue, compound } from "./index.js";
import type { ConvertType, Output } from "./index.js";
import { ResultValue as DependencyResult } from "dependency";

const text: string = convert("text");
const booleanValue: boolean = convert(true);
const alias: typeof convert = renamed;
const callable: typeof ConvertType = convert;
const original = new DependencyResult();
const result: Output = preserve(original);
const sameIdentity: DependencyResult = new ResultValue();
const generic: typeof original = preserve(original);
const version: string = compound.version;
const untrimmed: number = compound(1);
void [text, booleanValue, alias, callable, result, sameIdentity, generic, version, untrimmed];

// @ts-expect-error The public rollup must not expose the number overload.
convert(1);
// @ts-expect-error Renamed bindings must not expose excluded overloads either.
renamed(1);
// @ts-expect-error The generic nominal signature must not accept a number.
preserve(1);
// @ts-expect-error Private state must not be replaced with a structural copy.
preserve({ value: "text" });
// @ts-expect-error A type-only function alias must not become a callable value.
ConvertType("text");

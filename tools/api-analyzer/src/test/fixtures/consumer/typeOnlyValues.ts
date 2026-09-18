/*
 * Compiles against original and report-rendered declarations with TS6 and TS7.
 * Type-only enum aliases remain usable as types; constants remain usable in type queries.
 */
import { ValueMode, valueVersion, TypeMode, typeVersion } from "./type-only-values.js";
import { ChainedMode, chainedVersion, ValueMode as StarMode, valueVersion as starVersion } from "./type-only-forward.js";

const direct: TypeMode = ValueMode.Visible;
const chained: ChainedMode = ValueMode.Hidden;
const fromStar: StarMode = ValueMode.Visible;
const directVersion: typeof typeVersion = valueVersion;
const chainedVersionType: typeof chainedVersion = valueVersion;
const starVersionType: typeof starVersion = valueVersion;
const literal: "v1" = directVersion;
void [direct, chained, fromStar, chainedVersionType, starVersionType, literal];

// @ts-expect-error Type-only enum aliases cannot supply runtime values.
TypeMode.Visible;
// @ts-expect-error A regular re-export must not restore value access.
ChainedMode.Hidden;
// @ts-expect-error A type-only star export removes value access to the enum.
StarMode.Visible;
// @ts-expect-error Type-only constant aliases permit typeof, not value use.
void typeVersion;
// @ts-expect-error The constant remains type-only through a regular re-export.
void chainedVersion;
// @ts-expect-error A type-only star export removes value access to the constant.
void starVersion;

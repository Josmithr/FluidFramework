/*
 * Exposes the same enum and constant through value and type-only aliases.
 * The original declarations come from the existing report-member fixture.
 */
export { Mode as ValueMode, version as valueVersion } from "./report-members.js";
export type { Mode as TypeMode, version as typeVersion } from "./report-members.js";
export type { Mode, version } from "./report-members.js";

/**
 * Recursive type whose own export name remains usable in member references.
 * @public
 */
interface RecursiveItem { next?: RecursiveItem; }

/**
 * Type-only class whose methods refer to its original name.
 * @public
 */
declare class TypeOnlyBox {
	item: RecursiveItem;
	clone(): TypeOnlyBox;
}

export type { RecursiveItem, TypeOnlyBox };

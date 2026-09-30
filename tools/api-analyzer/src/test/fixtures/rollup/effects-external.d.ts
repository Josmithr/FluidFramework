/* Supplies a global type only when this external module is imported. */

declare global {
	interface RollupGlobal { readonly tag: "effects"; }
}
export {};

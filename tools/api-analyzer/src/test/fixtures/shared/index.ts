/*
 * Validates renamed value exports, type-only aliases, and namespace exports of the shared API.
 * Export names and restrictions must remain separate from the underlying declaration identities.
 * This entrypoint also supplies the common project used by session and lifecycle tests.
 */

export { Identity as PublicIdentity } from "./api.js";
export type { Identity as TypeIdentity } from "./api.js";
export * as ApiNamespace from "./api.js";
export {
	type Combined,
	type Derived,
	DerivedClass,
	type Frozen,
	type Omitted,
	type Selected,
	convert,
} from "./api.js";

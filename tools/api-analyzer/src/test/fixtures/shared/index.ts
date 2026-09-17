/*
 * Validates renamed value exports, type-only aliases, and namespace exports of the shared API.
 * Export names and restrictions must remain separate from the underlying declaration identities.
 * This entrypoint also supplies the common project used by analysis and lifecycle tests.
 */

// Both aliases identify the same class, but only PublicIdentity exposes its value side.
export { Identity as PublicIdentity } from "./api.js";
export type { Identity as TypeIdentity } from "./api.js";
// Namespace traversal must collect the API without replacing the namespace's exported name.
export * as ApiNamespace from "./api.js";
// Individual type-only specifiers differ from the value exports in this same export statement.
export {
	type Combined,
	type Derived,
	DerivedClass,
	type Frozen,
	type Omitted,
	type Selected,
	convert,
} from "./api.js";

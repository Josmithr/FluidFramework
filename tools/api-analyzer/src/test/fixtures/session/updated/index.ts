/*
 * Replaces the entrypoint alongside updated/api.ts during session invalidation testing.
 * Exposes only declarations that remain in the replacement API while preserving the public class alias.
 */

export { Derived, Identity as PublicIdentity } from "./api.js";

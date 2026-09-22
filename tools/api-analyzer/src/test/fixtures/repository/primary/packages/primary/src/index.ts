/* Primary repository example: each module owns one family of API declarations. */
/**
 * Primary API inventory. See {@link identity}.
 * @packageDocumentation
 */
export * from "./functions.js";
export * from "./containers.js";
export * from "./types.js";
export * from "./values.js";
export * from "./merges.js";
export { identity as renamedIdentity } from "./functions.js";
export type { Store as StoreType } from "./containers.js";
export { default as NamedDefault } from "./namedDefault.js";
export { default as AnonymousDefault } from "./anonymousDefault.js";
export { default as ExpressionDefault } from "./expressionDefault.js";

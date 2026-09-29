/* Re-exports the same private class through a second entrypoint to test nominal identity. */

export { Store } from "./index.js";
export { atomic } from "./index.js";
export type { Store as StoreType } from "./index.js";
export type { ForeignClass } from "foreign";

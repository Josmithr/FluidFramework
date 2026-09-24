/* Exercises namespace wrapper metadata, aliases, and original-scope links. */
/**
 * Tools for clients. See {@link (Tools:namespace).foo} and {@link Tools.Contract}.
 * @beta
 */
export * as Tools from "dependency";
export { Tools as Renamed } from "./index.js";
export type { Tools as Types } from "./index.js";

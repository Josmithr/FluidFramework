/* Exercises recursive and empty module namespace wrappers without infinite expansion. */
/** Recursive API. @public */
export * as Self from "./index.js";
/** Empty API. @public */
export * as Empty from "./empty.js";

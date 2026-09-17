/*
 * The compiler selects a platform declaration through package export conditions.
 */

// Each TypeScript project resolves this same import using its configured export conditions.
export { platform } from "platform";

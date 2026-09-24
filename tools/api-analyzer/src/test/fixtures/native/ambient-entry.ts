/* Exercises distinct documented wrappers around merged ambient declarations. */
import "./ambient-modules.js";
/**
 * Tools namespace documentation. See {@link Tools.Settings} and {@link Tools.update}.
 * @public
 */
export * as Tools from "ambient-tools";
/**
 * A second namespace over the same ambient module.
 * @public
 */
export * as ToolsAgain from "ambient-tools";
export * from "ambient-tools";

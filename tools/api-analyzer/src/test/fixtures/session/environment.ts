/*
 * Validates conditional dependency resolution through a renamed re-export.
 * Browser and Node projects must select different declarations and retain the dependency's package origin.
 */

export { Environment as PublicEnvironment } from "dependency";

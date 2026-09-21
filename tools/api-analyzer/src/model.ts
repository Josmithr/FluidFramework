/*
 * Source-free documentation model reader and its versioned data contract.
 * Import this entrypoint without loading compiler-backed analysis.
 */
export { decodeDependencyModel } from "./model-generation/dependencyModel.js";
export { decodeDependencyModels } from "./model-generation/modelSet.js";
export type { DependencyModel } from "./analysis-types/dependencyModel.js";

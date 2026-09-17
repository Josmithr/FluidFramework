/**
 * Package exports define the anticipated user-facing API.
 * Add an export only when a planned user workflow requires it.
 * Keep analysis facts, intermediate results, and pipeline operations internal.
 * Tests and internal consumers must import those APIs directly from their modules.
 * Analysis-dependent operations belong on the completed APIAnalysis object.
 */
export { analyzeAPIs } from "./analysis.js";
export type { APIAnalysis, APIStatistics } from "./analysis.js";
export { ReleaseLevel } from "./classification.js";
export type {
	ApiItemSelection,
	ClassificationOptions,
	ClassificationRules,
} from "./classification.js";
export type { Configuration, EffectiveConfiguration, Entrypoint } from "./configuration.js";
export { DiagnosticCode } from "./result.js";
export type { AnalyzerDiagnostic, Result } from "./result.js";
export type { ReviewPresentationOptions } from "./reviewReport.js";
export type { TsdocOptions } from "./tsdocConfiguration.js";

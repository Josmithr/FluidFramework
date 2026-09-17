/**
 * Package exports define the anticipated user-facing API.
 * Add an export only when a planned user workflow requires it.
 * Keep analysis facts, intermediate results, and pipeline operations internal.
 * Tests and internal consumers must import those APIs directly from their modules.
 * Analysis-dependent operations belong on the completed APIAnalysis object.
 */
export { analyzeAPIs } from "./api.js";
export type { APIAnalysis, APIStatistics } from "./api.js";
export { ReleaseLevel } from "./analysis-types/classification.js";
export type {
	ApiItemSelection,
	ClassificationOptions,
	ClassificationRules,
} from "./analysis-types/classification.js";
export type {
	Configuration,
	EffectiveConfiguration,
	Entrypoint,
	SuiteConfiguration,
} from "./analysis-types/configuration.js";
export { DiagnosticCode } from "./analysis-types/result.js";
export type { AnalyzerDiagnostic, Result } from "./analysis-types/result.js";
export type { ReviewPresentationOptions } from "./report-generation/reviewReport.js";
export type { TsdocOptions } from "./analysis-types/tsdocOptions.js";
export type {
	ReferencePolicies,
	DirectionalReferenceRule,
} from "./analysis-types/referencePolicy.js";

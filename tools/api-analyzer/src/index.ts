/**
 * Package exports define the anticipated user-facing API.
 * Add an export only when a planned user workflow requires it.
 * Keep analysis facts, intermediate results, and pipeline operations internal.
 * Tests and internal consumers must import those APIs directly from their modules.
 * Future analysis-dependent operations belong on the session.
 */
export { ReleaseLevel } from "./classification.js";
export type {
	ApiItemSelection,
	ClassificationOptions,
	ClassificationRules,
} from "./classification.js";
export { resolveConfiguration } from "./configuration.js";
export type { Configuration, EffectiveConfiguration, Entrypoint } from "./configuration.js";
export { DiagnosticCode } from "./result.js";
export type { AnalyzerDiagnostic, Result } from "./result.js";
export {
	checkReviewBaseline,
	compareReviewBaseline,
	updateReviewBaseline,
} from "./reviewBaseline.js";
export { createAnalysisSession } from "./session.js";
// TODO (Stage 2 session outputs): Revisit these report exports when the session output
// contract decides whether callers receive structured reports or rendered artifacts.
export { renderReviewReport } from "./reviewReport.js";
export type {
	ReviewExport,
	ReviewReport,
	ReviewSignature,
	ReviewPresentationOptions,
} from "./reviewReport.js";
export type { AnalysisSession } from "./session.js";
export type { TsdocOptions } from "./tsdocConfiguration.js";

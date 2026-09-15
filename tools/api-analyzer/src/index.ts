export { classifyApiItems, ReleaseLevel, selectApiItems } from "./classification.js";
export type {
	ApiClassification,
	ApiItemDocumentation,
	ApiItemMetadata,
	ApiItemSelection,
	ClassificationOptions,
	ClassificationRules,
	SelectedApiItems,
} from "./classification.js";
export { resolveConfiguration } from "./configuration.js";
export type { Configuration, EffectiveConfiguration, Entrypoint } from "./configuration.js";
export type {
	AnalysisFacts,
	ApiItemId,
	DeclarationFact,
	ExportFact,
	MemberFact,
	Origin,
	SignatureFact,
	SourceDeclarationFact,
	SurfaceFact,
} from "./facts.js";
export { DiagnosticCode } from "./result.js";
export type { AnalyzerDiagnostic, Result } from "./result.js";
export {
	checkReviewBaseline,
	compareReviewBaseline,
	updateReviewBaseline,
} from "./reviewBaseline.js";
export { createAnalysisSession } from "./session.js";
export type { AnalysisSession } from "./session.js";

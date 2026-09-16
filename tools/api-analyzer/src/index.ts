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
export { resolveDocumentation } from "./documentation.js";
export type {
	DocumentationInput,
	DocumentationReferenceBinding,
	ResolvedDocumentation,
} from "./documentation.js";
export type {
	AnalysisFacts,
	ApiItemId,
	DeclarationFact,
	DocumentationReferenceLookup,
	ResolvedDocumentationReference,
	MissingDocumentationReference,
	UnsupportedDocumentationReference,
	ExportFact,
	FunctionParameterFact,
	MemberFact,
	Origin,
	SignatureFact,
	FunctionDocumentationContext,
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
export { createReviewReport, renderReviewReport } from "./reviewReport.js";
export type {
	ReviewExport,
	ReviewReport,
	ReviewSignature,
	ReviewPresentationOptions,
} from "./reviewReport.js";
export type { AnalysisSession } from "./session.js";
export type { TsdocOptions } from "./tsdocConfiguration.js";

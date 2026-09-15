export { resolveConfiguration } from "./configuration.js";
export type { Configuration, EffectiveConfiguration, Entrypoint } from "./configuration.js";
export type {
	AnalysisFacts,
	DeclarationFact,
	ExportFact,
	MemberFact,
	Origin,
	SignatureFact,
	SourceDeclarationFact,
	SurfaceFact,
} from "./facts.js";
export type { AnalyzerDiagnostic, Result } from "./result.js";
export { createAnalysisSession } from "./session.js";
export type { AnalysisSession } from "./session.js";

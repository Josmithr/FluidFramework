/*
 * Source-free documentation model reader and its versioned data contract.
 * Import this entrypoint without loading compiler-backed analysis.
 */
export { decodeDependencyModel } from "./model-generation/dependencyModel.js";
export { decodeDependencyModels } from "./model-generation/modelSet.js";
export type {
	DependencyModel,
	DependencyApi,
	DependencyApiMetadata,
	DependencyApiParameter,
	DependencyExport,
	DependencyModelInput,
	DependencyModelInputFile,
	ExternalDependencyApi,
	ModelDocumentation,
	ModelDocumentationSection,
	ModelLink,
	ModelPackageDocumentation,
} from "./analysis-types/dependencyModel.js";
export type {
	ModelDeclaration,
	ModelDeclarationSyntax,
	ModelDeclarationStatement,
	ModelDeclaredMember,
	ModelExport,
	ModelGraph,
	ModelImportBinding,
	ModelItem,
	ModelMember,
	ModelOrigin,
	ModelSignature,
	ModelSignatureText,
	ModelSource,
	ModelSurface,
	ModelTypeReference,
} from "./analysis-types/modelGraph.js";
export type {
	CodeExcerpt,
	ExcerptToken,
	ExcerptTokenRange,
} from "./analysis-types/excerpt.js";
export type {
	DeclarationSyntax,
	DeclarationReferencePath,
	SyntaxRange,
} from "./analysis-types/declarationSyntax.js";

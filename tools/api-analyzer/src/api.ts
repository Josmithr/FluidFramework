import type { ApiItemSelection } from "./analysis-types/classification.js";
import { resolveConfiguration } from "./configuration.js";
import type { Configuration, EffectiveConfiguration } from "./analysis-types/configuration.js";
import { analyzeDeclarations } from "./analysis/nativeAdapter.js";
import {
	createAnalysisContext,
	type ExtractedComments,
} from "./analysis/documentationContext.js";
import { completeAnalysis } from "./analysis/completeAnalysis.js";
import {
	createReviewReport,
	prepareReviewReport,
	renderReviewReport,
	type ReviewPresentationOptions,
} from "./report-generation/reviewReport.js";
import { freezeData } from "./utilities/freezeData.js";
import type { Result } from "./analysis-types/result.js";
import { encodeDependencyModel } from "./model-generation/dependencyModel.js";
import { loadDependencyModels } from "./suite.js";

/**
 * Counts of declarations and callable signatures retained by this analysis.
 *
 * @remarks
 * Includes collected unexported targets. These are not counts of selected report exports.
 *
 * @sealed
 * @public
 */
export interface APIStatistics {
	/**
	 * The number of configured entrypoints.
	 */
	readonly entrypoints: number;

	/**
	 * The number of distinct collected declaration symbols.
	 */
	readonly declarations: number;

	/**
	 * The number of callable signatures on collected declarations, excluding effective member views.
	 */
	readonly signatures: number;
}

/**
 * Completed analysis with no live compiler resources or source invalidation lifecycle.
 * @sealed
 * @public
 */
export interface APIAnalysis {
	/**
	 * Generates the versioned dependency documentation artifact without compiler or file access.
	 * @returns JSON artifact content. The caller owns its destination and writes.
	 */
	generateModel(): string;

	/**
	 * The immutable effective configuration used for this invocation.
	 */
	readonly configuration: EffectiveConfiguration;

	/**
	 * Returns immutable API counts, not cache or compiler performance counters.
	 *
	 * @returns Counts over the collected analysis, independently of report selection.
	 */
	// TODO: just make this a readonly property? It's currently a method but could be a simple getter.
	getStatistics(): APIStatistics;

	/**
	 * Generates report text from prepared data without compiler or filesystem access.
	 *
	 * @param entrypoint - Configured entrypoint name.
	 * @param selection - Release levels and modifier filters for this report.
	 * @param presentation - Report formatting settings. Omit to include top-level release tags, undocumented notices, and sealed, override, and deprecated annotations.
	 * @returns Report text, or selection and entrypoint diagnostics.
	 * @throws If the entrypoint contains unsupported declaration forms or unresolved merged ownership.
	 */
	generateReport(
		entrypoint: string,
		selection: ApiItemSelection,
		presentation?: ReviewPresentationOptions,
	): Result<string>;
}

/**
 * Analyzes one package and completes supported semantic validation before returning.
 *
 * @remarks
 * Resolves ordinary configuration internally. The synchronous compiler adapter blocks the event loop
 * during extraction. Compiler resources are released before the promise settles.
 * Changed inputs require a new invocation; no analysis cache is retained across invocations.
 * Validates supported original declaration and member comments, selected dependency models, and configured reference policies.
 * Untagged members inherit their original declaring container's release level, not the receiving type's level.
 *
 * @param configuration - Package inputs and inherited settings.
 * @param workingDirectory - Absolute base for relative paths. Defaults to the process working directory.
 * @returns A completed analysis, or expected configuration and semantic diagnostics.
 * @throws Rejects on internal assertions or unexpected operational failures after resource cleanup.
 * @public
 */
export async function analyzeAPIs(
	configuration: Configuration,
	workingDirectory: string = process.cwd(),
): Promise<Result<APIAnalysis>> {
	return Promise.resolve().then(() => {
		const configured = resolveConfiguration(configuration, workingDirectory);
		if (!configured.ok) {
			return configured;
		}
		const dependencies = loadDependencyModels(configured.value);
		if (!dependencies.ok) {
			return dependencies;
		}
		const comments: ExtractedComments = new Map();
		const extracted = analyzeDeclarations(
			configured.value,
			undefined,
			comments,
			dependencies.value.map((dependency) => dependency.packageName),
		);
		if (!extracted.ok) {
			return extracted;
		}
		const facts = extracted.value;
		const signatures = facts.declarations.flatMap((declaration) => declaration.signatures);
		const context = createAnalysisContext(
			facts,
			configured.value,
			comments,
			dependencies.value,
		);
		if (!context.ok) {
			return context;
		}
		const completed = completeAnalysis(context.value);
		if (!completed.ok) {
			return completed;
		}
		const prepared = prepareReviewReport(completed.value);

		// TODO (Stages 3 and 4 outputs): Extend the dependency format to a complete portable model
		// and retain rollup data without requiring a live compiler or repeating analysis.
		const statistics = freezeData({
			entrypoints: facts.surfaces.length,
			declarations: facts.declarations.length,
			signatures: signatures.length,
		});
		return freezeData({
			ok: true,
			value: {
				configuration: configured.value,
				generateModel: () => encodeDependencyModel(completed.value),
				getStatistics: () => statistics,
				generateReport(
					entrypoint: string,
					selection: ApiItemSelection,
					presentation: ReviewPresentationOptions = {},
				): Result<string> {
					const report = createReviewReport(prepared, entrypoint, selection);
					return report.ok
						? freezeData({ ok: true, value: renderReviewReport(report.value, presentation) })
						: report;
				},
			},
		});
	});
}

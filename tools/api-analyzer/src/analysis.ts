import type { ApiItemSelection } from "./classification.js";
import {
	resolveConfiguration,
	type Configuration,
	type EffectiveConfiguration,
} from "./configuration.js";
import { analyzeDeclarations } from "./nativeAdapter.js";
import { createAnalysisContext, type ExtractedComments } from "./documentationContext.js";
import {
	createReviewReport,
	prepareReviewReport,
	renderReviewReport,
	type ReviewPresentationOptions,
} from "./reviewReport.js";
import { freezeData, type Result } from "./result.js";

/**
 * Counts of declarations and callable signatures retained by this analysis.
 *
 * @remarks
 * Includes collected unexported targets. These are not counts of selected report exports.
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
 */
export interface APIAnalysis {
	/**
	 * The immutable effective configuration used for this invocation.
	 */
	readonly configuration: EffectiveConfiguration;
	/**
	 * Returns immutable API counts, not cache or compiler performance counters.
	 *
	 * @returns Counts over the collected analysis, independently of report selection.
	 */
	getStatistics(): APIStatistics;
	/**
	 * Generates report text from prepared data without compiler or filesystem access.
	 *
	 * @param entrypoint - Configured entrypoint name.
	 * @param selection - Release levels and modifier filters for this report.
	 * @param presentation - Optional report formatting settings.
	 * @returns Report text, or selection and entrypoint diagnostics.
	 * @throws If the entrypoint contains declarations outside the current function-only report scope.
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
 * Currently validates collected callable comments and same-package documentation references only.
 *
 * @param configuration - Package inputs and inherited settings.
 * @param workingDirectory - Absolute base for relative paths. Defaults to the process working directory.
 * @returns A completed analysis, or expected configuration and semantic diagnostics.
 * @throws Rejects on internal assertions or unexpected operational failures after resource cleanup.
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
		const comments: ExtractedComments = new Map();
		const extracted = analyzeDeclarations(configured.value, undefined, comments);
		if (!extracted.ok) {
			return extracted;
		}
		const facts = extracted.value;
		const signatures = facts.declarations.flatMap((declaration) => declaration.signatures);
		const context = createAnalysisContext(facts, configured.value, comments);
		if (!context.ok) {
			return context;
		}
		const prepared = prepareReviewReport(context.value);
		if (!prepared.ok) {
			return prepared;
		}
		// TODO (Stage 2 completion): Add general declaration validation and suite model loading.
		// TODO (Stages 3 and 4 outputs): Retain portable-model and declaration-rollup data before
		// exposing those methods. They must not require a live compiler or repeat full analysis.
		const statistics = freezeData({
			entrypoints: facts.surfaces.length,
			declarations: facts.declarations.length,
			signatures: signatures.length,
		});
		return freezeData({
			ok: true,
			value: {
				configuration: configured.value,
				getStatistics: () => statistics,
				generateReport(
					entrypoint: string,
					selection: ApiItemSelection,
					presentation: ReviewPresentationOptions = {},
				): Result<string> {
					const report = createReviewReport(prepared.value, entrypoint, selection);
					return report.ok
						? freezeData({ ok: true, value: renderReviewReport(report.value, presentation) })
						: report;
				},
			},
		});
	});
}

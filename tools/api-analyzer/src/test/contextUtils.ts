import assert from "node:assert/strict";
import type { ApiItemDocumentation, ClassificationOptions } from "../classification.js";
import {
	createAnalysisContext,
	createDocumentationContext,
	type AnalysisContext,
	type DocumentationContext,
} from "../documentationContext.js";
import type { AnalysisFacts } from "../facts.js";
import { DiagnosticCode, type Result } from "../result.js";
import type { DocumentationResolutionOptions } from "../documentation.js";

/**
 * Creates a parsed fixture context whose configuration is expected to be valid.
 *
 * @remarks
 * Resolution-only options are ignored here so fixtures can pass one local settings object to both steps.
 * The caller must still pass binding options explicitly to resolution.
 *
 * @param items - Original fixture comments.
 * @param options - Shared parser and classification settings.
 * @returns Request-owned parsed inputs for the test's semantic stages.
 * @throws If context configuration fails or inputs violate identity invariants.
 */
export function documentationContext<Input extends ApiItemDocumentation>(
	items: readonly Input[],
	options: ClassificationOptions & DocumentationResolutionOptions = {},
): DocumentationContext<Input> {
	const context = createDocumentationContext(
		items,
		options,
		DiagnosticCode.ClassificationConfiguration,
	);
	assert.ok(context.ok, JSON.stringify(context));
	return context.value;
}

/**
 * Creates an indexed fixture context with tolerant classification defaults.
 *
 * @remarks
 * Binding tests can isolate reference failures without requiring release tags or valid syntax in every fixture.
 * Binding and resolution still enforce the context's strict syntax validation result.
 *
 * @param facts - Detached fixture declarations.
 * @param options - Parser vocabulary and optional classification overrides.
 * @returns A context with original metadata for every retained signature.
 * @throws If context creation or classification fails.
 */
export function analysisContext(
	facts: AnalysisFacts,
	options: ClassificationOptions = {},
): AnalysisContext {
	const context = createAnalysisContext(facts, {
		...options,
		rules: { requireReleaseLevel: false, validateTsdocSyntax: false, ...options.rules },
	});
	assert.ok(context.ok, JSON.stringify(context));
	return context.value;
}

/**
 * Extracts an expected successful test result without hiding operation boundaries.
 *
 * @param result - The operation result to check.
 * @returns Its successful value.
 * @throws If the supplied result contains diagnostics.
 */
export function success<Value>(result: Result<Value>): Value {
	assert.ok(result.ok, JSON.stringify(result));
	return result.value;
}

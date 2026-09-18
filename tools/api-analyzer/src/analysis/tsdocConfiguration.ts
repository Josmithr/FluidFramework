import type { TsdocOptions } from "../analysis-types/tsdocOptions.js";
import { TSDocConfiguration, TSDocTagDefinition, TSDocTagSyntaxKind } from "@microsoft/tsdoc";
import { reportFailure } from "../analysis-types/result.js";
import type { DiagnosticCode, Result } from "../analysis-types/result.js";

/**
 * Creates an independent TSDoc configuration for one operation.
 *
 * @param options - The custom modifier vocabulary. This function does not change the options.
 * @param diagnosticCode - The calling operation's configuration diagnostic code.
 * @returns A new parser configuration, or a diagnostic for invalid or duplicate tag names.
 */
export function createTsdocConfiguration(
	options: TsdocOptions,
	diagnosticCode:
		| DiagnosticCode.ClassificationConfiguration
		| DiagnosticCode.DocumentationConfiguration,
): Result<TSDocConfiguration> {
	const configuration = new TSDocConfiguration();
	for (const tagName of options.customModifierTags ?? []) {
		try {
			TSDocTagDefinition.validateTSDocTagName(tagName);
		} catch (error) {
			return reportFailure(
				diagnosticCode,
				`Invalid custom modifier configuration: ${String(error)}`,
			);
		}
		if (configuration.tryGetTagDefinition(tagName)) {
			return reportFailure(
				diagnosticCode,
				`Tag ${tagName} is already defined. Use a distinct custom modifier name.`,
			);
		}
		configuration.addTagDefinition(
			new TSDocTagDefinition({ tagName, syntaxKind: TSDocTagSyntaxKind.ModifierTag }),
		);
	}
	return { ok: true, value: configuration };
}

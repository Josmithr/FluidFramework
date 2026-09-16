import { TSDocConfiguration, TSDocTagDefinition, TSDocTagSyntaxKind } from "@microsoft/tsdoc";
import { DiagnosticCode, failure, type Result } from "./result.js";

/**
 * The custom tag vocabulary for classification and documentation resolution.
 *
 * @remarks
 * Pass the same options to classification, reference binding, and content resolution.
 * These options register modifier tags only. They do not load configuration files or disable syntax validation.
 */
export interface TsdocOptions {
	/**
	 * Custom modifier names, including `@`. Must not redefine standard tags or each other.
	 *
	 * @defaultValue No custom modifier tags.
	 */
	readonly customModifierTags?: readonly string[];
}

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
			return failure(
				diagnosticCode,
				`Invalid custom modifier configuration: ${String(error)}`,
			);
		}
		if (configuration.tryGetTagDefinition(tagName)) {
			return failure(
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

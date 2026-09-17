import {
	releaseLevels,
	releaseLevelTags,
	type ApiClassification,
	type ApiItemMetadata,
	type ApiItemDocumentation,
} from "../analysis-types/classification.js";
import { TSDocTagSyntaxKind } from "@microsoft/tsdoc";
import type { DocumentationContext } from "./documentationContext.js";
import {
	DiagnosticCode,
	type AnalyzerDiagnostic,
	type Result,
} from "../analysis-types/result.js";
import { freezeData } from "../utilities/freezeData.js";

/**
 * Classifies original parsed documentation in an invocation-owned context.
 *
 * @remarks
 * Reads parsed comments without compiler queries, filesystem access, or repeated parsing.
 * Run before inheritance resolution changes the context's comment nodes.
 * Results are deeply frozen; the context is not mutated or frozen.
 * Item-specific diagnostics include the input identifier.
 * If any item fails validation, the function returns diagnostics instead of classifications for the supplied items.
 * Callers must pass callable overloads separately and omit implementation signatures.
 * Context creation validates identities before this operation.
 *
 * @param context - Original parsed comments with their shared vocabulary and classification rules.
 * @returns Classified metadata or diagnostics.
 * @throws If processing fails unexpectedly.
 */
export function classifyApiItems(
	context: DocumentationContext<ApiItemDocumentation>,
): Result<ApiClassification> {
	const { configuration, rules } = context;
	const diagnostics: AnalyzerDiagnostic[] = [];
	const classified: ApiItemMetadata[] = [];
	for (const item of context.items.values()) {
		const { parsed } = item;
		if (rules.validateTsdocSyntax !== false) {
			for (const message of parsed?.log.messages ?? []) {
				diagnostics.push({
					code: DiagnosticCode.ClassificationTsdoc,
					message: `${item.id}: ${message.messageId}: ${message.unformattedText}`,
				});
			}
		}

		// Use configured spellings and omit unknown tags, including when parser diagnostics are ignored.
		const modifierTags = [
			...new Set(
				(parsed?.docComment.modifierTagSet.nodes ?? []).flatMap((tag) => {
					const definition = configuration.tryGetTagDefinition(tag.tagName);
					return definition?.syntaxKind === TSDocTagSyntaxKind.ModifierTag
						? [definition.tagName]
						: [];
				}),
			),
		].sort();

		// Release-level checks are independent of syntax validation; conflicts always fail.
		const levels = releaseLevels.filter((level) =>
			modifierTags.includes(releaseLevelTags[level]),
		);
		if (levels.length > 1) {
			diagnostics.push({
				code: DiagnosticCode.ClassificationReleaseConflict,
				message: `${item.id}: Conflicting release levels ${levels.map((level) => releaseLevelTags[level]).join(", ")}. Specify one release level for this item.`,
			});
		} else if (levels.length === 0 && rules.requireReleaseLevel !== false) {
			diagnostics.push({
				code: DiagnosticCode.ClassificationReleaseMissing,
				message: `${item.id}: Missing release level. Add a release tag or disable requireReleaseLevel.`,
			});
		}
		classified.push({ id: item.id, releaseLevel: levels[0], modifierTags });
	}

	// Report collected item errors without returning classifications for any item in the batch.
	if (diagnostics.length > 0) {
		return freezeData({ ok: false, diagnostics });
	}
	return freezeData({
		ok: true,
		value: {
			items: classified.sort((left, right) =>
				left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
			),

			// Include all configured modifier names so selection can validate tags absent from these items.
			modifierTags: configuration.tagDefinitions
				.filter((tag) => tag.syntaxKind === TSDocTagSyntaxKind.ModifierTag)
				.map((tag) => tag.tagName)
				.sort(),
		},
	});
}

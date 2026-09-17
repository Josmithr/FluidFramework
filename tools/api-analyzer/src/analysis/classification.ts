import {
	releaseLevels,
	releaseLevelTags,
	type ApiClassification,
	type ApiItemMetadata,
	type ApiItemDocumentation,
} from "../analysis-types/classification.js";
import { TSDocParser, TSDocTagSyntaxKind, type TSDocConfiguration } from "@microsoft/tsdoc";
import type { DocumentationContext } from "./documentationContext.js";
import type { AnalysisFacts, SourceDeclarationFact } from "../analysis-types/facts.js";
import {
	DiagnosticCode,
	failure,
	type AnalyzerDiagnostic,
	type Result,
} from "../analysis-types/result.js";
import { freezeData } from "../utilities/freezeData.js";

/**
 * Rejects distinct explicit release tags on parts of the same merged non-overloaded API.
 *
 * @remarks
 * This check does not combine descriptive comments, assign missing tags, or classify merged APIs.
 * Pure function and method declaration groups are overload sets and remain independently classified.
 * Missing-release and syntax rule opt-outs do not permit conflicting explicit release metadata.
 *
 * @param facts - Detached original declarations and effective member source records.
 * @param configuration - The validated TSDoc vocabulary for this invocation.
 * @returns Success or the first merged-release conflict with original source locations.
 */
export function validateMergedReleaseLevels(
	facts: AnalysisFacts,
	configuration: TSDocConfiguration,
): Result<void> {
	const parser = new TSDocParser(configuration);
	for (const declaration of facts.declarations) {
		const own = validateMergedReleaseGroup(
			declaration.name,
			declaration.declarations,
			parser,
			configuration,
		);
		if (!own.ok) {
			return own;
		}
		for (const member of declaration.members) {
			const result = validateMergedReleaseGroup(
				`${declaration.name}.${member.name}`,
				member.declarations,
				parser,
				configuration,
			);
			if (!result.ok) {
				return result;
			}
		}
	}
	return { ok: true, value: undefined };
}

/**
 * Checks one compiler-identified source group without choosing a preferred declaration.
 * @param name - Declaration or member name for the diagnostic.
 * @param sources - Original source records contributing to the same API.
 * @param parser - Parser configured with this invocation's modifier vocabulary.
 * @param configuration - Vocabulary used to recognize canonical modifier spellings.
 * @returns Success for consistent explicit tags or an actionable conflict diagnostic.
 */
function validateMergedReleaseGroup(
	name: string,
	sources: readonly SourceDeclarationFact[],
	parser: TSDocParser,
	configuration: TSDocConfiguration,
): Result<void> {
	// Signature-level classification owns overload metadata, even when a callable has no parameters.
	if (
		sources.length < 2 ||
		sources.every(
			(source) =>
				source.kind === "FunctionDeclaration" ||
				source.kind === "MethodDeclaration" ||
				source.kind === "MethodSignature",
		)
	) {
		return { ok: true, value: undefined };
	}
	const levels = new Set<string>();
	const locations: string[] = [];
	for (const source of sources) {
		if (source.documentation === undefined) {
			// Absence is not an implicit release tag and does not resolve a conflict in another part.
			continue;
		}
		const comment = parser.parseString(source.documentation).docComment;
		const modifiers = new Set(
			comment.modifierTagSet.nodes.map(
				(tag) => configuration.tryGetTagDefinition(tag.tagName)?.tagName,
			),
		);
		const tags = releaseLevels
			.map((level) => releaseLevelTags[level])
			.filter((tag) => modifiers.has(tag));
		for (const tag of tags) {
			levels.add(tag);
		}
		if (tags.length > 0) {
			locations.push(
				`${source.packageName}/${source.file}:${source.start} (${tags.join(", ")})`,
			);
		}
	}
	if (levels.size > 1) {
		return failure(
			DiagnosticCode.ClassificationReleaseConflict,
			`Merged API ${name}: conflicting release tags ${[...levels].sort().join(", ")} across ${locations.join("; ")}. Update the explicit release tags on the merged declarations so they agree.`,
		);
	}
	return { ok: true, value: undefined };
}

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

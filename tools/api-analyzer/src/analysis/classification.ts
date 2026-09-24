import assert from "node:assert/strict";
import {
	releaseLevels,
	releaseLevelTags,
	type ApiClassification,
	type ApiItemMetadata,
	type ApiItemDocumentation,
} from "../analysis-types/classification.js";
import { TSDocParser, TSDocTagSyntaxKind, type TSDocConfiguration } from "@microsoft/tsdoc";
import type { DocumentationContext, ParsedDocumentationItem } from "./documentationContext.js";
import type {
	AnalysisFacts,
	ApiItemId,
	Origin,
	SourceDeclarationFact,
} from "../analysis-types/facts.js";
import {
	DiagnosticCode,
	reportFailure,
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
): Result {
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
	return { ok: true };
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
): Result {
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
		return { ok: true };
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
		return reportFailure(
			DiagnosticCode.ClassificationReleaseConflict,
			`Merged API ${name}: conflicting release tags ${[...levels].sort().join(", ")} across ${locations.join("; ")}. Update the explicit release tags on the merged declarations so they agree.`,
		);
	}
	return { ok: true };
}

/**
 * Original ownership and diagnostic context for a container member.
 */
export interface ContainerReleaseContext {
	/**
	 * The declaring container's classification identifier, not an inherited view's receiver.
	 */
	readonly id: ApiItemId;

	/**
	 * The container and member names used to locate a mismatch without reading opaque identifiers.
	 */
	readonly name: string;

	/**
	 * Original member location, shared by effective views of the same source declaration.
	 */
	readonly source: Origin;
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
 * @param containers - Original ownership and locations for container members. Omit for independent top-level items.
 * @returns Classified metadata or diagnostics.
 * @throws If processing fails unexpectedly.
 */
export function classifyApiItems(
	context: DocumentationContext<ApiItemDocumentation>,
	containers: ReadonlyMap<ApiItemId, ContainerReleaseContext> = new Map(),
): Result<ApiClassification> {
	const { configuration, rules } = context;
	const diagnostics: AnalyzerDiagnostic[] = [];
	const classified = collectOriginalMetadata(
		context.items.values(),
		configuration,
		rules.validateTsdocSyntax !== false,
		diagnostics,
	);
	const resolved = resolveContainerReleases(
		classified,
		containers,
		rules.requireReleaseLevel !== false,
		diagnostics,
	);

	// Report collected item errors without returning classifications for any item in the batch.
	if (diagnostics.length > 0) {
		return freezeData({ ok: false, diagnostics });
	}
	return freezeData({
		ok: true,
		value: {
			items: resolved.sort((left, right) =>
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

/**
 * Extracts explicit metadata from original comments before resolving container release levels.
 *
 * @param items - Parsed documentation inputs in their original order.
 * @param configuration - Vocabulary used to recognize canonical modifier names.
 * @param validateSyntax - Whether parser diagnostics are included. Release conflicts always produce diagnostics.
 * @param diagnostics - Invocation-owned array to which syntax and explicit-tag conflicts are appended in input order.
 * @returns New metadata records without inferred release levels, including records with reported conflicts.
 */
function collectOriginalMetadata(
	items: Iterable<ParsedDocumentationItem<ApiItemDocumentation>>,
	configuration: TSDocConfiguration,
	validateSyntax: boolean,
	diagnostics: AnalyzerDiagnostic[],
): ApiItemMetadata[] {
	const classified: ApiItemMetadata[] = [];
	for (const item of items) {
		const { parsed } = item;
		if (validateSyntax) {
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
		}
		classified.push({ id: item.id, releaseLevel: levels[0], modifierTags });
	}
	return classified;
}

/**
 * Resolves effective release metadata in declaring-container order without changing original records.
 *
 * @param classified - Explicit metadata in input order.
 * @param containers - Original ownership and diagnostic locations indexed by member identifier.
 * @param requireReleaseLevel - Whether an unresolved effective level produces a missing-release diagnostic.
 * @param diagnostics - Invocation-owned array to which ownership and effective-release errors are appended.
 * @returns Effective metadata in input order, including records with reported validation errors.
 * @throws If declaring-container relationships contain a cycle.
 */
function resolveContainerReleases(
	classified: readonly ApiItemMetadata[],
	containers: ReadonlyMap<ApiItemId, ContainerReleaseContext>,
	requireReleaseLevel: boolean,
	diagnostics: AnalyzerDiagnostic[],
): ApiItemMetadata[] {
	// Classify parents first regardless of extraction order. Only release metadata is inherited.
	const original = new Map(classified.map((item) => [item.id, item]));
	const effective = new Map<ApiItemId, ApiItemMetadata>();
	const active = new Set<ApiItemId>();
	const validatedSources = new Set<string>();

	/**
	 * Resolves a declaring container before applying a member's release metadata.
	 * @param item - Original metadata for this input.
	 * @returns Metadata with an inherited release level when the local tag is absent.
	 */
	function resolveRelease(item: ApiItemMetadata): ApiItemMetadata {
		const existing = effective.get(item.id);
		if (existing !== undefined) {
			return existing;
		}
		if (active.has(item.id)) {
			assert.fail("Declaring-container relationships must not contain cycles.");
		}
		active.add(item.id);
		const container = containers.get(item.id);
		const ownerId = container?.id;
		const owner = ownerId === undefined ? undefined : original.get(ownerId);
		if (ownerId !== undefined && owner === undefined) {
			diagnostics.push({
				code: DiagnosticCode.DocumentationUnsupported,
				message: `API ${item.id}: declaring container ${ownerId} has no supported classification context.`,
			});
		}
		const parent = owner === undefined ? undefined : resolveRelease(owner);
		if (container !== undefined) {
			validateContainerRelease(item, container, parent, validatedSources, diagnostics);
		}
		const releaseLevel = item.releaseLevel ?? parent?.releaseLevel;
		const result = {
			...item,
			releaseLevel,
			modifierTags:
				releaseLevel !== undefined && item.releaseLevel === undefined
					? [...item.modifierTags, releaseLevelTags[releaseLevel]].sort()
					: item.modifierTags,
		};
		if (releaseLevel === undefined && requireReleaseLevel) {
			diagnostics.push({
				code: DiagnosticCode.ClassificationReleaseMissing,
				message: `${item.id}: Missing release level. Tag the declaring container or this top-level API, or disable requireReleaseLevel.`,
			});
		}
		active.delete(item.id);
		effective.set(item.id, result);
		return result;
	}
	return classified.map(resolveRelease);
}

/**
 * Validates explicit member metadata once per original source and release level.
 *
 * @param item - Original member metadata before container inheritance.
 * @param container - Declaring owner and original member location for diagnostics.
 * @param parent - Effective owner metadata, or undefined when the owner has no supported context.
 * @param validatedSources - Invocation-owned set updated to record each checked source and explicit level.
 * @param diagnostics - Invocation-owned array to which a mismatch is appended when present.
 */
function validateContainerRelease(
	item: ApiItemMetadata,
	container: ContainerReleaseContext,
	parent: ApiItemMetadata | undefined,
	validatedSources: Set<string>,
	diagnostics: AnalyzerDiagnostic[],
): void {
	const sourceKey = JSON.stringify([
		container.id,
		container.source.packageName,
		container.source.file,
		container.source.start,
		item.releaseLevel,
	]);
	if (
		parent !== undefined &&
		!validatedSources.has(sourceKey) &&
		item.releaseLevel !== undefined &&
		item.releaseLevel !== parent.releaseLevel
	) {
		diagnostics.push({
			code: DiagnosticCode.ClassificationContainerMismatch,
			message: `API ${container.name} at ${container.source.packageName}/${container.source.file}:${container.source.start}: release ${releaseLevelTags[item.releaseLevel]} differs from declaring container ${container.id} (${parent.releaseLevel === undefined ? "untagged" : releaseLevelTags[parent.releaseLevel]}). Match the container's release tag or omit the member tag.`,
		});
	}

	// Reuse validation only for views with the same source and explicit metadata.
	validatedSources.add(sourceKey);
}

/**
 * Checks namespace export targets without changing the target's original declaration ownership.
 * @param facts - Declarations and alias-preserving namespace exports.
 * @param classification - Completed effective release metadata.
 * @param documentation - Original parsed comments, before container release inheritance.
 * @returns Success or the first mismatched or unsupported namespace export.
 */
export function validateNamespaceReleases(
	facts: AnalysisFacts,
	classification: ApiClassification,
	documentation: DocumentationContext<ApiItemDocumentation>,
): Result {
	const declarations = new Map(
		facts.declarations.map((declaration) => [declaration.id, declaration]),
	);
	const metadata = new Map(classification.items.map((item) => [item.id, item]));
	for (const declaration of facts.declarations) {
		if (
			!declaration.declarations.some(
				(source) => source.kind === "ModuleDeclaration" || source.kind === "NamespaceExport",
			)
		) {
			continue;
		}
		const container = metadata.get(declaration.id);
		if (
			declaration.declarations.some((source) => source.kind === "NamespaceExport") &&
			!releaseLevels.some(
				(level) =>
					documentation.items
						.get(declaration.id)
						?.parsed.docComment.modifierTagSet.hasTagName(releaseLevelTags[level]) === true,
			)
		) {
			return reportFailure(
				DiagnosticCode.ClassificationReleaseMissing,
				`Module namespace ${declaration.name}: add a release tag to its namespace export statement.`,
			);
		}
		if (container === undefined) {
			continue;
		}
		for (const binding of declaration.exports) {
			const target = declarations.get(binding.target);
			assert(target !== undefined, "Namespace exports must retain their target declarations.");
			const targets = metadata.has(target.id)
				? [target.id]
				: target.signatures.map((signature) => signature.id);
			if (targets.length === 0) {
				return reportFailure(
					DiagnosticCode.DocumentationUnsupported,
					`Namespace ${declaration.name}, export ${binding.name}: target ${target.name} has no supported release metadata. Use a supported declaration form before generating a container output.`,
				);
			}
			for (const id of targets) {
				const member = metadata.get(id);
				assert(
					member !== undefined,
					"Supported export targets must have classification metadata.",
				);
				if (member.releaseLevel !== container.releaseLevel) {
					const source = declaration.declarations[0];
					return reportFailure(
						DiagnosticCode.ClassificationContainerMismatch,
						`Namespace ${declaration.name}, export ${binding.name} at ${source?.packageName}/${source?.file}:${source?.start}: target ${target.name} has a different release level. Match the namespace's release level or move the export outside it.`,
					);
				}
			}
		}
	}
	return { ok: true };
}

/**
 * Rejects ordinary re-export tags that differ from any exposed source API's effective release level.
 * @param facts - Original declarations and export-statement constraints.
 * @param classification - Classified source APIs; re-export comments do not supply their metadata.
 * @returns Success or the first conflict with the statement and target identified.
 */
export function validateReexportReleases(
	facts: AnalysisFacts,
	classification: ApiClassification,
): Result {
	const declarations = new Map(
		facts.declarations.map((declaration) => [declaration.id, declaration]),
	);
	const metadata = new Map(classification.items.map((item) => [item.id, item]));
	for (const binding of facts.reexports ?? []) {
		const target = declarations.get(binding.target);
		assert(target !== undefined, "Re-export constraints must have collected targets.");
		const targets = metadata.has(target.id)
			? [target.id]
			: target.signatures.map((signature) => signature.id);
		if (targets.length === 0) {
			return reportFailure(
				DiagnosticCode.DocumentationUnsupported,
				`Re-export ${binding.name} at ${binding.origin.packageName}/${binding.origin.file}:${binding.origin.start}: source API ${target.name} has no supported release metadata. Remove the re-export tag or use a supported source declaration.`,
			);
		}
		for (const id of targets) {
			const level = metadata.get(id)?.releaseLevel;
			const tag = level === undefined ? undefined : releaseLevelTags[level];
			if (binding.releaseTags.some((requested) => requested !== tag)) {
				return reportFailure(
					DiagnosticCode.ClassificationReleaseConflict,
					`Re-export ${binding.name} at ${binding.origin.packageName}/${binding.origin.file}:${binding.origin.start}: release tags ${binding.releaseTags.join(", ")} disagree with source API ${target.name} (${tag ?? "untagged"}). Remove the re-export tag or match the source release level.`,
				);
			}
		}
	}
	return { ok: true };
}

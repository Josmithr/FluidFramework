import assert from "node:assert/strict";
import {
	DocPlainText,
	DocCodeSpan,
	DocFencedCode,
	DocLinkTag,
	DocInheritDocTag,
	DocBlock,
	TSDocConfiguration,
	TSDocParser,
	TSDocTagDefinition,
	TSDocTagSyntaxKind,
	type DocNode,
} from "@microsoft/tsdoc";
import { ReleaseLevel, type SelectedApiItems } from "./classification.js";
import type { AnalysisFacts, ApiItemId, DeclarationFact } from "./facts.js";
import { DiagnosticCode, failure, freezeData, type Result } from "./result.js";

/**
 * A selected callable signature and its review metadata.
 */
export interface ReviewSignature {
	/**
	 * The compiler-printed call-signature declaration, without a function name or body.
	 */
	readonly text: string;
	/**
	 * Whether the comment contains descriptive text, code, a link, or an explicit inheritance request.
	 *
	 * @remarks
	 * Empty comments and comments containing only metadata tags are undocumented.
	 * An explicit `@inheritDoc` request counts as documentation. This flag does not indicate whether
	 * its target exists or whether documentation was successfully inherited.
	 */
	// TODO (Stage 2 documentation resolution): Derive this flag from effective documentation after inheritance.
	readonly documented: boolean;
	/**
	 * The classified release level, or `undefined` for a permitted untagged signature.
	 */
	readonly releaseLevel: ReleaseLevel | undefined;
	/**
	 * Recognized tags available for presentation, including release tags and block tags such as `@deprecated`.
	 * Sorted and deduplicated. The property name is retained for compatibility with the initial report model.
	 */
	readonly modifierTags: readonly string[];
}

/**
 * An exported function binding with independently selected overloads.
 */
export interface ReviewExport {
	/**
	 * The original declaration identity, used to emit shared alias targets once. Not rendered.
	 */
	readonly declarationId: ApiItemId;
	/**
	 * The compiler's declaration name, used as a local name when it is not directly exported.
	 */
	readonly declarationName: string;
	/**
	 * The exported name, not the implementation symbol's name.
	 */
	readonly name: string;
	/**
	 * Whether this binding is exposed only through type-only export paths.
	 */
	readonly typeOnly: boolean;
	/**
	 * Selected callable signatures in compiler order.
	 *
	 * @remarks
	 * Order is significant for overload resolution. Do not sort by signature text or identifier.
	 */
	readonly signatures: readonly ReviewSignature[];
}

/**
 * A detached, experimental function-only review report.
 *
 * @remarks
 * Not a declaration rollup, documentation model, or complete type-reference graph.
 * Reports created by {@link createReviewReport} are deeply frozen.
 */
export interface ReviewReport {
	/**
	 * The name of the package that exposes this surface.
	 */
	readonly packageName: string;
	/**
	 * The selection name used as the review identity, independent of physical entrypoint paths.
	 */
	readonly surface: string;
	/**
	 * Selected bindings sorted by exported name. Empty when no overloads are selected.
	 */
	readonly exports: readonly ReviewExport[];
}

/**
 * Constructs a review report for a function-only entrypoint from detached facts and metadata.
 *
 * @remarks
 * Reuses identifiers to associate selection metadata with signatures. Parses comments with TSDoc
 * for documentation presence and block tags, without repeating classification or validation.
 * Selection must come from the same analysis facts. Selected signatures from other entrypoints are allowed.
 * Preserves exported aliases, type-only export paths, and the order of selected overloads.
 * Does not render implementation bodies, source locations, or provisional identifiers.
 * Does not query the compiler, mutate inputs, validate references, or write files.
 *
 * @param facts - Detached analysis facts containing all export targets.
 * @param entrypoint - Configured entrypoint name to report.
 * @param selection - Named metadata selection for signature facts in this analysis.
 * @returns A frozen report, or diagnostics for an unknown entrypoint, blank name, or invalid selected identifiers.
 * @throws If facts violate internal identity invariants or the entrypoint contains unsupported declarations.
 * The initial implementation supports only standalone function declarations, not merged namespaces or other forms.
 */
export function createReviewReport(
	facts: AnalysisFacts,
	entrypoint: string,
	selection: SelectedApiItems,
): Result<ReviewReport> {
	const surface = facts.surfaces.find((item) => item.name === entrypoint);
	if (surface === undefined || selection.name.trim().length === 0) {
		return failure(
			DiagnosticCode.ReportConfiguration,
			`Package ${facts.packageName}: supply an existing entrypoint and a non-blank report selection name. Requested entrypoint: ${entrypoint}.`,
		);
	}
	const declarations = new Map<ApiItemId, DeclarationFact>();
	const signatureIds = new Set<ApiItemId>();
	for (const declaration of facts.declarations) {
		assert.ok(
			!declarations.has(declaration.id),
			"Declaration facts must have distinct identifiers.",
		);
		declarations.set(declaration.id, declaration);
		for (const signature of declaration.signatures) {
			assert.ok(
				!signatureIds.has(signature.id),
				"Signature facts must have distinct identifiers for reporting.",
			);
			signatureIds.add(signature.id);
		}
	}
	const metadata = new Map(selection.items.map((item) => [item.id, item]));
	if (
		metadata.size !== selection.items.length ||
		selection.items.some((item) => !signatureIds.has(item.id))
	) {
		return failure(
			DiagnosticCode.ReportConfiguration,
			`Package ${facts.packageName}, entrypoint ${entrypoint}: supply distinct selected identifiers from this analysis's signature facts.`,
		);
	}
	const configuration = new TSDocConfiguration();
	for (const tagName of new Set(selection.items.flatMap((item) => item.modifierTags))) {
		if (configuration.tryGetTagDefinition(tagName) === undefined) {
			configuration.addTagDefinition(
				new TSDocTagDefinition({ tagName, syntaxKind: TSDocTagSyntaxKind.ModifierTag }),
			);
		}
	}
	const parser = new TSDocParser(configuration);
	const exports: ReviewExport[] = [];
	const names = new Set<string>();
	for (const binding of surface.exports) {
		assert.ok(!names.has(binding.name), "Entrypoint exports must have distinct names.");
		names.add(binding.name);
		const declaration = declarations.get(binding.target);
		assert.ok(declaration, "Every export target must have a declaration fact.");
		if (
			declaration.declarations.length === 0 ||
			declaration.declarations.some((source) => source.kind !== "FunctionDeclaration") ||
			declaration.exports.length > 0 ||
			declaration.members.length > 0
		) {
			throw new Error(
				`Package ${facts.packageName}, entrypoint ${entrypoint}, export ${binding.name}: this declaration form is not supported by the function-only report builder.`,
			);
		}
		assert.ok(
			declaration.signatures.length > 0,
			"Function declarations must have callable signatures.",
		);
		const signatures: ReviewSignature[] = [];
		for (const signature of declaration.signatures) {
			const selected = metadata.get(signature.id);
			if (selected !== undefined) {
				// TODO (Stage 2 documentation resolution): Consume resolved content and provenance here.
				// Resolution failures must prevent report construction, not become a guessed documented flag.
				// Keep release classification and selection independent of inherited documentation.
				const comment =
					signature.documentation === undefined
						? undefined
						: parser.parseString(signature.documentation).docComment;
				const blockTags =
					comment
						?.getChildNodes()
						.filter((node): node is DocBlock => node instanceof DocBlock)
						.map((block) => block.blockTag.tagName) ?? [];
				signatures.push({
					text: signature.callSignatureText,
					documented: comment !== undefined && hasDocumentationContent(comment),
					releaseLevel: selected.releaseLevel,
					modifierTags: [...new Set([...selected.modifierTags, ...blockTags])].sort(),
				});
			}
		}
		if (signatures.length > 0) {
			exports.push({
				declarationId: declaration.id,
				declarationName: declaration.name,
				name: binding.name,
				typeOnly: binding.typeOnly,
				signatures,
			});
		}
	}
	return freezeData({
		ok: true,
		value: {
			packageName: facts.packageName,
			surface: selection.name,
			exports: exports.sort((left, right) =>
				left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
			),
		},
	});
}

/**
 * Checks parsed documentation content without treating tag names or comment delimiters as prose.
 *
 * @param node - A node from the official TSDoc parser.
 * @returns Whether the node or its children contain descriptive content.
 */
function hasDocumentationContent(node: DocNode): boolean {
	if (node instanceof DocPlainText) {
		return node.text.trim().length > 0;
	}
	if (node instanceof DocCodeSpan || node instanceof DocFencedCode) {
		return node.code.trim().length > 0;
	}
	// TODO (Stage 2 documentation resolution): Check inherited content, not the request node.
	// Validate API link targets before this presence check; URL destinations must not be fetched.
	if (node instanceof DocLinkTag || node instanceof DocInheritDocTag) {
		return true;
	}
	return node.getChildNodes().some(hasDocumentationContent);
}

/**
 * Presentation settings that do not change classification, selection, or validation.
 */
export interface ReviewPresentationOptions {
	/**
	 * Whether classified release tags appear in report comments.
	 * @defaultValue `true`
	 */
	readonly includeReleaseTags?: boolean;
	/**
	 * Additional recognized tag names to display, including `@`, such as `@sealed`, `@legacy`, or `@deprecated`.
	 *
	 * @remarks
	 * Names are matched exactly against report metadata. Unknown or absent names display nothing.
	 * Does not register tags with TSDoc. Release tags are controlled by `includeReleaseTags`.
	 * @defaultValue No additional tags.
	 */
	readonly additionalTags?: readonly string[];
	/**
	 * Whether items without descriptive documentation receive an `(undocumented)` annotation.
	 * @defaultValue `true`
	 */
	readonly includeUndocumentedNotice?: boolean;
}

/**
 * Formats text as a Markdown code span without interpreting embedded backticks.
 *
 * @param text - Single-line display text.
 * @returns A code span with delimiters longer than any embedded backtick sequence.
 */
function codeSpan(text: string): string {
	const length = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length)) + 1;
	const delimiter = "`".repeat(length);
	return length === 1
		? `${delimiter}${text}${delimiter}`
		: `${delimiter} ${text} ${delimiter}`;
}

/**
 * Renders an experimental function report as deterministic Markdown.
 *
 * @remarks
 * Accepts a report created by {@link createReviewReport}. Does not mutate or sort its input.
 * Uses an API Extractor-like heading, a single TypeScript block, per-overload tag comments,
 * and explicit alias exports. Uses LF line endings and exactly one final newline.
 * Output is review text, not compilable declarations. No baseline is read or updated.
 *
 * @param report - Detached function report in canonical export and overload order.
 * @param options - Tag and undocumented-annotation display settings.
 * @returns The complete Markdown report.
 * @throws If a release level violates the report model's internal contract.
 */
export function renderReviewReport(
	report: ReviewReport,
	options: ReviewPresentationOptions = {},
): string {
	const levels: Readonly<Record<ReleaseLevel, string>> = {
		[ReleaseLevel.Public]: "public",
		[ReleaseLevel.Beta]: "beta",
		[ReleaseLevel.Alpha]: "alpha",
		[ReleaseLevel.Internal]: "internal",
	};
	const groups = new Map<ApiItemId, ReviewExport[]>();
	for (const binding of report.exports) {
		const group = groups.get(binding.declarationId) ?? [];
		group.push(binding);
		groups.set(binding.declarationId, group);
	}
	const usedNames = new Set(report.exports.map((binding) => binding.name));
	const declarations: string[] = [];
	const aliases: string[] = [];
	const releaseTags = new Set(Object.values(levels).map((level) => `@${level}`));
	for (const group of groups.values()) {
		const binding = group[0];
		assert.ok(binding, "Report export groups must not be empty.");
		const direct = group.find(
			(item) =>
				!item.typeOnly && item.name === item.declarationName && item.name !== "default",
		);
		let localName = direct?.name ?? binding.declarationName;
		if (direct === undefined) {
			if (!localName || localName === "default") {
				localName = "apiFunction";
			}
			const baseName = localName;
			let suffix = 1;
			while (usedNames.has(localName)) {
				localName = `${baseName}_${suffix++}`;
			}
		}
		usedNames.add(localName);
		for (const signature of binding.signatures) {
			const tags: string[] = [];
			if (signature.releaseLevel !== undefined) {
				const level = levels[signature.releaseLevel];
				assert.ok(
					level !== undefined,
					"Review signatures must have supported release levels.",
				);
				if (options.includeReleaseTags !== false) {
					tags.push(`@${level}`);
				}
			}
			tags.push(
				...signature.modifierTags.filter(
					(tag) => !releaseTags.has(tag) && options.additionalTags?.includes(tag),
				),
			);
			if (options.includeUndocumentedNotice !== false && !signature.documented) {
				tags.push("(undocumented)");
			}
			const comment = tags.length > 0 ? `// ${tags.join(" ")}\n` : "";
			declarations.push(
				`${comment}${direct === undefined ? "declare" : "export"} function ${localName}${signature.text.replace(/\r\n?/g, "\n").trimEnd()}`,
			);
		}
		for (const exported of group) {
			if (exported !== direct) {
				const exportName = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(exported.name)
					? exported.name
					: JSON.stringify(exported.name);
				aliases.push(
					`export ${exported.typeOnly ? "type " : ""}{ ${localName}${exported.name === localName ? "" : ` as ${exportName}`} };`,
				);
			}
		}
	}
	const body = [...declarations, ...aliases.sort()].join("\n\n") || "// No selected exports.";
	const fence = "`".repeat(
		Math.max(3, ...(body.match(/`+/g) ?? []).map((run) => run.length + 1)),
	);
	return [
		`## API Report File for ${JSON.stringify(report.packageName)}`,
		"",
		"> Generated by api-analyzer. Do not edit directly.",
		"",
		`Surface: ${codeSpan(JSON.stringify(report.surface))}`,
		"",
		`${fence}ts`,
		body,
		fence,
		"",
	].join("\n");
}

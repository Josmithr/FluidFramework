import assert from "node:assert/strict";
import {
	DocPlainText,
	DocCodeSpan,
	DocFencedCode,
	DocLinkTag,
	type DocNode,
} from "@microsoft/tsdoc";
import {
	ReleaseLevel,
	selectApiItems,
	type ApiClassification,
	type ApiItemSelection,
} from "./classification.js";
import {
	bindDocumentationLinks,
	bindDocumentationReferences,
	resolveDocumentation,
	type ResolvedDocumentation,
} from "./documentation.js";
import type { ApiItemId } from "./facts.js";
import type { AnalysisContext } from "./documentationContext.js";
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
	 * Whether effective documentation contains descriptive content.
	 *
	 * @remarks
	 * Absent, empty, and metadata-only comments are undocumented, including empty inherited content.
	 * Inheritance requests must resolve successfully before a report is constructed.
	 * Measures content presence, not documentation quality or completeness.
	 */
	readonly documented: boolean;
	/**
	 * The classified release level, or `undefined` for a permitted untagged signature.
	 */
	readonly releaseLevel: ReleaseLevel | undefined;
	/**
	 * Recognized tags available for presentation, including release tags and block tags such as `@deprecated`.
	 * Sorted and deduplicated. Block tags come from the local comment, not inherited content.
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
 * A fixed export record with signature identifiers used only for selection.
 */
interface PreparedExport extends Omit<ReviewExport, "signatures"> {
	/**
	 * Complete signature records in compiler order.
	 */
	readonly signatures: readonly (ReviewSignature & { readonly id: ApiItemId })[];
}

/**
 * A prepared surface with an explanation when its declaration forms are unsupported.
 */
interface PreparedSurface {
	/**
	 * Frozen export records sorted by exported name.
	 */
	readonly exports: readonly PreparedExport[];
	/**
	 * The first unsupported export in input order, or undefined for a supported surface.
	 */
	readonly unsupported: string | undefined;
}

/**
 * Report data that no longer depends on compiler facts or mutable parsed comments.
 *
 * @remarks
 * Records and classification are frozen. The internal surface map is constructed once and then read only.
 */
export interface PreparedReviewData {
	/**
	 * Package identity shared by all reports.
	 */
	readonly packageName: string;
	/**
	 * Original metadata used to validate each new selection request.
	 */
	readonly classification: ApiClassification;
	/**
	 * Complete report records, with unsupported output forms recorded once per surface.
	 */
	readonly surfaces: ReadonlyMap<string, PreparedSurface>;
}

/**
 * Prepares all callable documentation once, independently of entrypoint and report selection.
 *
 * @remarks
 * Binds inheritance and API links and resolves all supplied signature comments before selection.
 * Measures effective content but retains original block tags for report annotations.
 * Does not select APIs, query the compiler, or write files.
 * Consumes the context's parsed comments through one inheritance resolution pass.
 * Copies report fields so later report generation does not retain mutable TSDoc nodes or source records.
 *
 * @param context - The indexed analysis with original classification and unresolved parsed comments.
 * @returns Prepared inputs or documentation diagnostics without partial data.
 * @throws If facts violate internal identity or documentation invariants.
 */
export function prepareReviewReport(context: AnalysisContext): Result<PreparedReviewData> {
	const { facts, declarations } = context;
	const documentation = resolveReportDocumentation(context);
	if (!documentation.ok) {
		return documentation;
	}
	// Capture effective content after inheritance, but keep the original tags for annotations.
	const signatures = new Map<ApiItemId, ReviewSignature & { readonly id: ApiItemId }>();
	for (const item of context.items.values()) {
		const metadata = context.metadata.get(item.id);
		assert.ok(metadata, "Prepared signatures must have original classification metadata.");
		signatures.set(item.id, {
			id: item.id,
			text: item.signature.callSignatureText,
			documented: hasDocumentationContent(item.parsed.docComment),
			releaseLevel: metadata.releaseLevel,
			modifierTags: [...new Set([...metadata.modifierTags, ...item.originalBlockTags])].sort(),
		});
	}
	// Resolve and validate fixed export data once; report calls only filter these records.
	const surfaces = new Map<string, PreparedSurface>();
	for (const surface of facts.surfaces) {
		const names = new Set<string>();
		assert.ok(!surfaces.has(surface.name), "Entrypoint facts must have distinct names.");
		let unsupported: string | undefined;
		const exports = surface.exports.map((binding) => {
			assert.ok(!names.has(binding.name), "Entrypoint exports must have distinct names.");
			names.add(binding.name);
			const declaration = declarations.get(binding.target);
			assert.ok(declaration, "Every export target must have a declaration fact.");
			// TODO (Stage 2 report declarations): Prepare class, interface, and merged-declaration records.
			if (
				declaration.declarations.length === 0 ||
				declaration.declarations.some((source) => source.kind !== "FunctionDeclaration") ||
				declaration.exports.length > 0 ||
				declaration.members.length > 0
			) {
				unsupported ??= `Package ${facts.packageName}, entrypoint ${surface.name}, export ${binding.name}: this declaration form is not supported by the function-only report builder.`;
			} else {
				assert.ok(
					declaration.signatures.length > 0,
					"Function declarations must have callable signatures.",
				);
			}
			return {
				declarationId: declaration.id,
				declarationName: declaration.name,
				name: binding.name,
				typeOnly: binding.typeOnly,
				signatures: declaration.signatures.map((signature) => {
					const prepared = signatures.get(signature.id);
					assert.ok(prepared, "Collected signatures must have prepared report data.");
					return prepared;
				}),
			};
		});
		exports.sort((left, right) =>
			left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
		);
		surfaces.set(surface.name, freezeData({ exports, unsupported }));
	}
	return {
		ok: true,
		value: {
			packageName: facts.packageName,
			surfaces,
			classification: context.classification,
		},
	};
}

/**
 * Constructs a selected report without repeating parsing or shared semantic validation.
 *
 * @param prepared - Shared inputs produced once by report preparation.
 * @param entrypoint - Configured entrypoint name to report.
 * @param selection - Caller-supplied release levels and tag filters, validated for each report.
 * @returns A frozen report or diagnostics for an invalid selection or unknown entrypoint.
 * @throws If the entrypoint contains unsupported declaration forms.
 */
export function createReviewReport(
	prepared: PreparedReviewData,
	entrypoint: string,
	selection: ApiItemSelection,
): Result<ReviewReport> {
	const { packageName, surfaces } = prepared;
	const surface = surfaces.get(entrypoint);
	if (surface === undefined) {
		return failure(
			DiagnosticCode.ReportConfiguration,
			`Package ${packageName}: entrypoint ${entrypoint} is not configured. Request a configured entrypoint.`,
		);
	}
	const selected = selectApiItems(prepared.classification, selection);
	if (!selected.ok) {
		return selected;
	}
	if (surface.unsupported !== undefined) {
		throw new Error(surface.unsupported);
	}
	const selectedIds = new Set(selected.value.items.map((item) => item.id));
	const exports: ReviewExport[] = [];
	for (const entry of surface.exports) {
		const signatures = entry.signatures
			.filter((signature) => selectedIds.has(signature.id))
			.map(({ id: _id, ...signature }) => signature);
		if (signatures.length > 0) {
			exports.push({ ...entry, signatures });
		}
	}
	return freezeData({
		ok: true,
		value: {
			packageName,
			surface: selection.name,
			exports,
		},
	});
}

/**
 * Resolves all signature comments before a report applies its metadata selection.
 *
 * @param context - Original parsed comments, fact indexes, and classification from one invocation.
 * @returns Effective comments and link provenance, or unchanged binding and resolution diagnostics.
 * @throws If lookup data or bindings violate internal invariants.
 */
function resolveReportDocumentation(
	context: AnalysisContext,
): Result<readonly ResolvedDocumentation[]> {
	const inheritance = bindDocumentationReferences(context);
	if (!inheritance.ok) {
		return inheritance;
	}
	const links = bindDocumentationLinks(context);
	if (!links.ok) {
		return links;
	}
	return resolveDocumentation(context, inheritance.value, {
		linkValidation: { bindings: links.value, metadata: context.metadata },
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
	// API links have passed policy validation; URL links require no destination access.
	if (node instanceof DocLinkTag) {
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
					(tag) => !releaseTags.has(tag) && options.additionalTags?.includes(tag) === true,
				),
			);
			if (options.includeUndocumentedNotice !== false && !signature.documented) {
				tags.push("(undocumented)");
			}
			const comment = tags.length > 0 ? `// ${tags.join(" ")}\n` : "";
			declarations.push(
				`${comment}${direct === undefined ? "declare" : "export"} function ${localName}${signature.text.replaceAll(/\r\n?/g, "\n").trimEnd()}`,
			);
		}
		for (const exported of group) {
			if (exported !== direct) {
				const exportName = /^[$A-Z_a-z][\w$]*$/.test(exported.name)
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

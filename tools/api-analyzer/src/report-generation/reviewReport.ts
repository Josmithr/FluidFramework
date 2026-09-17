import assert from "node:assert/strict";
import {
	ReleaseLevel,
	selectApiItems,
	type ApiClassification,
	type ApiItemSelection,
} from "../analysis-types/classification.js";
import type {
	ApiItemId,
	ExportFact,
	DeclarationFact,
	DeclarationStatementFact,
} from "../analysis-types/facts.js";
import type { CompletedAnalysis } from "../analysis-types/completedGraph.js";
import { DiagnosticCode, failure, type Result } from "../analysis-types/result.js";
import { freezeData } from "../utilities/freezeData.js";

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
 * A selected namespace with independently selected exports and original annotations.
 */
export interface ReviewNamespace extends ReviewSignature {
	/**
	 * Selected nested bindings in canonical export order.
	 */
	readonly exports: readonly ReviewExport[];
}

/**
 * A selected atomic declaration whose name is supplied by its exported binding.
 */
export interface ReviewStatement extends ReviewSignature, DeclarationStatementFact {}

/**
 * A selected container header and independently selected member declarations.
 */
export interface ReviewContainer extends ReviewStatement {
	/**
	 * Selected member syntax with effective documentation status and original annotations.
	 */
	readonly members: readonly ReviewSignature[];
}

/**
 * An exported declaration binding with independently selected members or overloads.
 */
export interface ReviewExport {
	/**
	 * Independently selected nested namespace exports and original namespace metadata.
	 * @defaultValue Omitted for non-namespace declarations.
	 */
	readonly namespace?: ReviewNamespace;
	/**
	 * Selected atomic declaration syntax and metadata.
	 * @defaultValue Omitted for functions, namespaces, and containers.
	 */
	readonly statement?: ReviewStatement;
	/**
	 * Selected container declaration and its effective members.
	 * @defaultValue Omitted for declarations other than classes, interfaces, and enums.
	 */
	readonly container?: ReviewContainer;
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
 * A detached, experimental selected-declaration review report.
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
 * A prepared item retaining its original identity for selection.
 */
interface PreparedSignature extends ReviewSignature {
	/**
	 * Original documentation input identity, removed from selected records.
	 */
	readonly id: ApiItemId;
}

/**
 * A namespace with identities retained throughout its export tree.
 */
interface PreparedNamespace extends PreparedSignature {
	/**
	 * Complete nested bindings before selection.
	 */
	readonly exports: readonly PreparedExport[];
}

/**
 * Atomic declaration syntax with its selection identity.
 */
interface PreparedStatement extends PreparedSignature, DeclarationStatementFact {}

/**
 * Container syntax with member identities retained for independent selection.
 */
interface PreparedContainer extends PreparedStatement {
	/**
	 * Complete member records in extraction order.
	 */
	readonly members: readonly PreparedSignature[];
}

/**
 * A fixed export record with item identifiers used only for selection.
 */
interface PreparedExport
	extends Omit<ReviewExport, "signatures" | "container" | "statement" | "namespace"> {
	/**
	 * Original namespace identity and recursively prepared exports.
	 * @defaultValue Omitted for non-namespace or unsupported namespace records.
	 */
	readonly namespace?: PreparedNamespace;
	/**
	 * Atomic declaration identity retained for selection.
	 * @defaultValue Omitted when no atomic statement representation exists.
	 */
	readonly statement?: PreparedStatement;
	/**
	 * Container and member identities retained for independent selection.
	 * @defaultValue Omitted for non-container or unsupported container records.
	 */
	readonly container?: PreparedContainer;
	/**
	 * Complete signature records in compiler order.
	 */
	readonly signatures: readonly PreparedSignature[];
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
 * Prepares fixed report records from completed semantic data.
 *
 * @remarks
 * Uses resolved content status and original metadata without parsing or resolving documentation.
 * Does not select APIs, query the compiler, or write files.
 * Copies report fields without changing the completed graph.
 *
 * @param graph - Immutable completed analysis for the supported callable scope.
 * @returns Prepared report records without compiler or parser state.
 * @throws If facts violate internal identity or documentation invariants.
 */
export function prepareReviewReport(graph: CompletedAnalysis): PreparedReviewData {
	const { facts } = graph;
	const declarations = new Map(
		facts.declarations.map((declaration) => [declaration.id, declaration]),
	);
	const metadataById = new Map(graph.classification.items.map((item) => [item.id, item]));
	const documentationById = new Map(graph.documentation.map((item) => [item.id, item]));
	// Capture effective content after inheritance, but keep the original tags for annotations.
	const signatures = new Map<ApiItemId, PreparedSignature>();
	for (const item of facts.declarations.flatMap((declaration) => [
		...(declaration.documentationContext === undefined ? declaration.signatures : []),
		...declaration.members.flatMap((member) =>
			member.documentationContext === undefined ? member.signatures : [],
		),
	])) {
		const metadata = metadataById.get(item.id);
		assert.ok(metadata, "Prepared signatures must have original classification metadata.");
		const documentation = documentationById.get(item.id);
		assert.ok(documentation, "Prepared signatures must have completed documentation.");
		signatures.set(item.id, {
			id: item.id,
			text: item.callSignatureText,
			documented: documentation.documented,
			releaseLevel: metadata.releaseLevel,
			modifierTags: [
				...new Set([...metadata.modifierTags, ...documentation.originalBlockTags]),
			].sort(),
		});
	}
	/**
	 * Joins rendered syntax to completed content status without reclassifying inherited tags.
	 * @param id - Original documentation input identity.
	 * @param text - Detached compiler-derived syntax.
	 * @returns An independently selectable record with original annotations.
	 */
	function prepareItem(id: ApiItemId, text: string): PreparedSignature {
		const metadata = metadataById.get(id);
		const documentation = documentationById.get(id);
		assert.ok(
			metadata && documentation,
			"Prepared items must have original metadata and completed documentation.",
		);
		return {
			id,
			text,
			documented: documentation.documented,
			releaseLevel: metadata.releaseLevel,
			modifierTags: [
				...new Set([...metadata.modifierTags, ...documentation.originalBlockTags]),
			].sort(),
		};
	}
	// Resolve and validate fixed export data once; report calls only filter these records.
	const surfaces = new Map<string, PreparedSurface>();
	for (const surface of facts.surfaces) {
		assert.ok(!surfaces.has(surface.name), "Entrypoint facts must have distinct names.");
		let unsupported: string | undefined;
		/**
		 * Prepares one namespace level and retains the first unsupported-form explanation.
		 * @param bindings - Exported bindings at this level.
		 * @param active - Namespace identities already on the path, for cycle detection.
		 * @returns Sorted prepared bindings without applying a report selection.
		 */
		function prepareEntries(
			bindings: readonly ExportFact[],
			active: ReadonlySet<ApiItemId>,
		): PreparedExport[] {
			const names = new Set<string>();
			const exports = bindings.map((binding): PreparedExport => {
				assert.ok(!names.has(binding.name), "Entrypoint exports must have distinct names.");
				names.add(binding.name);
				const declaration = declarations.get(binding.target);
				assert.ok(declaration, "Every export target must have a declaration fact.");
				let namespace: PreparedExport["namespace"];
				if (
					declaration.documentationContext !== undefined &&
					declaration.declarations.every((source) => source.kind === "ModuleDeclaration")
				) {
					if (active.has(declaration.id)) {
						unsupported ??= `Package ${facts.packageName}, entrypoint ${surface.name}: recursive namespace export ${binding.name} requires an alias reference representation.`;
					} else {
						namespace = {
							...prepareItem(declaration.id, ""),
							exports: prepareEntries(
								declaration.exports,
								new Set([...active, declaration.id]),
							),
						};
					}
				}
				let container: PreparedExport["container"];
				const statement =
					declaration.statement === undefined
						? undefined
						: { ...prepareItem(declaration.id, ""), ...declaration.statement };
				if (declaration.container !== undefined) {
					container = prepareContainer(declaration, documentationById, prepareItem);
					if (container === undefined) {
						unsupported ??= `Package ${facts.packageName}, entrypoint ${surface.name}, export ${binding.name}: container members require unsupported syntax or comment ownership.`;
					}
				} else if (
					namespace === undefined &&
					statement === undefined &&
					(declaration.declarations.length === 0 ||
						declaration.declarations.some((source) => source.kind !== "FunctionDeclaration") ||
						declaration.exports.length > 0 ||
						declaration.members.length > 0)
				) {
					unsupported ??= `Package ${facts.packageName}, entrypoint ${surface.name}, export ${binding.name}: this declaration form is not supported by the function-only report builder.`;
				} else if (statement === undefined && namespace === undefined) {
					assert.ok(
						declaration.signatures.length > 0,
						"Function declarations must have callable signatures.",
					);
				}
				return {
					...(namespace === undefined ? {} : { namespace }),
					...(container === undefined ? {} : { container }),
					...(statement === undefined ? {} : { statement }),
					declarationId: declaration.id,
					declarationName: declaration.name,
					name: binding.name,
					typeOnly: binding.typeOnly,
					signatures: (declaration.documentationContext === undefined
						? declaration.signatures
						: []
					).map((signature) => {
						const prepared = signatures.get(signature.id);
						assert.ok(prepared, "Collected signatures must have prepared report data.");
						return prepared;
					}),
				};
			});
			exports.sort((left, right) =>
				left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
			);
			return exports;
		}
		const preparedExports = prepareEntries(surface.exports, new Set());
		surfaces.set(surface.name, freezeData({ exports: preparedExports, unsupported }));
	}
	return { packageName: facts.packageName, surfaces, classification: graph.classification };
}

/**
 * Prepares supported container members without duplicating their declared and effective views.
 * @param declaration - Owning declaration with detached container syntax.
 * @param documentation - Completed documentation indexed by original input identity.
 * @param prepareItem - Joins syntax with the invocation's completed metadata.
 * @returns Prepared container data, or undefined when syntax or member ownership is unsupported.
 */
function prepareContainer(
	declaration: DeclarationFact,
	documentation: ReadonlyMap<ApiItemId, CompletedAnalysis["documentation"][number]>,
	prepareItem: (id: ApiItemId, text: string) => PreparedSignature,
): PreparedContainer | undefined {
	const syntax = declaration.container;
	assert.ok(syntax, "Container preparation requires detached container syntax.");
	// Accessors and visibility-specific declarations can also appear in the effective member view.
	// Keep their declared syntax once, rather than rendering a second property representation.
	const effectiveMembers = declaration.members.filter(
		(member) =>
			!syntax.declaredMembers.some((record) =>
				member.declarations.some(
					(source) => source.file === record.file && source.start === record.start,
				),
			),
	);
	if (
		!syntax.supported ||
		(declaration.memberView === "partial" && syntax.kind !== "enum") ||
		effectiveMembers.some(
			(member) => member.signatures.length === 0 && !documentation.has(member.id),
		)
	)
		return undefined;
	const members = [
		...syntax.declaredMembers.map((member) => prepareItem(member.id, member.printed)),
		...effectiveMembers.flatMap((member) =>
			member.signatures.length > 0 && member.documentationContext === undefined
				? member.signatures.map((signature) =>
						prepareItem(
							signature.id,
							`${member.name}${member.optional ? "?" : ""}${signature.callSignatureText}`,
						),
					)
				: [
						prepareItem(
							member.id,
							`${member.readonly === true ? "readonly " : ""}${member.name}${member.optional ? "?" : ""}: ${member.type};`,
						),
					],
		),
	];
	return {
		...prepareItem(declaration.id, ""),
		prefix: syntax.prefix,
		suffix: syntax.suffix,
		members,
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
	/**
	 * Selects a namespace tree without changing the shared prepared records.
	 * @param entries - Complete bindings at one namespace level.
	 * @returns Selected records with internal selection identities removed from their items.
	 */
	function selectEntries(entries: readonly PreparedExport[]): ReviewExport[] {
		const exports: ReviewExport[] = [];
		for (const entry of entries) {
			if (entry.namespace !== undefined) {
				if (selectedIds.has(entry.namespace.id)) {
					const { id: _id, exports: nested, ...namespace } = entry.namespace;
					exports.push({
						...entry,
						namespace: { ...namespace, exports: selectEntries(nested) },
						signatures: [],
					});
				}
				continue;
			}
			if (entry.statement !== undefined) {
				if (selectedIds.has(entry.statement.id)) {
					const { id: _id, ...statement } = entry.statement;
					exports.push({ ...entry, statement, signatures: [] });
				}
				continue;
			}
			if (entry.container !== undefined) {
				if (selectedIds.has(entry.container.id)) {
					const { id: _id, members, ...container } = entry.container;
					exports.push({
						...entry,
						signatures: [],
						container: {
							...container,
							members: members
								.filter((member) => selectedIds.has(member.id))
								.map(({ id: _memberId, ...member }) => member),
						},
					});
				}
				continue;
			}
			const signatures = entry.signatures
				.filter((signature) => selectedIds.has(signature.id))
				.map(({ id: _id, ...signature }) => signature);
			if (signatures.length > 0) {
				exports.push({ ...entry, signatures });
			}
		}
		return exports;
	}
	return freezeData({
		ok: true,
		value: {
			packageName,
			surface: selection.name,
			exports: selectEntries(surface.exports),
		},
	});
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
 * @param options - Display settings. Omit to show release tags and undocumented notices without additional tags.
 * @returns The complete Markdown report.
 * @throws If a release level violates the report model's internal contract.
 */
export function renderReviewReport(
	report: ReviewReport,
	options: ReviewPresentationOptions = {},
): string {
	const body = renderDeclarationText(report.exports, options);
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

/**
 * Renders selected declarations within one lexical namespace without Markdown framing.
 * @param exports - Selected exported bindings in canonical order.
 * @param options - Annotation presentation settings.
 * @returns Declaration-oriented text, including required exported aliases.
 */
function renderDeclarationText(
	exports: readonly ReviewExport[],
	options: ReviewPresentationOptions,
): string {
	const levels: Readonly<Record<ReleaseLevel, string>> = {
		[ReleaseLevel.Public]: "public",
		[ReleaseLevel.Beta]: "beta",
		[ReleaseLevel.Alpha]: "alpha",
		[ReleaseLevel.Internal]: "internal",
	};
	const groups = new Map<ApiItemId, ReviewExport[]>();
	for (const binding of exports) {
		const group = groups.get(binding.declarationId) ?? [];
		group.push(binding);
		groups.set(binding.declarationId, group);
	}
	const usedNames = new Set(exports.map((binding) => binding.name));
	const declarations: string[] = [];
	const aliases: string[] = [];
	const releaseTags = new Set(Object.values(levels).map((level) => `@${level}`));
	function commentFor(signature: ReviewSignature): string {
		const tags: string[] = [];
		if (signature.releaseLevel !== undefined) {
			const level = levels[signature.releaseLevel];
			assert.ok(level !== undefined, "Review signatures must have supported release levels.");
			if (options.includeReleaseTags !== false) tags.push(`@${level}`);
		}
		tags.push(
			...signature.modifierTags.filter(
				(tag) => !releaseTags.has(tag) && options.additionalTags?.includes(tag) === true,
			),
		);
		if (options.includeUndocumentedNotice !== false && !signature.documented)
			tags.push("(undocumented)");
		return tags.length > 0 ? `// ${tags.join(" ")}\n` : "";
	}
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
		if (binding.namespace !== undefined) {
			const nested = renderDeclarationText(binding.namespace.exports, options)
				.split("\n")
				.map((line) => (line.length > 0 ? `    ${line}` : ""))
				.join("\n");
			declarations.push(
				`${commentFor(binding.namespace)}${direct === undefined ? "declare" : "export"} namespace ${localName} {\n${nested}\n}`,
			);
		}
		if (binding.statement !== undefined) {
			const statement = binding.statement;
			declarations.push(
				`${commentFor(statement)}${direct === undefined ? "declare" : "export"} ${statement.prefix}${localName}${statement.suffix}`,
			);
		}
		if (binding.container !== undefined) {
			const container = binding.container;
			const memberText = container.members
				.map((member) =>
					`${commentFor(member)}${member.text}`
						.split("\n")
						.map((line) => `    ${line}`)
						.join("\n"),
				)
				.join("\n");
			declarations.push(
				`${commentFor(container)}${direct === undefined ? "declare" : "export"} ${container.prefix}${localName}${container.suffix} {${memberText ? `\n${memberText}\n` : ""}}`,
			);
		}
		for (const signature of binding.signatures) {
			const comment = commentFor(signature);
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
	return [...declarations, ...aliases.sort()].join("\n\n") || "// No selected exports.";
}

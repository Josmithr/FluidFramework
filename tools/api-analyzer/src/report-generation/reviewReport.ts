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
	DocumentationReferenceContext,
} from "../analysis-types/facts.js";
import type { CompletedAnalysis } from "../analysis-types/completedGraph.js";
import { DiagnosticCode, reportFailure, type Result } from "../analysis-types/result.js";
import { freezeData } from "../utilities/freezeData.js";

/**
 * Review metadata and a syntax fragment for a selected signature or declaration item.
 */
export interface ReviewSignature {
	/**
	 * Original declaring container of an inherited member, independent of documentation inheritance.
	 * @defaultValue Omitted for directly declared items or unavailable declaring-container metadata.
	 */
	readonly inheritedFrom?: {
		/**
		 * Name of the original declaring container, not the nearest base type.
		 */
		readonly name: string;

		/**
		 * Owning package when the member comes from another package.
		 * @defaultValue Omitted for members declared in the package being reported.
		 */
		readonly packageName?: string;
	};

	/**
	 * The compiler-derived syntax fragment rendered for this item.
	 *
	 * @remarks
	 * For a top-level function signature, contains the parameter list and return type without the function name,
	 * such as `(value: string): string;`.
	 * For a container member, contains the complete member declaration, such as `readonly value: string;`.
	 * Namespace, atomic declaration, and container-header records use an empty string because their syntax is stored separately.
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
	 *
	 * @remarks
	 * Comes from the item's original metadata, not release tags in inherited documentation.
	 * An undefined value produces no release annotation; it does not mean that the item is internal.
	 */
	readonly releaseLevel: ReleaseLevel | undefined;

	/**
	 * Recognized tags available for presentation, including release tags and block tags such as `@deprecated`.
	 *
	 * @remarks
	 * Sorted and deduplicated. Block tags come from the local comment, not inherited content.
	 * Stores tag names, not their descriptive text. For example, a deprecation message is not included.
	 * Availability does not imply display: {@link ReviewPresentationOptions} controls which tags are rendered.
	 */
	readonly modifierTags: readonly string[];
}

/**
 * A selected namespace with its complete export tree and original annotations.
 */
export interface ReviewNamespace extends ReviewSignature {
	/**
	 * The identifier of an enclosing namespace that this entry aliases.
	 *
	 * @remarks
	 * The renderer emits the alias instead of expanding the target's exports again.
	 * This prevents infinite expansion for recursive namespace exports.
	 *
	 * @defaultValue Omitted for ordinary namespace declarations; their exports are rendered recursively.
	 *
	 * @example Recursive namespace alias
	 * The report record for `self` sets `reference` to the identifier of `Operations`.
	 * The renderer emits the alias shown below instead of expanding `Operations` again.
	 *
	 * ```typescript
	 * export namespace Operations {
	 *     export import self = Operations;
	 * }
	 * ```
	 */
	readonly reference?: ApiItemId;

	/**
	 * Selected nested bindings in canonical export order.
	 *
	 * @remarks
	 * Sorted by exported name. Selecting the namespace retains every supported exported binding.
	 * Empty when {@link ReviewNamespace.reference} is present because the target is represented by an alias.
	 * An ordinary namespace can also have an empty array when it exports no bindings.
	 */
	readonly exports: readonly ReviewExport[];
}

/**
 * A selected atomic declaration whose name is supplied by its exported binding.
 */
export interface ReviewStatement extends ReviewSignature, DeclarationStatementFact {}

/**
 * A selected container header and its complete supported member declarations.
 */
export interface ReviewContainer extends ReviewStatement {
	/**
	 * Separate interface syntax for call and construct signatures merged with a class.
	 * @defaultValue Omitted for containers that can render all members in one declaration.
	 */
	readonly augmentation?: {
		/**
		 * Interface type parameters and heritage after the shared declaration name.
		 */
		readonly suffix: string;

		/**
		 * Call and construct signatures that cannot be placed in the class body.
		 */
		readonly members: readonly ReviewSignature[];
	};

	/**
	 * Selected member syntax with effective documentation status and original annotations.
	 *
	 * @remarks
	 * Can include inherited effective members as well as declared constructors, static members, and accessors.
	 * Inherited members retain their original declaring-container provenance for separate source annotations.
	 * Each item's text is a complete member declaration, not a standalone function signature.
	 * Selecting the container retains all these members, regardless of their custom tags or inherited release levels.
	 */
	readonly members: readonly ReviewSignature[];
}

/**
 * An exported declaration binding with complete container contents or selected standalone overloads.
 */
export interface ReviewExport {
	/**
	 * Complete nested namespace exports and effective namespace metadata.
	 * @defaultValue Omitted for non-namespace declarations.
	 */
	readonly namespace?: ReviewNamespace;

	/**
	 * Selected atomic declaration syntax and metadata.
	 *
	 * @remarks
	 * Represents a variable or type alias whose compiler-derived syntax surrounds the name chosen by the renderer.
	 * This is an alternative to namespace, container, or callable-signature output, not an additional declaration.
	 *
	 * @defaultValue Omitted for functions, namespaces, and containers.
	 */
	readonly statement?: ReviewStatement;

	/**
	 * Selected container declaration and its effective members.
	 * @defaultValue Omitted for declarations other than classes, interfaces, and enums.
	 */
	readonly container?: ReviewContainer;

	/**
	 * The identifier of the declaration targeted by this exported binding.
	 *
	 * @remarks
	 * Multiple exported names can share this identifier.
	 * Within one namespace scope, the renderer groups those bindings and emits their shared declaration once.
	 * The identifier is not rendered and is not the exported name.
	 */
	readonly declarationId: ApiItemId;

	/**
	 * The compiler's declaration name, used as a local name when it is not directly exported.
	 *
	 * @remarks
	 * Can differ from {@link ReviewExport.name} when the declaration is exported under an alias.
	 * The renderer can replace or suffix this name to avoid missing names, default-export names, or collisions.
	 * This field therefore does not guarantee the local name in the rendered report.
	 */
	readonly declarationName: string;

	/**
	 * The exported name, not the implementation symbol's name.
	 *
	 * @example Multiple names for one declaration
	 * These exports produce two records with the same `declarationId` and `declarationName` (`original`).
	 * Their `name` values are `original` and `renamed`.
	 *
	 * ```typescript
	 * declare function original(): void;
	 * export { original, original as renamed };
	 * ```
	 */
	readonly name: string;

	/**
	 * Whether this binding is exposed only through type-only export paths.
	 *
	 * @remarks
	 * Describes the export path, not whether the underlying declaration has a runtime value.
	 * A false value does not make an interface available as a value.
	 * Different bindings of the same declaration can have different values for this property.
	 *
	 * @example Value and type-only aliases
	 * The `Widget` binding has `typeOnly: false`; the `WidgetType` binding has `typeOnly: true`.
	 * Both bindings target the same class declaration.
	 *
	 * ```typescript
	 * declare class Widget {}
	 * export { Widget };
	 * // The alias exposes the type, not the constructor value.
	 * export type { Widget as WidgetType };
	 * ```
	 */
	readonly typeOnly: boolean;

	/**
	 * Selected callable signatures in compiler order.
	 *
	 * @remarks
	 * Order is significant for overload resolution. Do not sort by signature text or identifier.
	 * Contains only callable overloads that survive selection.
	 * Empty when this binding uses the namespace, statement, or container representation instead.
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
	 * The package's documentation comment, shared by all entrypoint reports.
	 * @defaultValue Omitted when the package has no documentation comment; no missing-comment notice is rendered.
	 */
	readonly packageDocumentation?: string;

	/**
	 * The name of the package that exposes this surface.
	 */
	readonly packageName: string;

	/**
	 * The selection name used as the review identity, independent of physical entrypoint paths.
	 *
	 * @remarks
	 * A report for the `browser` entrypoint with a selection named `public` has the surface name `public`.
	 * This is the label rendered in the report, not the key used to look up the entrypoint in prepared data.
	 */
	readonly surface: string;

	/**
	 * Selected bindings sorted by exported name.
	 *
	 * @remarks
	 * Each record represents an exported name, so aliases of one declaration remain separate records.
	 * Empty when no exported bindings survive selection, including non-callable declarations.
	 */
	readonly exports: readonly ReviewExport[];
}

/**
 * A prepared item retaining its original identity for selection.
 */
interface PreparedSignature extends ReviewSignature {
	/**
	 * Original documentation input identity, removed from selected records.
	 *
	 * @remarks
	 * Matches the classification record used for selection.
	 * Overloads and members can have selection identifiers different from their containing declaration's identifier.
	 */
	readonly id: ApiItemId;
}

/**
 * A namespace with identities retained throughout its export tree.
 */
interface PreparedNamespace extends PreparedSignature {
	/**
	 * The identifier of an enclosing namespace represented by this alias.
	 *
	 * @remarks
	 * Has the same meaning as {@link ReviewNamespace.reference}, before report selection.
	 * When present, exports is empty and preparation does not expand the target namespace again.
	 *
	 * @defaultValue Omitted for namespace declarations that are expanded normally.
	 */
	readonly reference?: ApiItemId;

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
 * Container syntax with member identities retained for metadata lookup.
 */
interface PreparedContainer extends PreparedStatement {
	/**
	 * Atomic interface augmentation already joined with original member metadata.
	 * @defaultValue Omitted when the class has no callable or constructable interface augmentation.
	 */
	readonly augmentation?: NonNullable<ReviewContainer["augmentation"]>;

	/**
	 * Complete declared and effective member records before selection.
	 *
	 * @remarks
	 * Declared syntax records come first, followed by effective members not already represented by those records.
	 * This avoids emitting an accessor both as declared syntax and as an effective property.
	 * The array is not a single source-order list across inherited and local declarations.
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
	 * Container and member identities retained for classification and metadata lookup.
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
	 * An explanation of the first unsupported declaration form encountered while preparing this surface.
	 *
	 * @remarks
	 * Undefined means that no unsupported form was found.
	 * When present, report generation fails even if the requested selection would exclude the unsupported declaration.
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
	 * The single package documentation comment retained independently of surface preparation.
	 * @defaultValue Omitted when the analyzed package has no documentation comment.
	 */
	readonly packageDocumentation?: string;

	/**
	 * Package identity shared by all reports.
	 */
	readonly packageName: string;

	/**
	 * Original metadata used to validate each new selection request.
	 *
	 * @remarks
	 * Retains the complete classification rather than the result of a previous report selection.
	 * Different reports can therefore apply independent selections to the same prepared data.
	 */
	readonly classification: ApiClassification;

	/**
	 * Complete report records, with unsupported output forms recorded once per surface.
	 *
	 * @remarks
	 * Keys are configured entrypoint names, such as `browser` or `node`, not selection names such as `public`.
	 * Values contain records before release-level and tag filtering.
	 * The map is constructed once and is not modified when reports are requested.
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
 * @param graph - Immutable completed analysis for supported declarations and members.
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
		...(declaration.documentationContext === undefined ||
		declaration.declarations.some((source) => source.kind === "FunctionDeclaration")
			? declaration.signatures
			: []),
		...declaration.members.flatMap((member) =>
			member.documentationContext === undefined ? member.signatures : [],
		),
	])) {
		const metadata = metadataById.get(item.id);
		assert(
			metadata !== undefined,
			"Prepared signatures must have original classification metadata.",
		);
		const documentation = documentationById.get(item.id);
		assert(
			documentation !== undefined,
			"Prepared signatures must have completed documentation.",
		);
		signatures.set(item.id, {
			id: item.id,
			text: item.normalized.callSignatureText,
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
		assert(
			metadata !== undefined && documentation !== undefined,
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
		assert(!surfaces.has(surface.name), "Entrypoint facts must have distinct names.");
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
				assert(!names.has(binding.name), "Entrypoint exports must have distinct names.");
				names.add(binding.name);
				const declaration = declarations.get(binding.target);
				assert(declaration !== undefined, "Every export target must have a declaration fact.");
				let namespace: PreparedExport["namespace"];
				if (
					declaration.documentationContext !== undefined &&
					declaration.declarations.some((source) => source.kind === "ModuleDeclaration")
				) {
					// Stop only cycles on this path. Other export paths can still expand the same namespace.
					// Retain the target metadata so selection treats a recursive alias like its namespace.
					namespace = active.has(declaration.id)
						? {
								...prepareItem(declaration.id, ""),
								reference: declaration.id,
								exports: [],
							}
						: {
								...prepareItem(declaration.id, ""),
								exports: prepareEntries(
									declaration.exports,
									new Set([...active, declaration.id]),
								),
							};
				}
				let container: PreparedExport["container"];
				const statement =
					declaration.statement === undefined
						? undefined
						: { ...prepareItem(declaration.id, ""), ...declaration.statement };
				if (declaration.container !== undefined) {
					container = prepareContainer(
						declaration,
						declarations,
						facts.packageName,
						documentationById,
						prepareItem,
					);
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
					unsupported ??= `Package ${facts.packageName}, entrypoint ${surface.name}, export ${binding.name}: this declaration form is not supported by report generation.`;
				} else if (statement === undefined && namespace === undefined) {
					assert(
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
					signatures: (declaration.documentationContext === undefined ||
					declaration.declarations.some((source) => source.kind === "FunctionDeclaration")
						? declaration.signatures
						: []
					).map((signature) => {
						const prepared = signatures.get(signature.id);
						assert(
							prepared !== undefined,
							"Collected signatures must have prepared report data.",
						);
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
	return {
		packageName: facts.packageName,
		surfaces,
		classification: graph.classification,
		...(facts.packageDocumentation === undefined
			? {}
			: { packageDocumentation: facts.packageDocumentation.documentation }),
	};
}

/**
 * Prepares supported container members without duplicating their declared and effective views.
 * @param declaration - Owning declaration with detached container syntax.
 * @param declarations - Original declarations indexed by identity for inherited-member provenance.
 * @param packageName - Package being reported.
 * @param documentation - Completed documentation indexed by original input identity.
 * @param prepareItem - Joins syntax with the invocation's completed metadata.
 * @returns Prepared container data, or undefined when syntax or member ownership is unsupported.
 */
function prepareContainer(
	declaration: DeclarationFact,
	declarations: ReadonlyMap<ApiItemId, DeclarationFact>,
	packageName: string,
	documentation: ReadonlyMap<ApiItemId, CompletedAnalysis["documentation"][number]>,
	prepareItem: (id: ApiItemId, text: string) => PreparedSignature,
): PreparedContainer | undefined {
	const syntax = declaration.container;
	assert(syntax !== undefined, "Container preparation requires detached container syntax.");

	/**
	 * Retains the original declaring container without treating inherited documentation as member inheritance.
	 * @param id - Member or signature identity.
	 * @param text - Effective member syntax.
	 * @param context - Original declaration lookup context, when available.
	 * @returns Prepared member with provenance only when another container declares it.
	 */
	function prepareMember(
		id: ApiItemId,
		text: string,
		context: DocumentationReferenceContext | undefined,
	): PreparedSignature {
		const prepared = prepareItem(id, text);
		if (context?.container === undefined || context.container === declaration.id) {
			return prepared;
		}
		const source = declarations.get(context.container);
		assert(
			source !== undefined,
			"Inherited members must have a collected declaring container.",
		);
		return {
			...prepared,
			inheritedFrom: {
				name: source.name,
				...(context.origin.packageName === packageName
					? {}
					: { packageName: context.origin.packageName }),
			},
		};
	}

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

	// Printable headers do not establish comment ownership. Reject unsupported contexts before joining metadata.
	if (
		!syntax.supported ||
		!documentation.has(declaration.id) ||
		(declaration.memberView === "partial" &&
			syntax.kind !== "enum" &&
			(declaration.limitations.length === 0 ||
				declaration.limitations.some(
					(limitation) => limitation.code !== DiagnosticCode.MemberExpansionOutsideSuite,
				))) ||
		effectiveMembers.some(
			(member) => member.signatures.length === 0 && !documentation.has(member.id),
		)
	) {
		return undefined;
	}
	const augmentationMembers =
		syntax.interfaceSuffix === undefined
			? []
			: syntax.declaredMembers.filter(
					(member) => member.kind === "CallSignature" || member.kind === "ConstructSignature",
				);
	const members = [
		...syntax.declaredMembers
			.filter((member) => !augmentationMembers.includes(member))
			.map((member) => prepareItem(member.id, member.printed)),
		...effectiveMembers.flatMap((member) =>
			member.signatures.length > 0 && member.documentationContext === undefined
				? member.signatures.map((signature) =>
						prepareMember(
							signature.id,
							`${member.name}${member.optional ? "?" : ""}${signature.normalized.callSignatureText}`,
							signature.documentationContext,
						),
					)
				: [
						prepareMember(
							member.id,
							`${member.readonly === true ? "readonly " : ""}${member.name}${member.optional ? "?" : ""}: ${member.type};`,
							member.documentationContext,
						),
					],
		),
	];
	return {
		...prepareItem(declaration.id, ""),
		prefix: syntax.prefix,
		suffix: syntax.suffix,
		...(syntax.interfaceSuffix === undefined
			? {}
			: {
					augmentation: {
						suffix: syntax.interfaceSuffix,
						members: augmentationMembers.map((member) => {
							const { id: _id, ...prepared } = prepareItem(member.id, member.printed);
							return prepared;
						}),
					},
				}),
		members,
	};
}

/**
 * Constructs a selected report without repeating parsing or shared semantic validation.
 *
 * @param prepared - Shared inputs produced once by report preparation.
 * @param entrypoint - Configured entrypoint name to report.
 * @param selection - Caller-supplied filters applied to top-level bindings and standalone overloads. Selected containers retain all contents.
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
		return reportFailure(
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
	 * @param retainAll - Whether a selected containing namespace requires every nested binding.
	 * @returns Selected records with internal selection identities removed from their items.
	 */
	function selectEntries(
		entries: readonly PreparedExport[],
		retainAll: boolean,
	): ReviewExport[] {
		const exports: ReviewExport[] = [];
		for (const entry of entries) {
			if (entry.namespace !== undefined) {
				if (retainAll || selectedIds.has(entry.namespace.id)) {
					const { id: _id, exports: nested, ...namespace } = entry.namespace;
					exports.push({
						...entry,
						namespace: { ...namespace, exports: selectEntries(nested, true) },
						signatures: entry.signatures.map(
							({ id: _signatureId, ...signature }) => signature,
						),
					});
				}
				continue;
			}
			if (entry.statement !== undefined) {
				if (retainAll || selectedIds.has(entry.statement.id)) {
					const { id: _id, ...statement } = entry.statement;
					exports.push({ ...entry, statement, signatures: [] });
				}
				continue;
			}
			if (entry.container !== undefined) {
				if (retainAll || selectedIds.has(entry.container.id)) {
					const { id: _id, members, ...container } = entry.container;
					exports.push({
						...entry,
						signatures: [],
						container: {
							...container,

							// Container selection is atomic, including custom-tag and inherited-member differences.
							members: members.map(({ id: _memberId, ...member }) => member),
						},
					});
				}
				continue;
			}
			const signatures = entry.signatures
				.filter((signature) => retainAll || selectedIds.has(signature.id))
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
			...(prepared.packageDocumentation === undefined
				? {}
				: { packageDocumentation: prepared.packageDocumentation }),
			surface: selection.name,
			exports: selectEntries(surface.exports, false),
		},
	});
}

/**
 * Presentation settings that do not change classification, selection, or validation.
 * @public
 */
export interface ReviewPresentationOptions {
	/**
	 * Whether classified release tags appear on top-level declarations and standalone overloads.
	 *
	 * @remarks
	 * A false value hides these annotations without changing classification or selection.
	 * Container members omit release annotations, including nested namespace exports.
	 * Other member annotations remain controlled by their respective presentation settings.
	 * Release tags cannot be enabled through {@link ReviewPresentationOptions.additionalTags} when this option is false.
	 *
	 * @defaultValue `true`
	 */
	readonly includeReleaseTags?: boolean;

	/**
	 * Additional recognized tag names to display, including `@`, such as `@sealed`, `@legacy`, or `@deprecated`.
	 *
	 * @remarks
	 * Names are matched exactly against report metadata. Unknown or absent names display nothing.
	 * Does not register tags with TSDoc. Release tags are controlled by `includeReleaseTags`.
	 * A supplied list replaces the defaults; an empty list hides all additional tag annotations.
	 *
	 * @defaultValue `["@sealed", "@override", "@deprecated"]`
	 *
	 * @example Show deprecation annotations without release annotations
	 * These settings display `@deprecated` when present in an item's metadata and hide release tags.
	 * They do not change which APIs are selected or display the deprecation message itself.
	 *
	 * ```typescript
	 * const options = {
	 *     includeReleaseTags: false,
	 *     additionalTags: ["@deprecated"],
	 * };
	 * ```
	 */
	readonly additionalTags?: readonly string[];

	/**
	 * Whether items without descriptive documentation receive an `(undocumented)` annotation.
	 *
	 * @remarks
	 * A false value suppresses the notice without changing effective documentation status or validation.
	 *
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
function formatCodeSpan(text: string): string {
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
 * Uses an API Extractor-like heading, a single TypeScript block, and explicit alias exports.
 * Type-only export statements immediately follow their complete declaration group within each namespace scope.
 * Ordinary alias exports remain at the end of their scope.
 * Release annotations appear on top-level declarations and standalone overloads, not container members.
 * Inherited members receive separate source annotations, including the owning package for cross-package inheritance.
 * Source annotations are independent of tag and undocumented-notice settings.
 * Other member annotations follow the presentation settings. Uses LF line endings and exactly one final newline.
 * Includes the package-owned documentation comment before declarations when present, regardless of API selection.
 * Output is review text, not compilable declarations. No baseline is read or updated.
 *
 * @param report - Detached function report in canonical export and overload order.
 * @param options - Display settings. Omit to show top-level release tags, undocumented notices, and sealed, override, and deprecated annotations.
 * @returns The complete Markdown report.
 * @throws If a release level violates the report model's internal contract.
 */
export function renderReviewReport(
	report: ReviewReport,
	options: ReviewPresentationOptions = {},
): string {
	const declarations = renderDeclarationText(report.exports, options, new Map());
	const body =
		report.packageDocumentation === undefined
			? declarations
			: `${report.packageDocumentation.replaceAll(/\r\n?/g, "\n")}\n\n${declarations}`;
	const fence = "`".repeat(
		Math.max(3, ...(body.match(/`+/g) ?? []).map((run) => run.length + 1)),
	);
	return [
		`## API Report File for ${JSON.stringify(report.packageName)}`,
		"",
		"> Generated by api-analyzer. Do not edit directly.",
		"",
		`Surface: ${formatCodeSpan(JSON.stringify(report.surface))}`,
		"",
		`${fence}ts`,
		body,
		fence,
		"",
	].join("\n");
}

/**
 * Renders selected declarations within one lexical namespace without Markdown framing.
 * @remarks
 * Reuses names owned by the same declaration; generated suffixes distinguish different declarations.
 * Type-only exports remain explicit even when the local declaration keeps its original name.
 * Groups them after all overloads and merged declaration parts, with no intervening blank line.
 * @param exports - Selected exported bindings in canonical order.
 * @param options - Annotation presentation settings.
 * @param enclosing - Rendered names of enclosing namespace identities for recursive alias references.
 * @returns Declaration-oriented text, including required exported aliases.
 */
function renderDeclarationText(
	exports: readonly ReviewExport[],
	options: ReviewPresentationOptions,
	enclosing: ReadonlyMap<ApiItemId, string>,
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

	// Reserve all export names before rendering so an earlier group cannot claim a later group's name.
	const nameOwners = new Map(exports.map((binding) => [binding.name, binding.declarationId]));
	const declarations: string[] = [];
	const aliases: string[] = [];
	const releaseTags = new Set(Object.values(levels).map((level) => `@${level}`));
	const additionalTags = options.additionalTags ?? ["@sealed", "@override", "@deprecated"];

	/**
	 * Formats enabled metadata and documentation-status annotations for one report item.
	 * @param signature - Selected item with original tags and effective documentation status.
	 * @param includeReleaseTag - Whether this item is outside a containing declaration.
	 * @returns Comment lines, or an empty string when no annotations are enabled.
	 */
	function renderAnnotation(signature: ReviewSignature, includeReleaseTag: boolean): string {
		const tags: string[] = [];
		if (signature.releaseLevel !== undefined) {
			const level = levels[signature.releaseLevel];
			assert(level !== undefined, "Review signatures must have supported release levels.");
			if (includeReleaseTag && options.includeReleaseTags !== false) {
				tags.push(`@${level}`);
			}
		}
		tags.push(
			...signature.modifierTags.filter(
				(tag) => !releaseTags.has(tag) && additionalTags.includes(tag),
			),
		);
		if (options.includeUndocumentedNotice !== false && !signature.documented) {
			tags.push("(undocumented)");
		}
		const annotation = tags.length > 0 ? `// ${tags.join(" ")}\n` : "";
		const source = signature.inheritedFrom;
		return source === undefined
			? annotation
			: `${annotation}// Inherited from ${formatCodeSpan(source.name)}${source.packageName === undefined ? "" : ` in package ${formatCodeSpan(source.packageName)}`}\n`;
	}
	for (const group of groups.values()) {
		const binding = group[0];
		assert(binding !== undefined, "Report export groups must not be empty.");
		if (binding.namespace?.reference !== undefined) {
			// An enclosing declaration can have a generated local name; its source name is not sufficient.
			const referencedName = enclosing.get(binding.namespace.reference);
			assert(
				referencedName !== undefined,
				"Recursive namespace aliases must refer to an enclosing rendered namespace.",
			);

			// Keep cycles as aliases, not nested declarations. Selection already removed excluded targets.
			for (const exported of group) {
				aliases.push(`export import ${exported.name} = ${referencedName};`);
			}
			continue;
		}

		// Type-only bindings need explicit exports; exporting a class or enum declaration directly would expose its value.
		const direct = group.find(
			(item) =>
				!item.typeOnly && item.name === item.declarationName && item.name !== "default",
		);
		let localName = direct?.name ?? binding.declarationName;
		if (direct === undefined) {
			if (!localName || localName === "default") {
				localName = "apiFunction";
			} else if (!/^[$A-Z_a-z][\w$]*$/.test(localName)) {
				localName =
					/^[$A-Z_a-z][\w$]*$/.test(binding.name) && binding.name !== "default"
						? binding.name
						: "apiFunction";
			}
			const baseName = localName;
			let suffix = 1;

			// Sharing a name with this declaration's own export is safe; only a different owner forces a suffix.
			while (
				nameOwners.has(localName) &&
				nameOwners.get(localName) !== binding.declarationId
			) {
				localName = `${baseName}_${suffix++}`;
			}
		}

		// Generated local names must also remain unavailable to subsequent declaration groups.
		nameOwners.set(localName, binding.declarationId);
		const declarationParts: string[] = [];
		const typeAliases: string[] = [];
		const declarationPrefix =
			direct === undefined ? (enclosing.size === 0 ? "declare " : "") : "export ";
		let namespaceDeclaration: string | undefined;
		if (binding.namespace !== undefined) {
			// Extend names only for this nested scope so sibling namespaces cannot inherit each other's bindings.
			const nested = renderDeclarationText(
				binding.namespace.exports,
				options,
				new Map([...enclosing, [binding.declarationId, localName]]),
			)
				.split("\n")
				.map((line) => (line.length > 0 ? `    ${line}` : ""))
				.join("\n");
			namespaceDeclaration = `${renderAnnotation(binding.namespace, enclosing.size === 0)}${declarationPrefix}namespace ${localName} {\n${nested}\n}`;
		}
		if (binding.statement !== undefined) {
			const statement = binding.statement;
			declarationParts.push(
				`${renderAnnotation(statement, enclosing.size === 0)}${declarationPrefix}${statement.prefix}${localName}${statement.suffix}`,
			);
		}
		if (binding.container !== undefined) {
			const container = binding.container;

			// Member release metadata remains available for validation; the container's annotation is sufficient here.
			const memberText = container.members
				.map((member) =>
					`${renderAnnotation(member, false)}${member.text}`
						.split("\n")
						.map((line) => `    ${line}`)
						.join("\n"),
				)
				.join("\n");
			declarationParts.push(
				`${renderAnnotation(container, enclosing.size === 0)}${declarationPrefix}${container.prefix}${localName}${container.suffix} {${memberText ? `\n${memberText}\n` : ""}}`,
			);
			if (container.augmentation !== undefined) {
				const augmentationText = container.augmentation.members
					.map((member) =>
						`${renderAnnotation(member, false)}${member.text}`
							.split("\n")
							.map((line) => `    ${line}`)
							.join("\n"),
					)
					.join("\n");
				declarationParts.push(
					`${renderAnnotation(container, enclosing.size === 0)}${declarationPrefix}interface ${localName}${container.augmentation.suffix} {\n${augmentationText}\n}`,
				);
			}
		}
		for (const signature of binding.signatures) {
			const comment = renderAnnotation(signature, enclosing.size === 0);
			declarationParts.push(
				`${comment}${declarationPrefix}function ${localName}${signature.text.replaceAll(/\r\n?/g, "\n").trimEnd()}`,
			);
		}
		if (namespaceDeclaration !== undefined) {
			declarationParts.push(namespaceDeclaration);
		}
		for (const exported of group) {
			if (exported !== direct) {
				const exportName = /^[$A-Z_a-z][\w$]*$/.test(exported.name)
					? exported.name
					: JSON.stringify(exported.name);
				(exported.typeOnly ? typeAliases : aliases).push(
					`export ${exported.typeOnly ? "type " : ""}{ ${localName}${exported.name === localName ? "" : ` as ${exportName}`} };`,
				);
			}
		}
		declarations.push([declarationParts.join("\n\n"), ...typeAliases.sort()].join("\n"));
	}
	return [...declarations, ...aliases.sort()].join("\n\n") || "// No selected exports.";
}

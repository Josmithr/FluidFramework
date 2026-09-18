import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
	DocLinkTag,
	type DocNode,
	TSDocConfiguration,
	TSDocParser,
	TSDocTagDefinition,
	TSDocTagSyntaxKind,
} from "@microsoft/tsdoc";
import type { CompletedAnalysis } from "../analysis-types/completedGraph.js";
import type {
	DependencyApi,
	DependencyExport,
	DependencyModel,
} from "../analysis-types/dependencyModel.js";
import type {
	ApiItemId,
	DeclarationFact,
	Origin,
	SignatureDocumentationContext,
} from "../analysis-types/facts.js";
import { DiagnosticCode, reportFailure, type Result } from "../analysis-types/result.js";
import { freezeData } from "../utilities/freezeData.js";

const originSchema = z.strictObject({
	packageName: z.string().min(1),
	file: z.string(),
	start: z.number().int().nonnegative(),
});
const metadataSchema = z
	.strictObject({
		id: z.string(),
		releaseLevel: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).optional(),
		modifierTags: z.array(z.string()),
	})
	.transform((value) => ({ ...value, releaseLevel: value.releaseLevel }));
const linkSchema = z.strictObject({
	source: z.string(),
	linkIndex: z.number().int().nonnegative(),
	reference: z.string(),
	target: z.string(),
	targetSignature: z.string(),
	origin: originSchema,
});
const documentationSchema = z
	.strictObject({
		id: z.string(),
		packageName: z.string().min(1),
		documentation: z.string().optional(),
		documented: z.boolean(),
		originalBlockTags: z.array(z.string()),
		inheritedFrom: z.array(z.string()),
		links: z.array(linkSchema),
		sections: z.array(
			z.strictObject({
				section: z.string(),
				source: z.string(),
				packageName: z.string().min(1),
			}),
		),
	})
	.transform((value) => ({ ...value, documentation: value.documentation }));
const modelSchema = z.strictObject({
	format: z.literal("api-analyzer-documentation"),
	version: z.literal(1),
	identityVersion: z.literal(1),
	compilerVersion: z.literal("7.0.2"),
	packageName: z.string().min(1),
	modifierTags: z.array(z.string()),
	inputFiles: z
		.array(
			z.strictObject({
				file: z
					.string()
					.min(1)
					.refine(
						(file) =>
							!file.includes("\\") &&
							!file.includes(":") &&
							!file.includes("\0") &&
							file.split("/").every((part) => part !== "" && part !== "." && part !== ".."),
						"Expected a package-relative input path without traversal.",
					),
				sha256: z.string().regex(/^[\da-f]{64}$/),
			}),
		)
		.min(1),
	dependencyModels: z.array(
		z.strictObject({
			packageName: z.string().min(1),
			sha256: z.string().regex(/^[\da-f]{64}$/),
		}),
	),
	apis: z.array(
		z
			.strictObject({
				id: z.string(),
				declarationId: z.string(),
				name: z.string(),
				kind: z.string(),
				origin: originSchema,
				parameters: z
					.array(
						z
							.strictObject({
								name: z.string().optional(),
								optional: z.boolean(),
								rest: z.boolean(),
							})
							.transform(({ name, ...parameter }) => ({
								...parameter,
								...(name === undefined ? {} : { name }),
							})),
					)
					.optional(),
				typeParameters: z.array(z.string()).optional(),
				metadata: metadataSchema,
				documentation: documentationSchema,
			})
			.transform(({ parameters, typeParameters, ...api }) => ({
				...api,
				...(parameters === undefined ? {} : { parameters }),
				...(typeParameters === undefined ? {} : { typeParameters }),
			})),
	),
	exports: z.array(
		z
			.strictObject({
				entrypoint: z.string().min(1),
				path: z.array(z.string()).min(1),
				typeOnly: z.boolean(),
				items: z.array(z.string()).min(1),
				memberKind: z.enum(["static", "instance"]).optional(),
				referencePath: z.array(z.string()).min(1).optional(),
			})
			.transform(({ memberKind, referencePath, ...entry }) => ({
				...entry,
				...(memberKind === undefined ? {} : { memberKind }),
				...(referencePath === undefined ? {} : { referencePath }),
			})),
	),
	external: z.array(z.strictObject({ id: z.string(), packageName: z.string().min(1) })),
});

/**
 * Encodes dependency documentation from completed data without compiler or parser access.
 *
 * @param graph - Completed analysis with original metadata and resolved documentation.
 * @returns Deterministic versioned JSON with one final newline.
 */
export function encodeDependencyModel(graph: CompletedAnalysis): string {
	assert(
		graph.facts.inputFiles !== undefined,
		"Model generation requires analyzed input file fingerprints.",
	);
	const { apis, owners } = collectModelApis(graph);
	const exports = collectModelExports(graph);
	const external = collectExternalReferences(graph.facts.packageName, apis, exports, owners);
	const model: DependencyModel = {
		format: "api-analyzer-documentation",
		version: 1,
		identityVersion: 1,
		compilerVersion: graph.facts.compilerVersion,
		packageName: graph.facts.packageName,
		inputFiles: graph.facts.inputFiles,

		// The selected suite is a validated analysis input, even when no retained API references a package.
		// Record all selected content so consumers can detect stale transitive documentation and metadata.
		dependencyModels: (graph.dependencies ?? []).map((dependency) => ({
			packageName: dependency.packageName,
			sha256: fingerprintDependencyModel(dependency),
		})),
		modifierTags: graph.classification.modifierTags,
		apis,
		exports,
		external,
	};
	return `${JSON.stringify(model, undefined, 2)}\n`;
}

/**
 * Computes a content fingerprint for a validated dependency model.
 *
 * @remarks
 * Uses the 256-bit Secure Hash Algorithm (SHA-256).
 * Serialization whitespace and object property order do not affect the digest, but array order does.
 * The digest detects stale content; it does not authenticate the model.
 *
 * @param model - Decoded dependency model used as an analysis input.
 * @returns The model's content fingerprint as a lowercase hexadecimal string.
 */
export function fingerprintDependencyModel(model: DependencyModel): string {
	// Array order carries overload and provenance meaning; normalize object keys only.
	const canonical = JSON.stringify(model, (_key: string, value: unknown): unknown => {
		if (value !== null && typeof value === "object" && !Array.isArray(value)) {
			return Object.fromEntries(
				Object.entries(value).sort(([left], [right]) =>
					left < right ? -1 : left > right ? 1 : 0,
				),
			);
		}
		return value;
	});
	return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Local API records and package ownership retained for external-reference encoding.
 */
interface CollectedModelApis {
	/**
	 * Independently classified local APIs, sorted by identity.
	 */
	readonly apis: DependencyApi[];

	/**
	 * Package owners of both local and dependency identities encountered in the graph.
	 */
	readonly owners: ReadonlyMap<ApiItemId, string>;
}

/**
 * Collects classified local API records while retaining dependency ownership for references.
 * @param graph - Completed immutable analysis.
 * @returns Local API records and the ownership index used for external identities.
 */
function collectModelApis(graph: CompletedAnalysis): CollectedModelApis {
	const metadata = new Map(graph.classification.items.map((item) => [item.id, item]));
	const documentation = new Map(graph.documentation.map((item) => [item.id, item]));
	const apis: DependencyApi[] = [];
	const owners = new Map<ApiItemId, string>();
	for (const dependency of graph.dependencies ?? []) {
		for (const api of dependency.apis) {
			owners.set(api.id, dependency.packageName);
		}
	}

	/**
	 * Adds a classified API without copying foreign declarations into this package's model.
	 * @param id - Documentation input identity.
	 * @param declaration - Owning declaration whose package determines model ownership.
	 * @param name - Original declaration or member name.
	 * @param kind - Compiler syntax kind of the original input.
	 * @param origin - Original comment location, which can differ from the effective member owner.
	 * @param signature - Callable parameter facts. Omit for non-callable inputs, which carry no parameter arrays.
	 */
	function add(
		id: ApiItemId,
		declaration: DeclarationFact,
		name: string,
		kind: string,
		origin: Origin,
		signature?: SignatureDocumentationContext,
	): void {
		const owner = declaration.declarations[0]?.packageName;
		assert(
			owner !== undefined && owner.length > 0,
			"Model API declarations must retain their owning package.",
		);
		owners.set(id, owner);
		const original = metadata.get(id);
		const resolved = documentation.get(id);
		if (owner !== graph.facts.packageName || !original || !resolved) {
			return;
		}
		apis.push({
			id,
			declarationId: declaration.id,
			name,
			kind,
			origin,
			...(signature === undefined
				? {}
				: { parameters: signature.parameters, typeParameters: signature.typeParameters }),
			metadata: original,
			documentation: { ...resolved, sections: resolved.sections ?? [] },
		});
	}
	for (const declaration of graph.facts.declarations) {
		const source = declaration.declarations[0];
		if (!source) {
			continue;
		}
		owners.set(declaration.id, source.packageName);
		add(
			declaration.id,
			declaration,
			declaration.name,
			source.kind,
			declaration.documentationContext?.origin ?? source,
		);
		for (const signature of declaration.signatures) {
			add(
				signature.id,
				declaration,
				declaration.name,
				source.kind,
				signature.documentationContext?.origin ?? source,
				signature.documentationContext,
			);
		}
		for (const member of declaration.members) {
			const memberSource = member.declarations[0];
			if (!memberSource) {
				continue;
			}
			add(
				member.id,
				declaration,
				member.name,
				memberSource.kind,
				member.documentationContext?.origin ?? memberSource,
			);
			for (const signature of member.signatures) {
				add(
					signature.id,
					declaration,
					member.name,
					memberSource.kind,
					signature.documentationContext?.origin ?? memberSource,
					signature.documentationContext,
				);
			}
		}
		for (const member of declaration.container?.declaredMembers ?? []) {
			add(
				member.id,
				declaration,
				declaration.name,
				member.kind,
				member.documentationContext.origin,
			);
		}
	}
	apis.sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
	return { apis, owners };
}

/**
 * Collects exported documentation paths while preserving aliases and callable overload order.
 * @param graph - Completed immutable analysis.
 * @returns Export paths in surface and declaration traversal order.
 */
function collectModelExports(graph: CompletedAnalysis): DependencyExport[] {
	const metadata = new Map(graph.classification.items.map((item) => [item.id, item]));
	const declarations = new Map(graph.facts.declarations.map((item) => [item.id, item]));
	const exports: DependencyExport[] = [];

	/**
	 * Expands one exported path and its nested members without revisiting an active namespace.
	 * @param entrypoint - Configured entrypoint name.
	 * @param path - Exported names leading to this target.
	 * @param id - Target declaration identity.
	 * @param typeOnly - Whether any export step on this path is type-only.
	 * @param active - Namespace identities and exported paths on this traversal branch.
	 * @param memberKind - Terminal member side, or undefined for namespace and top-level exports.
	 */
	function collectExportTarget(
		entrypoint: string,
		path: readonly string[],
		id: ApiItemId,
		typeOnly: boolean,
		active: ReadonlyMap<ApiItemId, readonly string[]>,
		memberKind: DependencyExport["memberKind"],
	): void {
		const declaration = declarations.get(id);
		assert(
			declaration !== undefined,
			"Model export targets must have retained declaration facts.",
		);
		const items = metadata.has(id)
			? [id]
			: declaration.signatures
					.filter((signature) => metadata.has(signature.id))
					.map((signature) => signature.id);
		if (items.length > 0) {
			const referencePath = active.get(id);
			exports.push({
				entrypoint,
				path,
				items,
				typeOnly,
				...(memberKind === undefined ? {} : { memberKind }),
				...(referencePath === undefined ? {} : { referencePath }),
			});
		}
		if (active.has(id)) {
			return;
		}
		for (const member of declaration.members) {
			const memberItems = metadata.has(member.id)
				? [member.id]
				: member.signatures
						.filter((signature) => metadata.has(signature.id))
						.map((signature) => signature.id);
			if (memberItems.length > 0) {
				exports.push({
					entrypoint,
					path: [...path, member.name],
					items: memberItems,
					typeOnly,
					memberKind: "instance",
				});
			}
		}
		const visited = new Map([...active, [id, path] as const]);

		// Static overload records can share a declaration target. Export that target only once per path.
		for (const target of new Set(
			(declaration.container?.declaredMembers ?? []).flatMap((member) =>
				member.staticTarget === undefined ? [] : [member.staticTarget],
			),
		)) {
			const member = declarations.get(target);
			assert(member !== undefined, "Static export targets must retain declaration facts.");
			collectExportTarget(
				entrypoint,
				[...path, member.name],
				target,
				typeOnly,
				visited,
				"static",
			);
		}
		for (const binding of declaration.exports) {
			collectExportTarget(
				entrypoint,
				[...path, binding.name],
				binding.target,
				typeOnly || binding.typeOnly,
				visited,
				undefined,
			);
		}
	}
	for (const surface of graph.facts.surfaces) {
		for (const binding of surface.exports) {
			collectExportTarget(
				surface.name,
				[binding.name],
				binding.target,
				binding.typeOnly,
				new Map(),
				undefined,
			);
		}
	}
	return exports;
}

/**
 * Collects identities referenced by exports, inherited content, links, and section provenance.
 * @param apis - Local API records.
 * @param exports - Exported target paths.
 * @returns Referenced identities in validation order, including repeated occurrences.
 */
function collectReferencedApiIds(
	apis: readonly DependencyApi[],
	exports: readonly DependencyExport[],
): ApiItemId[] {
	return [
		...exports.flatMap((entry) => entry.items),
		...apis.flatMap((api) => [
			...api.documentation.inheritedFrom,
			...api.documentation.links.flatMap((link) => [link.source, link.targetSignature]),
			...(api.documentation.sections ?? []).map((section) => section.source),
		]),
	];
}

/**
 * Encodes dependency identities without duplicating their API records in the current model.
 * @param packageName - Owning package of the model being generated.
 * @param apis - Classified local API records.
 * @param exports - Export paths that can reference dependency APIs.
 * @param owners - Package ownership for all retained identities.
 * @returns Unique external references sorted by identity.
 * @throws If a referenced identity has no known external owner.
 */
function collectExternalReferences(
	packageName: string,
	apis: readonly DependencyApi[],
	exports: readonly DependencyExport[],
	owners: ReadonlyMap<ApiItemId, string>,
): DependencyModel["external"] {
	const known = new Set(apis.map((api) => api.id));
	const external = new Map<ApiItemId, string>();
	for (const id of collectReferencedApiIds(apis, exports)) {
		if (known.has(id)) {
			continue;
		}
		const owner = owners.get(id);
		assert(
			owner !== undefined && owner.length > 0 && owner !== packageName,
			"Model references must identify retained local or external APIs.",
		);
		external.set(id, owner);
	}
	return [...external]
		.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
		.map(([id, owner]) => ({ id, packageName: owner }));
}

/**
 * Decodes and validates a dependency artifact without semantic re-resolution or compiler access.
 *
 * @param text - Serialized dependency model.
 * @param packageName - Expected owning package identity.
 * @returns Frozen validated model data or actionable format and reference-integrity diagnostics.
 */
export function decodeDependencyModel(
	text: string,
	packageName: string,
): Result<DependencyModel> {
	let input: unknown;
	try {
		input = JSON.parse(text);
	} catch (error) {
		if (!(error instanceof SyntaxError)) {
			throw error;
		}
		return reportFailure(
			DiagnosticCode.DependencyModel,
			`Dependency ${packageName}: model is not valid JSON. Regenerate its model.`,
		);
	}
	const parsed = modelSchema.safeParse(input);
	if (!parsed.success) {
		return reportFailure(
			DiagnosticCode.DependencyModel,
			`Dependency ${packageName}: incompatible or incomplete model: ${parsed.error.message}`,
		);
	}
	const model: DependencyModel = parsed.data;

	// Shape validation cannot prove cross-record identity or resolved-comment consistency.
	const identities = validateModelIdentities(model, packageName);
	if (!identities.ok) {
		return identities;
	}
	const documentation = validateModelDocumentation(model);
	return documentation.ok ? freezeData({ ok: true, value: model }) : documentation;
}

/**
 * Checks package identity, unique keys, and references across schema-validated model records.
 * @param model - Structurally validated dependency model.
 * @param packageName - Expected package identity from suite discovery.
 * @returns Success or the first identity-integrity diagnostic.
 */
function validateModelIdentities(model: DependencyModel, packageName: string): Result {
	if (model.packageName !== packageName) {
		return reportFailure(
			DiagnosticCode.DependencyModel,
			`Dependency ${packageName}: model belongs to ${model.packageName}. Correct the artifact path.`,
		);
	}
	const ids = new Set<ApiItemId>();

	// Each input must identify one external package; duplicate entries cannot select different content.
	// Content matching is deferred to suite loading, where all selected models are available.
	const inputPackages = new Set<string>();
	for (const dependency of model.dependencyModels) {
		if (dependency.packageName === packageName || inputPackages.has(dependency.packageName)) {
			return reportFailure(
				DiagnosticCode.DependencyModel,
				`Dependency ${packageName}: duplicate or self-referencing model input ${dependency.packageName}. Regenerate its model.`,
			);
		}
		inputPackages.add(dependency.packageName);
	}
	if (
		new Set(model.inputFiles.map((fingerprint) => fingerprint.file)).size !==
		model.inputFiles.length
	) {
		return reportFailure(
			DiagnosticCode.DependencyModel,
			`Dependency ${packageName}: duplicate analyzed input files.`,
		);
	}
	for (const api of model.apis) {
		if (ids.has(api.id) || api.metadata.id !== api.id || api.documentation.id !== api.id) {
			return reportFailure(
				DiagnosticCode.DependencyModel,
				`Dependency ${packageName}: duplicate or inconsistent API identity ${api.id}. Regenerate its model.`,
			);
		}
		ids.add(api.id);
	}
	for (const external of model.external) {
		if (ids.has(external.id) || external.packageName === packageName) {
			return reportFailure(
				DiagnosticCode.DependencyModel,
				`Dependency ${packageName}: invalid external identity ${external.id}.`,
			);
		}
		ids.add(external.id);
	}
	const paths = new Set<string>();
	for (const entry of model.exports) {
		const key = JSON.stringify([entry.entrypoint, entry.path, entry.memberKind]);
		if (paths.has(key)) {
			return reportFailure(
				DiagnosticCode.DependencyModel,
				`Dependency ${packageName}: duplicate exported target path ${key}.`,
			);
		}
		paths.add(key);
		if (entry.referencePath !== undefined) {
			const prefix = entry.referencePath;
			const target = model.exports.find(
				(candidate) =>
					candidate.entrypoint === entry.entrypoint &&
					candidate.memberKind === undefined &&
					JSON.stringify(candidate.path) === JSON.stringify(prefix),
			);
			if (
				entry.memberKind !== undefined ||
				prefix.length >= entry.path.length ||
				prefix.some((name, index) => name !== entry.path[index]) ||
				target === undefined ||
				target.referencePath !== undefined ||
				JSON.stringify(target.items) !== JSON.stringify(entry.items)
			) {
				return reportFailure(
					DiagnosticCode.DependencyModel,
					`Dependency ${packageName}: invalid recursive namespace alias ${entry.path.join(".")}. Regenerate the model.`,
				);
			}
		}
	}
	const missing = collectReferencedApiIds(model.apis, model.exports).find(
		(id) => !ids.has(id),
	);
	if (missing !== undefined) {
		return reportFailure(
			DiagnosticCode.DependencyModel,
			`Dependency ${packageName}: dangling API reference ${missing}. Regenerate its model.`,
		);
	}
	return { ok: true };
}

/**
 * Validates stored resolved TSDoc and link correspondence without repeating semantic lookup.
 * @param model - Structurally validated model with consistent identity references.
 * @returns Success or the first vocabulary, comment, or link-structure diagnostic.
 */
function validateModelDocumentation(model: DependencyModel): Result {
	const { packageName } = model;
	const configuration = new TSDocConfiguration();
	for (const tagName of model.modifierTags) {
		if (!/^@[A-Za-z][\dA-Za-z]*$/.test(tagName)) {
			return reportFailure(
				DiagnosticCode.DependencyModel,
				`Dependency ${packageName}: invalid modifier vocabulary ${tagName}.`,
			);
		}
		if (configuration.tryGetTagDefinition(tagName) === undefined) {
			configuration.addTagDefinition(
				new TSDocTagDefinition({ tagName, syntaxKind: TSDocTagSyntaxKind.ModifierTag }),
			);
		}
	}
	const parser = new TSDocParser(configuration);
	const apis = new Map(model.apis.map((api) => [api.id, api]));
	for (const api of model.apis) {
		// Decoding checks stored structure only. Source lookup and inheritance remain analysis responsibilities.
		const comment = parser.parseString(api.documentation.documentation ?? "/** */");
		if (comment.log.messages.length > 0 || comment.docComment.inheritDocTag !== undefined) {
			return reportFailure(
				DiagnosticCode.DependencyModel,
				`Dependency ${packageName}, API ${api.id}: model documentation must be valid, fully resolved TSDoc.`,
			);
		}
		const linkReferences = collectCommentReferences(comment.docComment);
		if (
			linkReferences.length !== api.documentation.links.length ||
			linkReferences.some(
				(reference, index) => reference !== api.documentation.links[index]?.reference,
			)
		) {
			return reportFailure(
				DiagnosticCode.DependencyModel,
				`Dependency ${packageName}, API ${api.id}: stored link occurrences do not match resolved documentation.`,
			);
		}
		for (const link of api.documentation.links) {
			const target = apis.get(link.targetSignature);
			if (target !== undefined && target.declarationId !== link.target) {
				return reportFailure(
					DiagnosticCode.DependencyModel,
					`Dependency ${packageName}, API ${api.id}: link target declaration and API identities disagree.`,
				);
			}
		}
		if ((api.parameters === undefined) !== (api.typeParameters === undefined)) {
			return reportFailure(
				DiagnosticCode.DependencyModel,
				`Dependency ${packageName}, API ${api.id}: callable parameter facts are incomplete.`,
			);
		}
	}
	return { ok: true };
}

/**
 * Lists API reference occurrences without looking up their targets.
 * @param node - Parsed resolved comment or one of its descendants.
 * @returns Reference text in TSDoc tree order, excluding URL destinations.
 */
function collectCommentReferences(node: DocNode): string[] {
	const own =
		node instanceof DocLinkTag && node.codeDestination !== undefined
			? [node.codeDestination.emitAsTsdoc()]
			: [];
	return [...own, ...node.getChildNodes().flatMap(collectCommentReferences)];
}

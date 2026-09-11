/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	EmptyKey,
	LeafNodeStoredSchema,
	MapNodeStoredSchema,
	ObjectNodeStoredSchema,
	storedEmptyFieldSchema,
	type TreeFieldStoredSchema,
	type TreeNodeStoredSchema,
	type TreeStoredSchema,
	ValueSchema,
} from "../../core/index.js";
import {
	allowsFieldKindSuperset,
	defaultSchemaPolicy,
	FieldKinds,
	isNeverTree,
} from "../../feature-libraries/index.js";
import { brand, type JsonCompatibleReadOnly } from "../../util/index.js";
import { NodeKind, StagedSchemaUpgradePolicy } from "../core/index.js";
import type { SimpleFieldSchema } from "../simpleSchema.js";
import { toUpgradeSchema } from "../toStoredSchema.js";
import type { TreeSchema } from "../treeSchema.js";

import type { Discrepancy } from "./discrepancies.js";
import type { SchemaCompatibilityStatusBeta } from "./tree.js";

/**
 * Identifies a schema element using persisted identifiers and field keys.
 *
 * @remarks
 * The root field uses `"root"`. A node location omits `fieldKey`.
 * An implicit map or array field uses `fieldKey: null`.
 *
 * @alpha
 */
export type SchemaDiscrepancyLocationAlpha =
	| "root"
	| {
			/**
			 * Persisted identifier of the node schema containing the difference.
			 */
			readonly nodeType: string;
			/**
			 * Persisted field key, or null for an implicit map or array field.
			 * Omitted when the difference applies to the node rather than a field.
			 */
			// eslint-disable-next-line @rushstack/no-new-null -- JSON must distinguish implicit fields from node locations.
			readonly fieldKey?: string | null;
	  };

/**
 * Describes one difference between the stored schema, view schema, and effective upgrade target.
 *
 * @remarks
 * Each entry describes one aspect at one location. Missing side properties indicate absent values.
 * The target incorporates the configured staging policy. It need not match the view schema.
 * Persisted metadata is compared by value and does not affect compatibility flags.
 * Non-persisted custom metadata and descriptions are not compared.
 * Staging annotations are compared separately from custom metadata.
 * Entries support JSON serialization without a custom replacer.
 * Ordering is deterministic within a library version, but no particular sorting rule is guaranteed.
 * Array position does not indicate severity or priority.
 *
 * @sealed
 * @alpha
 */
export type SchemaDiscrepancyAlpha = {
	/**
	 * Identifies the schema element that differs.
	 */
	readonly location: SchemaDiscrepancyLocationAlpha;
} & (
	| ({
			/**
			 * Identifies allowed-type membership or a staging annotation for one allowed type.
			 * Side values indicate whether that type is allowed or marked as staged, respectively.
			 * Stored and target schemas do not retain staging annotations.
			 */
			readonly mismatch: "allowedType" | "stagedType";
			/**
			 * Persisted identifier of the allowed type being compared.
			 */
			readonly allowedType: string;
	  } & SchemaDiscrepancyValues<boolean>)
	| ({
			/**
			 * Identifies a field-kind or leaf-value constraint difference.
			 * Side values are field-kind identifiers or leaf-value schema names, respectively.
			 */
			readonly mismatch: "fieldKind" | "valueSchema";
	  } & SchemaDiscrepancyValues<string>)
	| ({
			/**
			 * Identifies an explicit field definition, optionality staging, or unknown-field policy difference.
			 * Side values indicate whether the field definition, annotation, or policy is present or enabled.
			 * Stored and target schemas do not retain staging annotations or the view's unknown-field policy.
			 */
			readonly mismatch: "fieldPresence" | "stagedOptional" | "allowUnknownOptionalFields";
	  } & SchemaDiscrepancyValues<boolean>)
	| ({
			/**
			 * Identifies a node-kind difference between existing definitions.
			 * Side values describe only the kinds, not the complete node definitions.
			 */
			readonly mismatch: "nodeKind";
	  } & SchemaDiscrepancyValues<SchemaNodeKindDescription>)
	| ({
			/**
			 * Identifies a node definition that is absent from at least one schema.
			 * Present side values describe only the node kinds.
			 */
			readonly mismatch: "missingNode";
			/**
			 * Identifies every side without this definition.
			 */
			readonly missingFrom: readonly ("view" | "stored" | "target")[];
	  } & SchemaDiscrepancyValues<SchemaNodeKindDescription>)
	| ({
			/**
			 * Identifies a persisted metadata difference at a node or field.
			 * Side values contain the metadata values, compared independently of object property order.
			 * This difference does not prevent viewing, upgrading, or equivalence.
			 */
			readonly mismatch: "persistedMetadata";
	  } & SchemaDiscrepancyValues<JsonCompatibleReadOnly>)
);

/**
 * Values for one schema aspect on each side of the comparison.
 *
 * @remarks
 * Missing properties identify absent values, not values equal to false or null.
 * For boolean aspects, false indicates that the compared feature is absent or disabled.
 *
 * @typeParam T - Value representation for the aspect selected by the discrepancy's `mismatch` property.
 *
 * @alpha
 */
export interface SchemaDiscrepancyValues<T> {
	/**
	 * Describes the value in the view schema. Absent when that value does not exist.
	 */
	readonly view?: T;
	/**
	 * Describes the value in the stored schema. Absent when that value does not exist.
	 */
	readonly stored?: T;
	/**
	 * Describes the value in the effective upgrade target. Absent when that value does not exist.
	 */
	readonly target?: T;
}

/**
 * Describes a node kind without expanding its definition or references.
 * @alpha
 */
export interface SchemaNodeKindDescription {
	/**
	 * The node kind represented by the stored schema structure.
	 * Arrays are represented by an object with one sequence field at the empty key.
	 */
	readonly kind: "leaf" | "map" | "array" | "object";
}

/**
 * Reports whether a schema can be viewed and the differences that prevent viewing.
 *
 * @remarks
 * `viewDiscrepancies` is absent when `canView` is true.
 * Narrow `canView` to false before accessing the nonempty blocker list.
 *
 * @sealed
 * @alpha
 */
export type ViewableStatus =
	| {
			/**
			 * The view schema permits access to the stored document.
			 */
			readonly canView: true;
	  }
	| {
			/**
			 * Schema differences prevent access through this view schema.
			 */
			readonly canView: false;
			/**
			 * Contains at least one viewing blocker selected from the complete list.
			 */
			readonly viewDiscrepancies: readonly SchemaDiscrepancyAlpha[];
	  };

/**
 * Reports whether a schema can be upgraded and the differences that prevent upgrading.
 *
 * @remarks
 * `upgradeDiscrepancies` is absent when `canUpgrade` is true.
 * Narrow `canUpgrade` to false before accessing the nonempty blocker list.
 * A true flag does not mean that an upgrade is necessary.
 *
 * @sealed
 * @alpha
 */
export type UpgradeableStatus =
	| {
			/**
			 * The stored schema can be upgraded to the effective target.
			 */
			readonly canUpgrade: true;
	  }
	| {
			/**
			 * Schema differences prevent upgrading to the effective target.
			 */
			readonly canUpgrade: false;
			/**
			 * Contains at least one upgrade blocker selected from the complete list.
			 */
			readonly upgradeDiscrepancies: readonly SchemaDiscrepancyAlpha[];
	  };

/**
 * Reports schema equivalence under the existing document compatibility rules.
 *
 * @remarks
 * Equivalence does not require structural identity or equal persisted metadata.
 * `equivalenceDiscrepancies` is absent when `isEquivalent` is true.
 * Narrow `isEquivalent` to false before accessing the nonempty blocker list.
 *
 * @sealed
 * @alpha
 */
export type EquivalenceStatus =
	| {
			/**
			 * The schemas are equivalent under the document compatibility rules.
			 */
			readonly isEquivalent: true;
	  }
	| {
			/**
			 * At least one document compatibility check prevents equivalence.
			 */
			readonly isEquivalent: false;
			/**
			 * Contains at least one equivalence blocker selected from the complete list.
			 */
			readonly equivalenceDiscrepancies: readonly SchemaDiscrepancyAlpha[];
	  };

/**
 * Reports all detected schema differences within the comparison scope.
 * @sealed
 * @alpha
 */
export interface CompleteSchemaDiscrepanciesAlpha {
	/**
	 * Contains every distinct discrepancy, including staging and persisted metadata differences.
	 *
	 * @remarks
	 * This array is always available and can be nonempty when all compatibility flags are true.
	 * Non-persisted custom metadata and descriptions are excluded. Their absence from stored schema
	 * is not a discrepancy. For example, changing a schema description is ignored, while changing
	 * `persistedMetadata` produces a discrepancy without changing compatibility flags.
	 * The condition-specific lists select unchanged entries from this array.
	 * A discrepancy can belong to more than one condition-specific list.
	 *
	 * @example Serializing discrepancies
	 * ```typescript
	 * console.log(JSON.stringify(view.compatibility.allDiscrepancies));
	 * ```
	 */
	readonly allDiscrepancies: readonly SchemaDiscrepancyAlpha[];
}

/**
 * Reports schema compatibility with complete differences and conditional blocker subsets.
 *
 * @remarks
 * Extends {@link SchemaCompatibilityStatusBeta} without changing its flags or beta discrepancy details.
 * The complete list also includes differences that do not affect compatibility.
 *
 * @sealed
 * @alpha
 */
export type SchemaCompatibilityStatusAlpha = SchemaCompatibilityStatusBeta &
	CompleteSchemaDiscrepanciesAlpha &
	ViewableStatus &
	UpgradeableStatus &
	EquivalenceStatus;

/**
 * Reports schema comparison results without document initialization state.
 *
 * @remarks
 * Provides the same diagnostic lists and conditional access as {@link SchemaCompatibilityStatusAlpha}.
 * Used by {@link checkCompatibility} and {@link comparePersistedSchema}, which do not inspect document content.
 *
 * @sealed
 * @alpha
 */
export type SchemaComparisonStatusAlpha = Omit<
	SchemaCompatibilityStatusBeta,
	"canInitialize"
> &
	CompleteSchemaDiscrepanciesAlpha &
	ViewableStatus &
	UpgradeableStatus &
	EquivalenceStatus;

type SchemaSide = "view" | "stored" | "target";
type Values = Record<SchemaSide, JsonCompatibleReadOnly | undefined>;
type Fields = Record<SchemaSide, TreeFieldStoredSchema | undefined>;
type Nodes = Record<SchemaSide, TreeNodeStoredSchema | undefined>;
/**
 * Internal checks that select blocker subsets without adding check labels to public entries.
 * `upgrade` compares stored to target; `reverse` compares target to stored for equivalence.
 */
type Blocker = "view" | "upgrade" | "reverse";

/**
 * Copies a JSON-compatible value with object keys in deterministic order.
 *
 * @remarks
 * Array order is preserved. Undefined object properties are omitted, and undefined array entries become null.
 * Callers must pass only comparison data or persisted metadata, never non-persisted metadata.
 *
 * @param value - Value to normalize. Object and array values must be acyclic.
 * @returns A normalized copy, or the original value when it is a primitive or undefined.
 */
function canonical(
	value: JsonCompatibleReadOnly | undefined,
): JsonCompatibleReadOnly | undefined {
	if (value === undefined || value === null || typeof value !== "object") {
		return value;
	}
	if (Array.isArray(value)) {
		return value.map((item) => canonical(item) ?? null);
	}
	return Object.fromEntries(
		Object.keys(value)
			.sort()
			.flatMap((key) => {
				const item = canonical(
					(value as { readonly [key: string]: JsonCompatibleReadOnly })[key],
				);
				return item === undefined ? [] : [[key, item]];
			}),
	);
}

/**
 * Classifies the stored representation without expanding referenced node definitions.
 *
 * @param node - Node definition to classify, or undefined for a missing definition.
 * @returns The diagnostic node kind, or undefined if the definition is absent or unrecognized.
 */
function nodeKind(
	node: TreeNodeStoredSchema | undefined,
): SchemaNodeKindDescription["kind"] | undefined {
	if (node instanceof LeafNodeStoredSchema) {
		return "leaf";
	}
	if (node instanceof MapNodeStoredSchema) {
		return "map";
	}
	if (node instanceof ObjectNodeStoredSchema) {
		// Stored arrays use an object containing a single sequence field at the empty key.
		return node.objectNodeFields.size === 1 &&
			node.objectNodeFields.get(EmptyKey)?.kind === FieldKinds.sequence.identifier
			? "array"
			: "object";
	}
	return undefined;
}

/**
 * Gets fields by their stored keys, with null representing a map's implicit field.
 *
 * @remarks
 * Object keys are preserved, including the empty key used by stored arrays.
 * The caller converts array field keys to diagnostic locations separately.
 *
 * @param node - Node definition whose fields are needed.
 * @returns The node's fields, or an empty map for leaves and missing definitions.
 */
function fieldsOf(
	node: TreeNodeStoredSchema | undefined,
	// eslint-disable-next-line @rushstack/no-new-null -- Matches the serializable location representation.
): ReadonlyMap<string | null, TreeFieldStoredSchema> {
	if (node instanceof MapNodeStoredSchema) {
		return new Map([[null, node.mapFields]]);
	}
	if (node instanceof ObjectNodeStoredSchema) {
		return node.objectNodeFields;
	}
	return new Map();
}

/**
 * Collects schema differences and selects the entries that block each compatibility check.
 *
 * @remarks
 * Viewing blockers come from the existing compatibility check to preserve its staging and policy rules.
 * Upgrade and reverse-comparison blockers use the stored schema rules.
 * The collector does not calculate the public compatibility flags.
 *
 * Schema differences include persisted metadata and explicit staging annotations.
 * Non-persisted custom metadata and descriptions are not read.
 * Entries are deduplicated before the result lists are selected.
 * All lists use the same deterministic order and share entry objects.
 *
 * @param view - View schema, including staging annotations and persisted metadata.
 * @param stored - Current stored schema, including definitions unreachable from its root.
 * @param target - Effective upgrade target after applying the configured staging policy.
 * @param viewFailures - Raw viewing discrepancies for these inputs from the existing compatibility check.
 * @returns The complete list and its viewing, upgrade, and equivalence blocker subsets.
 * Successful checks have empty subsets here; the caller omits those properties from the public status.
 */
export function collectSchemaDiagnostics(
	view: TreeSchema,
	stored: TreeStoredSchema,
	target: TreeStoredSchema,
	viewFailures: readonly Discrepancy[],
): {
	all: readonly SchemaDiscrepancyAlpha[];
	view: readonly SchemaDiscrepancyAlpha[];
	upgrade: readonly SchemaDiscrepancyAlpha[];
	equivalence: readonly SchemaDiscrepancyAlpha[];
} {
	// Include all staged content when representing the view; target retains the effective staging policy.
	const viewed = toUpgradeSchema(view.root, StagedSchemaUpgradePolicy.permissive);
	const entries = new Map<string, SchemaDiscrepancyAlpha>();
	const blockers = new Map<SchemaDiscrepancyAlpha, Set<Blocker>>();
	// Index viewing failures once so each field does not scan every failure.
	const failureIndex = new Map<string, Discrepancy[]>();
	for (const failure of viewFailures) {
		const key = JSON.stringify([
			failure.identifier,
			"fieldKey" in failure ? failure.fieldKey : undefined,
		]);
		const group = failureIndex.get(key);
		if (group === undefined) {
			failureIndex.set(key, [failure]);
		} else {
			group.push(failure);
		}
	}

	/**
	 * Records one distinct aspect difference without classifying it as a blocker.
	 *
	 * @param mismatch - Aspect being compared. The caller must supply the matching value representation.
	 * @param location - Schema element containing the difference.
	 * @param values - Values on each side, with undefined for absent values.
	 * @param allowedType - Type identifier, supplied only for allowed-type and staged-type differences.
	 * @returns The shared entry for the difference, or undefined when all three values are equal.
	 */
	function add(
		mismatch: SchemaDiscrepancyAlpha["mismatch"],
		location: SchemaDiscrepancyLocationAlpha,
		values: Values,
		allowedType?: string,
	): SchemaDiscrepancyAlpha | undefined {
		// Skip equal primitives and shared references before copying or serializing values.
		if (values.view === values.stored && values.target === values.stored) {
			return undefined;
		}
		// Compare metadata by value, independent of object property insertion order.
		const normalized = {
			view: canonical(values.view),
			stored: canonical(values.stored),
			target: canonical(values.target),
		};
		if (
			JSON.stringify(normalized.view) === JSON.stringify(normalized.stored) &&
			JSON.stringify(normalized.target) === JSON.stringify(normalized.stored)
		) {
			return undefined;
		}
		const data = {
			mismatch,
			location,
			...(mismatch === "missingNode"
				? {
						missingFrom: (["view", "stored", "target"] as const).filter(
							(side) => values[side] === undefined,
						),
					}
				: {}),
			...(allowedType === undefined ? {} : { allowedType }),
			...(normalized.view === undefined ? {} : { view: normalized.view }),
			...(normalized.stored === undefined ? {} : { stored: normalized.stored }),
			...(normalized.target === undefined ? {} : { target: normalized.target }),
		};
		const entry = data as SchemaDiscrepancyAlpha;
		const key = JSON.stringify(entry);
		// Reuse the same entry when multiple comparisons identify the same difference.
		const previous = entries.get(key);
		if (previous !== undefined) {
			return previous;
		}
		entries.set(key, entry);
		blockers.set(entry, new Set());
		return entry;
	}

	/**
	 * Associates an existing difference with a failed check without changing its public payload.
	 *
	 * @param entry - Entry returned by `add`, or undefined when no difference was recorded.
	 * @param check - Check blocked by the difference.
	 */
	function mark(entry: SchemaDiscrepancyAlpha | undefined, check: Blocker): void {
		if (entry !== undefined) {
			blockers.get(entry)?.add(check);
		}
	}

	/**
	 * Finds viewing failures using the location conventions of the existing discrepancy checker.
	 *
	 * @param location - Diagnostic location to translate to a viewing-failure index key.
	 * @returns The failures at that location, or an empty array if none exist.
	 */
	function viewingFailures(location: SchemaDiscrepancyLocationAlpha): readonly Discrepancy[] {
		// Beta failures use EmptyKey for array fields and undefined for map fields or node locations.
		const key = JSON.stringify(
			location === "root"
				? [undefined, undefined]
				: [
						location.nodeType,
						location.fieldKey === null &&
						(view.definitions.get(location.nodeType)?.kind === NodeKind.Array ||
							nodeKind(stored.nodeSchema.get(brand(location.nodeType))) === "array")
							? EmptyKey
							: (location.fieldKey ?? undefined),
					],
		);
		return failureIndex.get(key) ?? [];
	}

	/**
	 * Records field differences and classifies blockers for the applicable comparison directions.
	 *
	 * @param location - Location shared by the fields being compared.
	 * @param fields - Explicit field definitions on each side, before substituting absent fields.
	 * @param upgrade - Whether to classify stored-to-target blockers at this field.
	 * @param reverse - Whether to classify target-to-stored blockers at this field for equivalence.
	 */
	function compareFields(
		location: SchemaDiscrepancyLocationAlpha,
		fields: Fields,
		upgrade: boolean,
		reverse: boolean,
	): void {
		const failures = viewingFailures(location);
		const viewKindFailure = failures.some((failure) => failure.mismatch === "fieldKind");
		// Preserve absent-versus-explicit differences even when both fields forbid all content.
		add("fieldPresence", location, {
			view: fields.view !== undefined,
			stored: fields.stored !== undefined,
			target: fields.target !== undefined,
		});
		// Compatibility treats an absent field as a forbidden field with no allowed types.
		const actual = {
			view: fields.view ?? storedEmptyFieldSchema,
			stored: fields.stored ?? storedEmptyFieldSchema,
			target: fields.target ?? storedEmptyFieldSchema,
		};
		const kind = add("fieldKind", location, {
			view: actual.view.kind,
			stored: actual.stored.kind,
			target: actual.target.kind,
		});
		if (viewKindFailure) {
			mark(kind, "view");
		}
		for (const [check, original, superset, active] of [
			["upgrade", actual.stored, actual.target, upgrade],
			["reverse", actual.target, actual.stored, reverse],
		] as const) {
			if (
				active &&
				!allowsFieldKindSuperset(defaultSchemaPolicy, original.kind, superset.kind)
			) {
				mark(kind, check);
			}
		}
		for (const type of new Set([
			...actual.view.types,
			...actual.stored.types,
			...actual.target.types,
		])) {
			const entry = add(
				"allowedType",
				location,
				{
					view: actual.view.types.has(type),
					stored: actual.stored.types.has(type),
					target: actual.target.types.has(type),
				},
				type,
			);
			if (
				failures.some(
					(failure) =>
						failure.mismatch === "allowedTypes" &&
						(failure.view.some(({ type: schema }) => schema.identifier === type) ||
							failure.stored.includes(type)),
				)
			) {
				mark(entry, "view");
			}
			if (upgrade && actual.stored.types.has(type) && !actual.target.types.has(type)) {
				mark(entry, "upgrade");
			}
			if (reverse && actual.target.types.has(type) && !actual.stored.types.has(type)) {
				mark(entry, "reverse");
			}
		}
		add("persistedMetadata", location, {
			view: fields.view?.persistedMetadata,
			stored: fields.stored?.persistedMetadata,
			target: fields.target?.persistedMetadata,
		});
	}

	/**
	 * Records view-only staging annotations independently of their effect on the upgrade target.
	 *
	 * @param location - Location of the annotated field.
	 * @param field - View field whose allowed types and optionality may be staged.
	 */
	function staging(location: SchemaDiscrepancyLocationAlpha, field: SimpleFieldSchema): void {
		for (const [type, attributes] of field.simpleAllowedTypes) {
			if (attributes.isStaged !== undefined && attributes.isStaged !== false) {
				add("stagedType", location, { view: true, stored: false, target: false }, type);
			}
		}
		if (field.isStagedOptional !== undefined && field.isStagedOptional !== false) {
			add("stagedOptional", location, { view: true, stored: false, target: false });
		}
	}

	compareFields(
		"root",
		{
			view: viewed.rootFieldSchema,
			stored: stored.rootFieldSchema,
			target: target.rootFieldSchema,
		},
		true,
		true,
	);
	staging("root", view.root);
	// Compare every definition, including stored definitions unreachable from the root.
	for (const identifier of new Set([
		...viewed.nodeSchema.keys(),
		...stored.nodeSchema.keys(),
		...target.nodeSchema.keys(),
	])) {
		const location = { nodeType: identifier };
		const nodes: Nodes = {
			view: viewed.nodeSchema.get(identifier),
			stored: stored.nodeSchema.get(identifier),
			target: target.nodeSchema.get(identifier),
		};
		const kinds = {
			view: nodeKind(nodes.view),
			stored: nodeKind(nodes.stored),
			target: nodeKind(nodes.target),
		};
		const missing = Object.values(nodes).includes(undefined);
		const kind = add(missing ? "missingNode" : "nodeKind", location, {
			view: kinds.view === undefined ? undefined : { kind: kinds.view },
			stored: kinds.stored === undefined ? undefined : { kind: kinds.stored },
			target: kinds.target === undefined ? undefined : { kind: kinds.target },
		});
		const failures = viewingFailures(location);
		if (failures.some((failure) => failure.mismatch === "nodeKind")) {
			mark(kind, "view");
		}
		// Classify descendant blockers only when the node-kind comparison permits that direction.
		const active = { upgrade: false, reverse: false };
		for (const [check, original, superset, data] of [
			["upgrade", nodes.stored, nodes.target, stored],
			["reverse", nodes.target, nodes.stored, target],
		] as const) {
			// Missing or unconstructible original nodes impose no content constraints on a superset.
			if (original === undefined || isNeverTree(defaultSchemaPolicy, data, original)) {
				continue;
			}
			if (
				superset === undefined ||
				original instanceof LeafNodeStoredSchema !==
					superset instanceof LeafNodeStoredSchema ||
				(original instanceof MapNodeStoredSchema && superset instanceof ObjectNodeStoredSchema)
			) {
				mark(kind, check);
				continue;
			}
			active[check] = true;
		}
		// Avoid expanding a missing definition or a leaf/non-leaf mismatch into value details.
		const value =
			kinds.view === "leaf" && kinds.stored === "leaf"
				? add("valueSchema", location, {
						view:
							nodes.view instanceof LeafNodeStoredSchema
								? ValueSchema[nodes.view.leafValue]
								: undefined,
						stored:
							nodes.stored instanceof LeafNodeStoredSchema
								? ValueSchema[nodes.stored.leafValue]
								: undefined,
						target:
							nodes.target instanceof LeafNodeStoredSchema
								? ValueSchema[nodes.target.leafValue]
								: undefined,
					})
				: undefined;
		if (failures.some((failure) => failure.mismatch === "valueSchema")) {
			mark(value, "view");
		}
		if (
			nodes.stored instanceof LeafNodeStoredSchema &&
			nodes.target instanceof LeafNodeStoredSchema &&
			nodes.stored.leafValue !== nodes.target.leafValue
		) {
			if (active.upgrade) mark(value, "upgrade");
			if (active.reverse) mark(value, "reverse");
		}
		add("persistedMetadata", location, {
			view: nodes.view?.metadata,
			stored: nodes.stored?.metadata,
			target: nodes.target?.metadata,
		});
		const fields = {
			view: fieldsOf(nodes.view),
			stored: fieldsOf(nodes.stored),
			target: fieldsOf(nodes.target),
		};
		if (
			nodes.view !== undefined &&
			nodes.stored !== undefined &&
			kinds.view !== "leaf" &&
			kinds.stored !== "leaf"
		) {
			for (const fieldKey of new Set([
				...fields.view.keys(),
				...fields.stored.keys(),
				...fields.target.keys(),
			])) {
				// Compare object fields against the map's implicit field, not an extra synthetic field.
				if (
					fieldKey === null &&
					(nodes.view instanceof ObjectNodeStoredSchema ||
						nodes.stored instanceof ObjectNodeStoredSchema)
				) {
					continue;
				}
				compareFields(
					{
						nodeType: identifier,
						fieldKey:
							fieldKey === EmptyKey && (kinds.view === "array" || kinds.stored === "array")
								? null
								: fieldKey,
					},
					{
						view:
							fields.view.get(fieldKey) ??
							(nodes.view instanceof MapNodeStoredSchema ? fields.view.get(null) : undefined),
						stored:
							fields.stored.get(fieldKey) ??
							(nodes.stored instanceof MapNodeStoredSchema
								? fields.stored.get(null)
								: undefined),
						target:
							fields.target.get(fieldKey) ??
							(nodes.target instanceof MapNodeStoredSchema
								? fields.target.get(null)
								: undefined),
					},
					active.upgrade,
					active.reverse,
				);
			}
		}
		// Stored representations omit staging and unknown-field policies; read these from the view.
		const viewNode = view.definitions.get(identifier);
		if (viewNode?.kind === NodeKind.Object) {
			for (const field of viewNode.fields.values()) {
				staging({ nodeType: identifier, fieldKey: field.storedKey }, field);
			}
			if (viewNode.allowUnknownOptionalFields === true) {
				add("allowUnknownOptionalFields", location, {
					view: true,
					stored: false,
					target: false,
				});
			}
		} else if (viewNode !== undefined && viewNode.kind !== NodeKind.Leaf) {
			for (const [type, attributes] of viewNode.simpleAllowedTypes) {
				if (attributes.isStaged !== undefined && attributes.isStaged !== false) {
					add(
						"stagedType",
						{ nodeType: identifier, fieldKey: null },
						{ view: true, stored: false, target: false },
						type,
					);
				}
			}
		}
	}
	// Sort once so every subset preserves the complete list's order and entry identities.
	const all = [...entries.entries()]
		.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
		.map(([, entry]) => entry);
	return {
		all,
		view: all.filter((entry) => blockers.get(entry)?.has("view") === true),
		upgrade: all.filter((entry) => blockers.get(entry)?.has("upgrade") === true),
		// Equivalence requires viewing compatibility and superset checks in both directions.
		equivalence: all.filter((entry) => (blockers.get(entry)?.size ?? 0) > 0),
	};
}

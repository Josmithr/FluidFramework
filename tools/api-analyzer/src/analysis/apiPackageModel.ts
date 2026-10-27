import assert from "node:assert/strict";
import { freezeData } from "../utilities/freezeData.js";
import {
	ApiItemKind,
	type ApiDeclaration,
	type ApiDeclarationGroup,
	type ApiIdentifier,
	type ApiItem,
	type ApiPackageModel,
	type ApiProperty,
	type ApiPropertySignature,
} from "../analysis-types/apiItems.js";

/**
 * Creates a package inspection snapshot from completed, detached item records.
 *
 * @remarks
 * Inputs must contain completed documentation and original declaration metadata.
 * Inputs must be acyclic data records and arrays, not parser objects or mutable collections.
 * The snapshot owns its records; later input mutations must not change lookup results.
 * Validation checks structural relationships, not compiler symbol equivalence or documentation resolution.
 * This internal factory does not project compiler facts or define a serialized artifact.
 *
 * @param packageId - Identity of the inspected package.
 * @param items - Original items from the package and selected dependencies.
 * @param declarationGroups - Resolved-symbol groups with declarations in compiler order.
 * @returns An immutable snapshot with stable lookup records and deterministic enumeration.
 * @throws If identities or relationships violate the inspection model contract.
 */
export function createApiPackageModel(
	packageId: ApiIdentifier<ApiItemKind.Package>,
	items: readonly ApiItem[],
	declarationGroups: readonly ApiDeclarationGroup[],
): ApiPackageModel {
	const snapshot = structuredClone({ items, declarationGroups });
	const orderedItems = [...snapshot.items].sort((left, right) =>
		left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
	);
	const itemLookup = new Map(orderedItems.map((item) => [item.id, item]));
	const groupLookup = new Map(snapshot.declarationGroups.map((group) => [group.id, group]));
	assert(itemLookup.size === items.length, "Duplicate item identity in inspection snapshot.");
	assert(
		groupLookup.size === declarationGroups.length,
		"Duplicate declaration-group identity in inspection snapshot.",
	);
	assert(
		itemLookup.get(packageId)?.kind === ApiItemKind.Package,
		"The inspected package must exist and have the package kind.",
	);
	validateDeclarationGroups(itemLookup, groupLookup);
	validateOwnership(itemLookup);
	validateExposure(itemLookup, groupLookup);
	validateOwnershipCycles(itemLookup);
	freezeData(snapshot);
	return Object.freeze({
		package: packageId,
		getItem: (id: ApiIdentifier) => itemLookup.get(id),
		getDeclarationGroup: (id: ApiDeclarationGroup["id"]) => groupLookup.get(id),
		*getAllItems() {
			yield* itemLookup.values();
		},
	});
}

/**
 * Checks reciprocal group membership without reordering declarations or inferring symbols from names.
 * @param items - Indexed original items.
 * @param groups - Indexed groups supplied by the producer.
 */
function validateDeclarationGroups(
	items: ReadonlyMap<ApiIdentifier, ApiItem>,
	groups: ReadonlyMap<ApiDeclarationGroup["id"], ApiDeclarationGroup>,
): void {
	for (const group of groups.values()) {
		assert(
			group.id.length > 0 && group.declarations.length > 0,
			"Declaration groups must have an identity and declarations.",
		);
		assert(
			new Set(group.declarations).size === group.declarations.length,
			"Duplicate declaration-group member.",
		);
		for (const id of group.declarations) {
			const declaration = items.get(id);
			assert(
				declaration !== undefined && "parent" in declaration,
				"A group member must be a declaration in the snapshot.",
			);
			assert(
				declaration.declarationGroup === group.id,
				"Declaration-group membership must be reciprocal.",
			);
		}
	}
	for (const item of items.values()) {
		if ("parent" in item && item.declarationGroup !== undefined) {
			assert(
				groups.get(item.declarationGroup)?.declarations.includes(item.id) === true,
				"An item's declaration group must contain the item.",
			);
		}
	}
}

/**
 * Validates lexical ownership, package identity, and original source ownership.
 * @param items - Indexed original items with unique identities.
 */
function validateOwnership(items: ReadonlyMap<ApiIdentifier, ApiItem>): void {
	const packageNames = new Set<string>();
	const kinds = new Set(Object.values(ApiItemKind));
	for (const item of items.values()) {
		assert(
			item.id.length > 0 && kinds.has(item.kind),
			"Items must have an identity and a known kind.",
		);
		if (item.kind === ApiItemKind.Package) {
			assert(
				!packageNames.has(item.packageName),
				"Duplicate package name in inspection snapshot.",
			);
			packageNames.add(item.packageName);
		}
		if ("children" in item) {
			assert(
				new Set<ApiIdentifier>(item.children).size === item.children.length,
				"Duplicate child identity.",
			);
			for (const id of item.children) {
				const child = items.get(id);
				assert(
					child !== undefined && "parent" in child && child.parent === item.id,
					"Each child must exist and retain its original parent.",
				);
			}
		}
		if ("parent" in item) {
			const parent = items.get(item.parent);
			assert(parent !== undefined, "The original parent must exist.");
			assert(isAllowedParent(item, parent.kind), "Invalid declaring parent kind.");
			assert("children" in parent, "The original parent must own children.");
			const children: readonly ApiIdentifier[] = parent.children;
			assert(
				children.includes(item.id),
				"The original parent's children must include the item.",
			);
			assert(
				parent.packageName === item.packageName,
				"Original parent and child must belong to the same package.",
			);
		}
		if ("origin" in item) {
			assert(
				item.origin.packageName === item.packageName,
				"Source origin must match the item's package.",
			);
		}
		if (item.kind === ApiItemKind.Property || item.kind === ApiItemKind.PropertySignature) {
			validateProperty(item);
		}
	}
}

/**
 * Checks the declaring-parent kinds allowed by each declaration interface.
 * @param item - Original declaration whose owner is being checked.
 * @param parentKind - Kind resolved from the parent identity.
 * @returns Whether the parent kind is allowed for this declaration.
 */
function isAllowedParent(item: ApiDeclaration, parentKind: ApiItemKind): boolean {
	switch (item.kind) {
		case ApiItemKind.Class:
		case ApiItemKind.Enum:
		case ApiItemKind.Function:
		case ApiItemKind.Interface:
		case ApiItemKind.Namespace:
		case ApiItemKind.TypeAlias:
		case ApiItemKind.Variable: {
			return parentKind === ApiItemKind.Package || parentKind === ApiItemKind.Namespace;
		}
		case ApiItemKind.Constructor:
		case ApiItemKind.Method:
		case ApiItemKind.Property: {
			return parentKind === ApiItemKind.Class;
		}
		case ApiItemKind.CallSignature:
		case ApiItemKind.ConstructSignature:
		case ApiItemKind.MethodSignature:
		case ApiItemKind.PropertySignature: {
			return parentKind === ApiItemKind.Interface;
		}
		case ApiItemKind.EnumMember: {
			return parentKind === ApiItemKind.Enum;
		}
		case ApiItemKind.IndexSignature: {
			return parentKind === ApiItemKind.Class || parentKind === ApiItemKind.Interface;
		}
		default: {
			assert.fail("Unknown declaration kind.");
		}
	}
}

/**
 * Checks property forms and keeps each accessor's original metadata independent.
 * @param item - Class property or interface property signature.
 */
function validateProperty(item: ApiProperty | ApiPropertySignature): void {
	if (item.kind === ApiItemKind.Property) {
		assert(
			item.memberSide === "static" || item.memberSide === "instance",
			"Class properties must identify their member side.",
		);
	} else {
		assert(!("memberSide" in item), "Interface properties have no static member side.");
	}
	const definition = item.definition;
	if (definition.kind === "accessors") {
		const { getter, setter } = definition.accessors;
		assert(
			getter !== undefined || setter !== undefined,
			"An accessor property must declare at least one accessor.",
		);
		for (const accessor of [getter, setter]) {
			if (accessor !== undefined) {
				assert(
					accessor.origin.packageName === item.packageName,
					"Accessor origin must match the property's package.",
				);
			}
		}
		assert.deepEqual(
			item.documentation,
			(getter ?? setter)?.documentation,
			"Property display documentation must use the getter when present.",
		);
	} else {
		assert(
			definition.kind === (item.kind === ApiItemKind.Property ? "field" : "signature"),
			"The property definition must match its item kind.",
		);
		assert(
			definition.declaration.origin.packageName === item.packageName,
			"Property origin must match the item's package.",
		);
		assert.deepEqual(
			item.documentation,
			definition.declaration.documentation,
			"Property display documentation must match its declaration.",
		);
	}
}

/**
 * Checks entrypoint, export, and inherited receiving views without changing ownership.
 * @param items - Indexed original items.
 * @param groups - Resolved declaration groups available to exports.
 */
function validateExposure(
	items: ReadonlyMap<ApiIdentifier, ApiItem>,
	groups: ReadonlyMap<ApiDeclarationGroup["id"], ApiDeclarationGroup>,
): void {
	for (const item of items.values()) {
		if (item.kind === ApiItemKind.Package) {
			assert(
				new Set(item.entrypoints).size === item.entrypoints.length,
				"Duplicate package entrypoint.",
			);
			for (const id of item.entrypoints) {
				const entrypoint = items.get(id);
				assert(
					entrypoint?.kind === ApiItemKind.EntryPoint && entrypoint.package === item.id,
					"Package entrypoints must exist and retain their package owner.",
				);
			}
		}
		if (item.kind === ApiItemKind.EntryPoint) {
			const owner = items.get(item.package);
			assert(
				owner?.kind === ApiItemKind.Package && owner.entrypoints.includes(item.id),
				"Entrypoint ownership must be reciprocal.",
			);
			assert(
				owner.packageName === item.packageName,
				"Entrypoint package names must match their owner.",
			);
		}
		if ("exports" in item) {
			for (const binding of item.exports) {
				if (binding.target.kind === "resolved") {
					assert(
						groups.has(binding.target.group),
						"A resolved export must target a declaration group in the snapshot.",
					);
				}
			}
		}
		if ("inheritedMembers" in item) {
			for (const inherited of item.inheritedMembers) {
				assert(
					inherited.receiver === item.id,
					"Inherited members must identify their receiving type.",
				);
				const declaration = items.get(inherited.declaration);
				assert(
					declaration !== undefined &&
						"parent" in declaration &&
						declaration.parent !== item.id,
					"An inherited member must reference an original member of another type.",
				);
				const owner = items.get(declaration.parent);
				assert(
					owner?.kind === ApiItemKind.Class || owner?.kind === ApiItemKind.Interface,
					"An inherited member's original owner must be a class or interface.",
				);
			}
		}
	}
}

/**
 * Detects lexical-parent cycles without traversing export or type-reference edges.
 * @param items - Items whose direct parent relationships have already been validated.
 */
function validateOwnershipCycles(items: ReadonlyMap<ApiIdentifier, ApiItem>): void {
	const completed = new Set<ApiIdentifier>();
	for (const item of items.values()) {
		let current = item;
		const path = new Set<ApiIdentifier>();
		while ("parent" in current && !completed.has(current.id)) {
			assert(!path.has(current.id), "Lexical ownership cycle in inspection snapshot.");
			path.add(current.id);
			const parent = items.get(current.parent);
			assert(parent !== undefined, "A validated parent must exist.");
			current = parent;
		}
		for (const id of path) {
			completed.add(id);
		}
	}
}

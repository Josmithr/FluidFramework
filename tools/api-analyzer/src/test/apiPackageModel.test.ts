/* Tests the inspection snapshot independently of compiler capture and artifact projection. */

import assert from "node:assert/strict";
import { describe, it } from "mocha";
import { createApiPackageModel } from "../analysis/apiPackageModel.js";
import {
	ApiItemKind,
	type ApiClass,
	type ApiDeclarationGroup,
	type ApiDeclarationGroupIdentifier,
	type ApiEntryPoint,
	type ApiFunction,
	type ApiIdentifier,
	type ApiInterface,
	type ApiItem,
	type ApiNamespace,
	type ApiPackage,
	type ApiProperty,
	type ApiPropertyDeclaration,
	type ApiPropertySignature,
} from "../analysis-types/apiItems.js";

/**
 * Creates source-ordered overloads whose identities sort in the opposite order.
 * @returns Mutable producer inputs with a separate entrypoint export surface.
 */
function createFixture(): {
	packageItem: ApiPackage;
	entrypoint: ApiEntryPoint;
	firstOverload: ApiFunction;
	overloads: ApiFunction[];
	group: ApiDeclarationGroup;
	items: ApiItem[];
} {
	const packageId = "package" as ApiIdentifier<ApiItemKind.Package>;
	const entrypointId = "entrypoint" as ApiIdentifier<ApiItemKind.EntryPoint>;
	const groupId = "parse-group" as ApiDeclarationGroupIdentifier;
	const overloads: ApiFunction[] = ["z-overload", "a-overload"].map((id, index) => ({
		id: id as ApiIdentifier<ApiItemKind.Function>,
		kind: ApiItemKind.Function,
		name: "parse",
		packageName: "example",
		parent: packageId,
		origin: { packageName: "example", file: "index.d.ts", start: index * 100 },
		classification: { localModifierTags: [] },
		parameterNames: ["value"],
		declarationGroup: groupId,
		documentation: { originalComment: "/** Parse. */", resolvedComment: "/** Parse. */" },
	}));
	const firstOverload = overloads[0];
	assert(firstOverload !== undefined);
	const packageItem: ApiPackage = {
		id: packageId,
		kind: ApiItemKind.Package,
		name: "example",
		packageName: "example",
		children: overloads.map((item) => item.id),
		entrypoints: [entrypointId],
	};
	const entrypoint: ApiEntryPoint = {
		id: entrypointId,
		kind: ApiItemKind.EntryPoint,
		name: ".",
		packageName: "example",
		package: packageId,
		exports: [
			{ name: "parse", typeOnly: false, target: { kind: "resolved", group: groupId } },
		],
	};
	const group: ApiDeclarationGroup = {
		id: groupId,
		declarations: overloads.map((item) => item.id),
	};
	return {
		packageItem,
		entrypoint,
		firstOverload,
		overloads,
		group,
		items: [packageItem, entrypoint, ...overloads],
	};
}

/**
 * Adds a class accessor pair and an interface property signature to a producer input.
 * @param fixture - Mutable package records to extend.
 * @returns The property records and their original owning types.
 */
function addProperties(fixture: ReturnType<typeof createFixture>): {
	classItem: ApiClass;
	interfaceItem: ApiInterface;
	property: ApiProperty;
	signature: ApiPropertySignature;
} {
	const classId = "class" as ApiIdentifier<ApiItemKind.Class>;
	const interfaceId = "interface" as ApiIdentifier<ApiItemKind.Interface>;
	const propertyId = "property" as ApiIdentifier<ApiItemKind.Property>;
	const signatureId = "signature" as ApiIdentifier<ApiItemKind.PropertySignature>;
	const getter: ApiPropertyDeclaration = {
		origin: { packageName: "example", file: "index.d.ts", start: 300 },
		classification: { localModifierTags: ["@getter"] },
		documentation: { resolvedComment: "/** Read. */" },
		type: {
			tokens: [{ kind: "Content", text: "string" }],
			tokenRange: { startIndex: 0, endIndex: 1 },
		},
	};
	const setter: ApiPropertyDeclaration = {
		...getter,
		origin: { ...getter.origin, start: 400 },
		classification: { localModifierTags: ["@setter"] },
		documentation: { resolvedComment: "/** Write. */" },
		type: {
			tokens: [{ kind: "Content", text: "string | number" }],
			tokenRange: { startIndex: 0, endIndex: 1 },
		},
	};
	const classItem: ApiClass = {
		id: classId,
		kind: ApiItemKind.Class,
		name: "Container",
		packageName: "example",
		parent: fixture.packageItem.id,
		origin: { ...getter.origin, start: 200 },
		classification: { localModifierTags: [] },
		children: [propertyId],
		inheritedMembers: [],
	};
	const interfaceItem: ApiInterface = {
		...classItem,
		id: interfaceId,
		kind: ApiItemKind.Interface,
		name: "Contract",
		children: [signatureId],
	};
	assert(getter.documentation !== undefined);
	const property: ApiProperty = {
		id: propertyId,
		kind: ApiItemKind.Property,
		name: "value",
		packageName: "example",
		parent: classId,
		memberSide: "instance",
		definition: { kind: "accessors", accessors: { getter, setter } },
		documentation: getter.documentation,
	};
	const signature: ApiPropertySignature = {
		id: signatureId,
		kind: ApiItemKind.PropertySignature,
		name: "value",
		packageName: "example",
		parent: interfaceId,
		definition: { kind: "signature", declaration: getter, optional: true, writable: false },
		documentation: getter.documentation,
	};
	Object.assign(fixture.packageItem, {
		children: [...fixture.packageItem.children, classId, interfaceId],
	});
	fixture.items.push(classItem, interfaceItem, property, signature);
	return { classItem, interfaceItem, property, signature };
}

describe("API package inspection snapshot", () => {
	it("keeps stable lookups and overload order separate from identity enumeration", () => {
		const fixture = createFixture();
		const model = createApiPackageModel(fixture.packageItem.id, fixture.items, [
			fixture.group,
		]);
		assert.equal(model.package, fixture.packageItem.id);
		const items = [...model.getAllItems()];
		assert.deepEqual(
			items.map((item) => item.id),
			fixture.items.map((item) => item.id).sort(),
		);
		for (const item of items) {
			assert.equal(model.getItem(item.id), item);
		}
		const group = model.getDeclarationGroup(fixture.group.id);
		assert.deepEqual(group?.declarations, fixture.group.declarations);
		assert.equal(model.getDeclarationGroup(fixture.group.id), group);
		assert.equal(model.getItem("missing" as ApiIdentifier), undefined);
		assert.equal(
			model.getDeclarationGroup("missing" as ApiDeclarationGroupIdentifier),
			undefined,
		);
	});

	it("isolates input mutations without freezing caller-owned records", () => {
		const fixture = createFixture();
		const model = createApiPackageModel(fixture.packageItem.id, fixture.items, [
			fixture.group,
		]);
		const before = JSON.stringify([...model.getAllItems()]);
		assert.equal(Object.isFrozen(fixture.packageItem), false);
		Object.assign(fixture.packageItem, { name: "changed" });
		assert(fixture.firstOverload.documentation !== undefined);
		Object.assign(fixture.firstOverload.documentation, { resolvedComment: "/** Changed. */" });
		Object.assign(fixture.group, { declarations: [] });
		fixture.items.length = 0;
		assert.equal(JSON.stringify([...model.getAllItems()]), before);
		assert.equal(model.getDeclarationGroup(fixture.group.id)?.declarations.length, 2);
	});

	it("freezes nested records and arrays exposed through all lookup paths", () => {
		const fixture = createFixture();
		Object.freeze(fixture.firstOverload);
		const model = createApiPackageModel(fixture.packageItem.id, fixture.items, [
			fixture.group,
		]);
		assert(Object.isFrozen(model));
		const packageItem = model.getItem(model.package);
		assert(packageItem?.kind === ApiItemKind.Package);
		assert(Object.isFrozen(packageItem.children));
		const overload = model.getItem(fixture.firstOverload.id);
		assert(overload?.documentation !== undefined);
		assert(Object.isFrozen(overload));
		assert(Object.isFrozen(overload.documentation));
		const documentation = overload.documentation;
		assert.throws(
			() => Object.assign(documentation, { resolvedComment: "changed" }),
			TypeError,
		);
		assert(Object.isFrozen(model.getDeclarationGroup(fixture.group.id)?.declarations));
	});

	it("rejects duplicate identities instead of silently replacing records", () => {
		const fixture = createFixture();
		assert.throws(
			() =>
				createApiPackageModel(
					fixture.packageItem.id,
					[...fixture.items, fixture.packageItem],
					[fixture.group],
				),
			/duplicate item identity/i,
		);
		assert.throws(
			() =>
				createApiPackageModel(fixture.packageItem.id, fixture.items, [
					fixture.group,
					fixture.group,
				]),
			/duplicate declaration-group identity/i,
		);
	});

	it("requires the inspected package to exist with the correct kind", () => {
		const fixture = createFixture();
		for (const id of ["missing", fixture.firstOverload.id]) {
			assert.throws(
				() =>
					createApiPackageModel(id as ApiIdentifier<ApiItemKind.Package>, fixture.items, [
						fixture.group,
					]),
				/inspected package/i,
			);
		}
	});

	it("preserves dependency ownership when the inspected entrypoint re-exports its group", () => {
		const fixture = createFixture();
		const dependency: ApiPackage = {
			...fixture.packageItem,
			id: "dependency" as ApiIdentifier<ApiItemKind.Package>,
			name: "dependency",
			packageName: "dependency",
			entrypoints: [],
		};
		Object.assign(fixture.packageItem, { children: [] });
		for (const sourceOverload of fixture.overloads) {
			Object.assign(sourceOverload, {
				parent: dependency.id,
				packageName: dependency.packageName,
			});
			Object.assign(sourceOverload.origin, { packageName: dependency.packageName });
		}
		fixture.items.push(dependency);
		const model = createApiPackageModel(fixture.packageItem.id, fixture.items, [
			fixture.group,
		]);
		const overload = model.getItem(fixture.firstOverload.id);
		assert(overload?.kind === ApiItemKind.Function);
		assert.equal(overload.parent, dependency.id);
		assert.equal(overload.packageName, "dependency");
		assert.equal(model.package, fixture.packageItem.id);
	});

	it("preserves distinct property kinds and independent accessor metadata", () => {
		const fixture = createFixture();
		const { property, signature } = addProperties(fixture);
		const model = createApiPackageModel(fixture.packageItem.id, fixture.items, [
			fixture.group,
		]);
		const result = model.getItem(property.id);
		assert(result?.kind === ApiItemKind.Property && result.definition.kind === "accessors");
		assert.deepEqual(result.definition, property.definition);
		assert(Object.isFrozen(result.definition.accessors.getter?.type.tokens));
		assert(
			Object.isFrozen(result.definition.accessors.setter?.classification.localModifierTags),
		);
		assert.equal(model.getItem(signature.id)?.kind, ApiItemKind.PropertySignature);
	});

	it("retains inherited views without changing the original member's owner", () => {
		const fixture = createFixture();
		const { property, classItem, interfaceItem } = addProperties(fixture);
		Object.assign(interfaceItem, {
			inheritedMembers: [{ receiver: interfaceItem.id, declaration: property.id }],
		});
		const model = createApiPackageModel(fixture.packageItem.id, fixture.items, [
			fixture.group,
		]);
		const receiver = model.getItem(interfaceItem.id);
		assert(receiver?.kind === ApiItemKind.Interface);
		assert.deepEqual(receiver.inheritedMembers, [
			{ receiver: interfaceItem.id, declaration: property.id },
		]);
		const original = model.getItem(property.id);
		assert(original?.kind === ApiItemKind.Property);
		assert.equal(original.parent, classItem.id);
		assert(Object.isFrozen(receiver.inheritedMembers[0]));
	});

	it("retains opaque external exports without requiring a local target", () => {
		const fixture = createFixture();
		Object.assign(fixture.entrypoint, {
			exports: [
				{
					name: "foreign",
					typeOnly: true,
					target: {
						kind: "external",
						moduleSpecifier: "outside-suite",
						importedName: "Original",
					},
				},
			],
		});
		const model = createApiPackageModel(fixture.packageItem.id, fixture.items, [
			fixture.group,
		]);
		assert.deepEqual(model.getItem(fixture.entrypoint.id), fixture.entrypoint);
	});

	it("supports fields and one-sided accessors without inventing a counterpart", () => {
		const fixture = createFixture();
		const { property, signature } = addProperties(fixture);
		assert(property.definition.kind === "accessors");
		const { getter, setter } = property.definition.accessors;
		assert(getter !== undefined && setter !== undefined);
		for (const declaration of [getter, setter]) {
			Object.assign(property, {
				definition: {
					kind: "accessors",
					accessors: declaration === getter ? { getter } : { setter },
				},
				documentation: declaration.documentation,
			});
			Object.assign(signature, {
				definition: property.definition,
				documentation: declaration.documentation,
			});
			const accessorModel = createApiPackageModel(fixture.packageItem.id, fixture.items, [
				fixture.group,
			]);
			assert.deepEqual(accessorModel.getItem(property.id), property);
			assert.deepEqual(accessorModel.getItem(signature.id), signature);
		}
		Object.assign(property, {
			memberSide: "static",
			definition: { kind: "field", declaration: getter, optional: false, writable: true },
			documentation: getter.documentation,
		});
		const model = createApiPackageModel(fixture.packageItem.id, fixture.items, [
			fixture.group,
		]);
		assert.deepEqual(model.getItem(property.id), property);
	});

	it("keeps an undocumented getter distinct from a documented setter", () => {
		const fixture = createFixture();
		const { property } = addProperties(fixture);
		assert(property.definition.kind === "accessors");
		const { getter, setter } = property.definition.accessors;
		assert(getter !== undefined && setter !== undefined);
		const { documentation: omittedGetterDocumentation, ...undocumentedGetter } = getter;
		const { documentation: omittedPropertyDocumentation, ...undocumentedProperty } = property;
		assert(
			omittedGetterDocumentation !== undefined && omittedPropertyDocumentation !== undefined,
		);
		const replacement: ApiProperty = {
			...undocumentedProperty,
			definition: { kind: "accessors", accessors: { getter: undocumentedGetter, setter } },
		};
		const items = fixture.items.map((item) => (item.id === property.id ? replacement : item));
		const model = createApiPackageModel(fixture.packageItem.id, items, [fixture.group]);
		assert.equal(model.getItem(property.id)?.documentation, undefined);
		Object.assign(replacement, { documentation: setter.documentation });
		assert.throws(
			() => createApiPackageModel(fixture.packageItem.id, items, [fixture.group]),
			/display documentation/i,
		);
	});

	const malformed: readonly [
		string,
		(fixture: ReturnType<typeof createFixture>) => void,
		RegExp,
	][] = [
		[
			"missing parent",
			(fixture) => {
				Object.assign(fixture.firstOverload, { parent: "missing" });
			},
			/parent/i,
		],
		[
			"nonreciprocal children",
			(fixture) => {
				Object.assign(fixture.packageItem, { children: [] });
			},
			/child/i,
		],
		[
			"duplicate children",
			(fixture) => {
				Object.assign(fixture.packageItem, {
					children: [...fixture.packageItem.children, fixture.firstOverload.id],
				});
			},
			/duplicate child/i,
		],
		[
			"wrong child kind",
			(fixture) => {
				Object.assign(fixture.packageItem, {
					children: [...fixture.packageItem.children, fixture.entrypoint.id],
				});
			},
			/child/i,
		],
		[
			"unlisted entrypoint",
			(fixture) => {
				Object.assign(fixture.packageItem, { entrypoints: [] });
			},
			/entrypoint/i,
		],
		[
			"wrong entrypoint owner",
			(fixture) => {
				Object.assign(fixture.entrypoint, { package: fixture.firstOverload.id });
			},
			/entrypoint/i,
		],
		[
			"wrong package ownership",
			(fixture) => {
				Object.assign(fixture.firstOverload, { packageName: "other" });
			},
			/package/i,
		],
		[
			"wrong origin package",
			(fixture) => {
				Object.assign(fixture.firstOverload.origin, { packageName: "other" });
			},
			/origin/i,
		],
		[
			"empty declaration group",
			(fixture) => {
				Object.assign(fixture.group, { declarations: [] });
			},
			/group/i,
		],
		[
			"missing group declaration",
			(fixture) => {
				Object.assign(fixture.group, { declarations: ["missing"] });
			},
			/group/i,
		],
		[
			"duplicate group declarations",
			(fixture) => {
				Object.assign(fixture.group, {
					declarations: [...fixture.group.declarations, fixture.firstOverload.id],
				});
			},
			/duplicate.*group/i,
		],
		[
			"nonreciprocal group membership",
			(fixture) => {
				Object.assign(fixture.firstOverload, { declarationGroup: undefined });
			},
			/group/i,
		],
		[
			"missing export group",
			(fixture) => {
				Object.assign(fixture.entrypoint, {
					exports: [
						{
							name: "missing",
							typeOnly: false,
							target: { kind: "resolved", group: "missing" },
						},
					],
				});
			},
			/export.*group/i,
		],
		[
			"duplicate package names",
			(fixture) => {
				fixture.items.push({
					...fixture.packageItem,
					id: "duplicate-package" as ApiIdentifier<ApiItemKind.Package>,
					children: [],
					entrypoints: [],
				});
			},
			/duplicate package/i,
		],
		[
			"class property in an interface",
			(fixture) => {
				const { property, interfaceItem, classItem } = addProperties(fixture);
				Object.assign(property, { parent: interfaceItem.id });
				Object.assign(classItem, { children: [] });
				Object.assign(interfaceItem, { children: [...interfaceItem.children, property.id] });
			},
			/parent kind/i,
		],
		[
			"signature definition on a class property",
			(fixture) => {
				const { property, signature } = addProperties(fixture);
				Object.assign(property, { definition: signature.definition });
			},
			/property definition/i,
		],
		[
			"empty accessor pair",
			(fixture) => {
				const { property } = addProperties(fixture);
				Object.assign(property, { definition: { kind: "accessors", accessors: {} } });
			},
			/accessor/i,
		],
		[
			"static interface signature",
			(fixture) => {
				const { signature } = addProperties(fixture);
				Object.assign(signature, { memberSide: "static" });
			},
			/member side/i,
		],
		[
			"wrong accessor origin",
			(fixture) => {
				const { property } = addProperties(fixture);
				assert(property.definition.kind === "accessors");
				const getter = property.definition.accessors.getter;
				assert(getter !== undefined);
				Object.assign(getter.origin, { packageName: "other" });
			},
			/origin/i,
		],
		[
			"wrong inherited receiver",
			(fixture) => {
				const { interfaceItem, property, classItem } = addProperties(fixture);
				Object.assign(interfaceItem, {
					inheritedMembers: [{ receiver: classItem.id, declaration: property.id }],
				});
			},
			/receiving type/i,
		],
		[
			"missing inherited declaration",
			(fixture) => {
				const { interfaceItem } = addProperties(fixture);
				Object.assign(interfaceItem, {
					inheritedMembers: [{ receiver: interfaceItem.id, declaration: "missing" }],
				});
			},
			/original member/i,
		],
		[
			"own member marked inherited",
			(fixture) => {
				const { classItem, property } = addProperties(fixture);
				Object.assign(classItem, {
					inheritedMembers: [{ receiver: classItem.id, declaration: property.id }],
				});
			},
			/original member/i,
		],
		[
			"top-level function marked inherited",
			(fixture) => {
				const { interfaceItem } = addProperties(fixture);
				Object.assign(interfaceItem, {
					inheritedMembers: [
						{ receiver: interfaceItem.id, declaration: fixture.firstOverload.id },
					],
				});
			},
			/original owner/i,
		],
	];
	for (const [name, mutate, message] of malformed) {
		it(`rejects ${name}`, () => {
			const fixture = createFixture();
			mutate(fixture);
			assert.throws(
				() => createApiPackageModel(fixture.packageItem.id, fixture.items, [fixture.group]),
				message,
			);
		});
	}

	it("rejects reciprocal namespace ownership cycles", () => {
		const fixture = createFixture();
		const firstId = "first-namespace" as ApiIdentifier<ApiItemKind.Namespace>;
		const secondId = "second-namespace" as ApiIdentifier<ApiItemKind.Namespace>;
		const first: ApiNamespace = {
			id: firstId,
			kind: ApiItemKind.Namespace,
			name: "First",
			packageName: "example",
			parent: secondId,
			origin: fixture.firstOverload.origin,
			classification: { localModifierTags: [] },
			children: [secondId],
			exports: [],
		};
		const second: ApiNamespace = {
			...first,
			id: secondId,
			name: "Second",
			parent: firstId,
			children: [firstId],
		};
		fixture.items.push(first, second);
		assert.throws(
			() => createApiPackageModel(fixture.packageItem.id, fixture.items, [fixture.group]),
			/ownership cycle/i,
		);
	});
});

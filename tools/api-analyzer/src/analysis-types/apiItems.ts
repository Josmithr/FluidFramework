/**
 * Immutable, declaration-oriented API inspection model.
 *
 * This module is not exported by the package and is not yet populated by the analyzer.
 * Declarations have individual items, except that a property's getter and setter share one property item.
 * Accessor details remain separate within that item; export bindings and inherited views do not change its ownership.
 * Kind-specific TypeScript type expressions and a full documentation tree remain outside this initial contract.
 */

import type { ReleaseLevel } from "./classification.js";
import type { CodeExcerpt } from "./excerpt.js";
import type { ModelOrigin } from "./modelGraph.js";

// TODO: Integrate compiler-to-item projection before exporting this contract from the package.

/**
 * A package name, unique within one selected suite.
 */
export type PackageName = string;

/**
 * Type-only marker for opaque item identities.
 */
declare const apiIdentifierBrand: unique symbol;

/**
 * Opaque item identity within a versioned suite; not a name, export path, or TSDoc selector.
 * @typeParam TKind - Allowed target kinds. Defaults to any API item kind.
 */
export type ApiIdentifier<TKind extends ApiItemKind = ApiItemKind> = string & {
	/**
	 * Target-kind constraint assigned by the model producer, not a serialized property.
	 */
	readonly [apiIdentifierBrand]: TKind;
};

/**
 * Type-only marker that keeps declaration-group identities separate from item identities.
 */
declare const declarationGroupIdentifierBrand: unique symbol;

/**
 * Opaque identity of declarations associated by the compiler's resolved symbol.
 */
export type ApiDeclarationGroupIdentifier = string & {
	/**
	 * Group identity marker; not a serialized property.
	 */
	readonly [declarationGroupIdentifierBrand]: true;
};

/**
 * One analyzed package and read-only access to its selected suite.
 *
 * @remarks
 * Lookup methods on this model include original declarations from the package and selected dependencies,
 * including referenced support APIs that are not exported.
 * Dependencies keep their own package ownership. Export exposure does not move their items into this package.
 * No functions or map objects in this inspection view define a new serialized artifact format.
 */
export interface ApiPackageModel extends ApiModelLookup {
	/**
	 * The package being inspected. Its record lists original children and entrypoints.
	 */
	readonly package: ApiIdentifier<ApiItemKind.Package>;
}

/**
 * Read-only access to one immutable snapshot of API items and declaration relationships.
 *
 * @remarks
 * Implementations must not expose mutable maps or parser nodes behind these methods.
 * Repeated lookup returns the same immutable records for the lifetime of the view.
 * Documentation resolution is complete before this view is supplied to inspection consumers or reference-rule callbacks.
 * Brands constrain callers but do not replace runtime identity and relationship validation.
 */
export interface ApiModelLookup {
	/**
	 * Looks up an item without resolving names or loading dependencies.
	 * @param id - Producer-assigned item identity.
	 * @returns The item, or undefined when the identity is outside this view.
	 */
	getItem(id: ApiIdentifier): ApiItem | undefined;

	/**
	 * Looks up declarations of one resolved symbol, without combining their documentation.
	 *
	 * @remarks
	 * Groups connect function overloads, repeated namespace declarations, and different declaration kinds that share one symbol.
	 * Declarations with the same name in unrelated scopes remain in different groups.
	 *
	 * @param id - Producer-assigned declaration-group identity.
	 * @returns The group, or undefined when the identity is outside this view.
	 *
	 * @example Overloads
	 * Each overload below has its own function item and documentation.
	 * Both items reference the same declaration group, whose declarations retain overload order.
	 *
	 * ```typescript
	 * export declare function parse(value: string): string;
	 * export declare function parse(value: Uint8Array): string;
	 * ```
	 *
	 * @example A function and namespace sharing the same symbol
	 * A function and a namespace can share one symbol while remaining separate items.
	 * Their group contains both items. The version variable belongs to the namespace item, not to the function.
	 * Multiple declarations of the namespace also belong to that group and keep their own children.
	 *
	 * ```typescript
	 * export declare function create(): void;
	 * export declare namespace create {
	 *     const version: string;
	 * }
	 * ```
	 *
	 * @example Inspecting related declarations without matching names
	 * Use a function item's group identifier to inspect its related declarations without matching names.
	 * The lookup can be the package model itself or another view implementing this interface.
	 *
	 * ```typescript
	 * declare const model: ApiModelLookup;
	 * declare const functionItem: ApiFunction;
	 *
	 * if (functionItem.declarationGroup !== undefined) {
	 *     const group = model.getDeclarationGroup(functionItem.declarationGroup);
	 *     for (const id of group?.declarations ?? []) {
	 *         const related = model.getItem(id);
	 *         // A function's group can also contain namespace declarations.
	 *         if (related?.kind === ApiItemKind.Function) {
	 *             console.log(related.parameterNames);
	 *         }
	 *     }
	 * }
	 * ```
	 */
	getDeclarationGroup(id: ApiDeclarationGroupIdentifier): ApiDeclarationGroup | undefined;

	/**
	 * Enumerates the same records that item lookup returns, including selected dependency items.
	 * @returns Immutable items in deterministic identity order, not overload order.
	 */
	getAllItems(): IterableIterator<ApiItem>;
}

/**
 * Minimal documentation view, separate from API classification.
 *
 * @remarks
 * Original and resolved comments remain distinct. Strings contain TSDoc, not HTML or plain text.
 * The producer may wrap TSDoc internally, but no mutable parser object may escape or later alter this view.
 * Structured sections and link queries can be added after their public contracts are designed.
 */
export interface ApiDocumentation {
	/**
	 * Original comment on this declaration, including delimiters.
	 * @defaultValue Omitted when no local comment exists. An explicit empty comment remains present.
	 */
	readonly originalComment?: string;

	/**
	 * Resolved TSDoc content, including supported inheritance.
	 * @defaultValue Omitted when no documentation is available. Explicit empty comments remain present.
	 */
	readonly resolvedComment?: string;
}

/**
 * Validated release classification and local modifier tags for one declaration.
 */
export interface ApiClassification {
	/**
	 * Effective release level, including the existing declaring-container fallback.
	 * @defaultValue Omitted when an untagged declaration is permitted by configuration.
	 */
	readonly releaseLevel?: ReleaseLevel;

	/**
	 * Recognized tags on this declaration's original comment, not copied from ancestors or siblings.
	 * @remarks An empty array means no local tags, not unavailable classification.
	 */
	readonly localModifierTags: readonly string[];
}

/**
 * The kind of API item.
 */
export enum ApiItemKind {
	/**
	 * An unnamed call signature.
	 */
	CallSignature = "CallSignature",

	/**
	 * One class declaration.
	 */
	Class = "Class",

	/**
	 * One class constructor overload.
	 */
	Constructor = "Constructor",

	/**
	 * An unnamed construct signature.
	 */
	ConstructSignature = "ConstructSignature",

	/**
	 * A package entrypoint that exposes exported bindings without owning their declarations.
	 */
	EntryPoint = "EntryPoint",

	/**
	 * One enum declaration.
	 */
	Enum = "Enum",

	/**
	 * One member of an enum declaration.
	 */
	EnumMember = "EnumMember",

	/**
	 * One function declaration or overload.
	 */
	Function = "Function",

	/**
	 * One index signature.
	 */
	IndexSignature = "IndexSignature",

	/**
	 * One interface declaration, including one part of a merged symbol.
	 */
	Interface = "Interface",

	/**
	 * One class method declaration or overload.
	 */
	Method = "Method",

	/**
	 * One interface method signature.
	 */
	MethodSignature = "MethodSignature",

	/**
	 * One namespace declaration or block.
	 */
	Namespace = "Namespace",

	/**
	 * A package and its original declarations.
	 */
	Package = "Package",

	/**
	 * A class property declared as a field or accessors.
	 */
	Property = "Property",

	/**
	 * An interface property declared as a signature or accessors.
	 */
	PropertySignature = "PropertySignature",

	/**
	 * One type-alias declaration.
	 */
	TypeAlias = "TypeAlias",

	/**
	 * One variable declaration.
	 */
	Variable = "Variable",
}

/**
 * Shared identity of a declaration, package, or entrypoint item.
 * @typeParam TKind - The item's specific kind.
 */
export interface ApiItemBase<TKind extends ApiItemKind> {
	/**
	 * Producer-assigned identity, independent of export aliases.
	 */
	readonly id: ApiIdentifier<TKind>;

	/**
	 * Discriminator used to narrow the concrete item interface.
	 */
	readonly kind: TKind;

	/**
	 * Declared name or display spelling; unnamed signatures may use an empty string.
	 */
	readonly name: string;

	/**
	 * Original owning package, independent of where this item is exposed.
	 */
	readonly packageName: PackageName;

	/**
	 * Immutable original and resolved documentation after content resolution completes.
	 * @defaultValue Omitted when neither original nor resolved documentation is available.
	 */
	readonly documentation?: ApiDocumentation;
}

/**
 * An individual source declaration with original ownership and classification.
 * @typeParam TKind - Declaration kind, excluding packages and entrypoints.
 * @typeParam TParentKind - Permitted original declaring-parent kinds.
 */
export interface ApiDeclarationBase<
	TKind extends ApiDeclarationKind,
	TParentKind extends ApiItemKind,
> extends ApiItemBase<TKind> {
	/**
	 * Original lexical parent. Top-level declarations belong to the package, never an entrypoint.
	 */
	readonly parent: ApiIdentifier<TParentKind>;

	/**
	 * Original source occurrence for this declaration, not an inherited receiving view.
	 */
	readonly origin: ModelOrigin;

	/**
	 * Validated metadata for this declaration. Sibling declarations retain independent classification.
	 */
	readonly classification: ApiClassification;

	/**
	 * Resolved-symbol group, including this declaration and any related declarations.
	 * @defaultValue Omitted for declarations without a group, such as unnamed signatures.
	 */
	readonly declarationGroup?: ApiDeclarationGroupIdentifier;
}

/**
 * Kinds representing source declarations rather than packages or entrypoints.
 */
export type ApiDeclarationKind = Exclude<
	ApiItemKind,
	ApiItemKind.Package | ApiItemKind.EntryPoint
>;

/**
 * Top-level declaration kinds that can be owned by a package or namespace.
 */
export type ApiTopLevelKind =
	| ApiItemKind.Class
	| ApiItemKind.Enum
	| ApiItemKind.Function
	| ApiItemKind.Interface
	| ApiItemKind.Namespace
	| ApiItemKind.TypeAlias
	| ApiItemKind.Variable;

/**
 * Member kinds that can be declared inside a class.
 */
export type ApiClassMemberKind =
	| ApiItemKind.Constructor
	| ApiItemKind.IndexSignature
	| ApiItemKind.Method
	| ApiItemKind.Property;

/**
 * Member kinds that can be declared inside an interface.
 */
export type ApiInterfaceMemberKind =
	| ApiItemKind.CallSignature
	| ApiItemKind.ConstructSignature
	| ApiItemKind.IndexSignature
	| ApiItemKind.MethodSignature
	| ApiItemKind.PropertySignature;

/**
 * Package-owned declarations and separately indexed exposure surfaces.
 */
export interface ApiPackage extends ApiItemBase<ApiItemKind.Package> {
	/**
	 * Original top-level declarations, including non-exported support declarations.
	 */
	readonly children: readonly ApiIdentifier<ApiTopLevelKind>[];

	/**
	 * Entrypoint nodes whose exports reference declarations without owning them.
	 */
	readonly entrypoints: readonly ApiIdentifier<ApiItemKind.EntryPoint>[];
}

/**
 * An exposure surface, not a declaration's lexical parent.
 */
export interface ApiEntryPoint extends ApiItemBase<ApiItemKind.EntryPoint> {
	/**
	 * Package that defines this surface; not the owner of every exported target.
	 */
	readonly package: ApiIdentifier<ApiItemKind.Package>;

	/**
	 * Exported bindings on this surface in deterministic name order.
	 */
	readonly exports: readonly ApiExportBinding[];
}

/**
 * An exported name, kept separate from declaration identity and ownership.
 *
 * @remarks
 * A resolved-symbol group can contain several overloads or declaration kinds.
 * A selected dependency target uses the same resolved form as a local target and retains its original package.
 */
export interface ApiExportBinding {
	/**
	 * Name exposed by this binding, which may differ from its target's name.
	 */
	readonly name: string;

	/**
	 * Whether this export path exposes only types.
	 */
	readonly typeOnly: boolean;

	/**
	 * Resolved declarations or an explicit import binding outside the selected suite.
	 */
	readonly target: ApiExportTarget;
}

/**
 * Distinguishes inspectable suite declarations from an opaque external binding.
 *
 * @remarks
 * Local exports and re-exports from another selected package in the same suite use the resolved variant.
 * Their declaration groups are available through the shared lookup, and the items retain their original package ownership.
 * External means outside the selected suite, not merely outside the package being inspected.
 */
export type ApiExportTarget =
	| {
			/**
			 * The target can be inspected through the shared lookup, including re-exports from other selected suite packages.
			 */
			readonly kind: "resolved";

			/**
			 * The group identifies all declarations of the exported symbol, not one chosen overload.
			 */
			readonly group: ApiDeclarationGroupIdentifier;
	  }
	| {
			/**
			 * The target belongs to a package outside the selected suite.
			 */
			readonly kind: "external";

			/**
			 * Original package import specifier, including any subpath.
			 */
			readonly moduleSpecifier: string;

			/**
			 * Imported name, including default.
			 * @defaultValue Omitted for a module namespace binding.
			 */
			readonly importedName?: string;
	  };

/**
 * Related declaration items of one resolved symbol, without merged content or metadata.
 *
 * @remarks
 * Declarations with the same spelling but different symbols remain in different groups.
 * The group does not own its members; each declaration retains its original lexical parent.
 * Filtering declarations by a callable kind retains that kind's compiler overload order.
 * A property appears once even when its definition contains both a getter and a setter.
 */
export interface ApiDeclarationGroup {
	/**
	 * Opaque resolved-symbol identity, distinct from each declaration identity.
	 */
	readonly id: ApiDeclarationGroupIdentifier;

	/**
	 * Related declaration items in producer-defined compiler declaration order.
	 */
	readonly declarations: readonly ApiIdentifier<ApiDeclarationKind>[];
}

/**
 * A class declaration with only its originally declared children.
 */
export interface ApiClass
	extends ApiDeclarationBase<ApiItemKind.Class, ApiItemKind.Package | ApiItemKind.Namespace> {
	/**
	 * Original class members; inherited receiving views are separate.
	 */
	readonly children: readonly ApiIdentifier<ApiClassMemberKind>[];

	/**
	 * Inherited members presented on this class without changing their original parent.
	 */
	readonly inheritedMembers: readonly ApiInheritedMember[];
}

/**
 * An interface declaration, including one part of a merged interface symbol.
 */
export interface ApiInterface
	extends ApiDeclarationBase<
		ApiItemKind.Interface,
		ApiItemKind.Package | ApiItemKind.Namespace
	> {
	/**
	 * Members written in this interface declaration, not in other merged declarations.
	 */
	readonly children: readonly ApiIdentifier<ApiInterfaceMemberKind>[];

	/**
	 * Inherited member views whose original declarations remain independently addressable.
	 */
	readonly inheritedMembers: readonly ApiInheritedMember[];
}

/**
 * A namespace declaration with original children and independent exported bindings.
 */
export interface ApiNamespace
	extends ApiDeclarationBase<
		ApiItemKind.Namespace,
		ApiItemKind.Package | ApiItemKind.Namespace
	> {
	/**
	 * Declarations written in this namespace block, including non-exported declarations.
	 */
	readonly children: readonly ApiIdentifier<ApiTopLevelKind>[];

	/**
	 * Bindings exported by this declaration; merged namespace exposure can combine the group's bindings.
	 */
	readonly exports: readonly ApiExportBinding[];
}

/**
 * One function overload or non-overloaded function declaration.
 */
export interface ApiFunction
	extends ApiDeclarationBase<
		ApiItemKind.Function,
		ApiItemKind.Package | ApiItemKind.Namespace
	> {
	/**
	 * Original parameter names in declaration order; undefined entries represent destructuring.
	 * This is a navigation sketch, not the full parameter/type-expression contract.
	 */
	readonly parameterNames: readonly (string | undefined)[];
}

/**
 * Shared details of class properties and interface property signatures.
 *
 * @remarks
 * A getter and setter share one item only when they have the same original owner, symbol, and member side.
 * Their source details and classification remain separate; this item does not combine their modifier tags.
 * Read and write capabilities follow the definition, rather than independent flags that could disagree with it.
 *
 * @typeParam TKind - The property's item kind.
 * @typeParam TParentKind - The original declaring-parent kind.
 */
export interface ApiPropertyBase<
	TKind extends ApiItemKind.Property | ApiItemKind.PropertySignature,
	TParentKind extends ApiItemKind.Class | ApiItemKind.Interface,
> extends ApiItemBase<TKind> {
	/**
	 * Original class or interface owner, never an inherited receiving type.
	 */
	readonly parent: ApiIdentifier<TParentKind>;

	/**
	 * Group connecting this property with related declarations of the same symbol.
	 * @defaultValue Omitted when no declaration group is available.
	 */
	readonly declarationGroup?: ApiDeclarationGroupIdentifier;

	/**
	 * Original declaration details, including each accessor's independent read or write type.
	 */
	readonly definition: ApiPropertyDefinition;

	/**
	 * Completed documentation from the field or signature, or from the getter when present.
	 * A setter-only property uses the setter's documentation. A getter without documentation does not fall back to setter text.
	 * @defaultValue Omitted when the selected declaration has no original or resolved documentation.
	 */
	readonly documentation?: ApiDocumentation;
}

/**
 * A class property declared as a field or accessors.
 */
export interface ApiProperty extends ApiPropertyBase<ApiItemKind.Property, ApiItemKind.Class> {
	/**
	 * Distinguishes static and instance properties with the same spelling.
	 */
	readonly memberSide: "static" | "instance";

	/**
	 * A class field or accessors with independent read and write source details.
	 */
	readonly definition: ApiPropertyDefinition<"field">;
}

/**
 * An interface property declared as a signature or accessors.
 * Interface properties describe instance members and have no static member side.
 */
export interface ApiPropertySignature
	extends ApiPropertyBase<ApiItemKind.PropertySignature, ApiItemKind.Interface> {
	/**
	 * An interface property signature or accessors with independent read and write source details.
	 */
	readonly definition: ApiPropertyDefinition<"signature">;
}

/**
 * Original facts for a field, property signature, getter, or setter within a property item.
 *
 * @remarks
 * The containing definition identifies the declaration's form and the property supplies its original parent.
 * Origin distinguishes individual source occurrences without making accessors separate lookup items.
 */
export interface ApiPropertyDeclaration {
	/**
	 * Original source occurrence of this declaration, not the other accessor or an inherited receiving view.
	 */
	readonly origin: ModelOrigin;

	/**
	 * This declaration's validated classification, without combined accessor modifier tags.
	 */
	readonly classification: ApiClassification;

	/**
	 * This declaration's own original and resolved documentation, after content resolution.
	 * @defaultValue Omitted when neither comment is available.
	 */
	readonly documentation?: ApiDocumentation;

	/**
	 * Type excerpt for the field or signature, getter return type, or setter parameter type.
	 * Read and write excerpts may differ. This is display and reference data, not a complete semantic type representation.
	 */
	readonly type: CodeExcerpt;
}

/**
 * Declaration forms represented by a single property item.
 * @typeParam TDeclarationKind - The non-accessor form allowed by the owner. Defaults to either form.
 */
export type ApiPropertyDefinition<
	TDeclarationKind extends "field" | "signature" = "field" | "signature",
> =
	| {
			/**
			 * A class field or interface property signature; neither implies a declared accessor.
			 */
			readonly kind: TDeclarationKind;

			/**
			 * Source details and the property's type. A writable declaration uses this type for both reading and writing.
			 */
			readonly declaration: ApiPropertyDeclaration;

			/**
			 * Whether the property can be omitted on an instance.
			 */
			readonly optional: boolean;

			/**
			 * Whether assignments are permitted by the declaration. Reading is always permitted by this form.
			 */
			readonly writable: boolean;
	  }
	| {
			/**
			 * One or both declared accessors for this property.
			 */
			readonly kind: "accessors";

			/**
			 * The getter provides the read contract; the setter provides the write contract.
			 * At least one accessor is required. No missing accessor is inferred from the other accessor's type.
			 */
			readonly accessors: ApiPropertyAccessors;
	  };

/**
 * A getter, setter, or pair, preserving their separate source details and types.
 */
export type ApiPropertyAccessors =
	| {
			/**
			 * Declared getter with its read type and documentation.
			 */
			readonly getter: ApiPropertyDeclaration;

			/**
			 * Declared setter with its write type and documentation.
			 * @defaultValue Omitted for a getter-only property, which has no declared write accessor.
			 */
			readonly setter?: ApiPropertyDeclaration;
	  }
	| {
			/**
			 * A setter-only property has no declared read accessor.
			 * @defaultValue Omitted. This branch does not permit a getter.
			 */
			readonly getter?: never;

			/**
			 * Declared setter with its write type and documentation.
			 */
			readonly setter: ApiPropertyDeclaration;
	  };

/**
 * A receiving view of an inherited member, not another source declaration.
 *
 * @remarks
 * Generic substitutions belong to this view, not to the original item's identity or classification.
 * Type-expression details will be designed separately; this sketch records navigation only.
 */
export interface ApiInheritedMember {
	/**
	 * Class or interface on which this view is presented.
	 */
	readonly receiver: ApiIdentifier<ApiItemKind.Class | ApiItemKind.Interface>;

	/**
	 * Original member declaration used for ancestry and policy checks.
	 */
	readonly declaration: ApiIdentifier<ApiClassMemberKind | ApiInterfaceMemberKind>;
}

/**
 * An enum declaration with its original member items.
 */
export interface ApiEnum
	extends ApiDeclarationBase<ApiItemKind.Enum, ApiItemKind.Package | ApiItemKind.Namespace> {
	/**
	 * Original enum members in source order.
	 */
	readonly children: readonly ApiIdentifier<ApiItemKind.EnumMember>[];
}

/**
 * A member of an enum declaration.
 */
export type ApiEnumMember = ApiDeclarationBase<ApiItemKind.EnumMember, ApiItemKind.Enum>;

/**
 * One method overload, with signature details deferred to the type-expression design.
 */
export type ApiMethod = ApiDeclarationBase<ApiItemKind.Method, ApiItemKind.Class>;

/**
 * One interface method signature.
 */
export type ApiMethodSignature = ApiDeclarationBase<
	ApiItemKind.MethodSignature,
	ApiItemKind.Interface
>;

/**
 * One constructor overload owned by its class declaration.
 */
export type ApiConstructor = ApiDeclarationBase<ApiItemKind.Constructor, ApiItemKind.Class>;

/**
 * One interface call signature; anonymous type-literal ownership remains outside this sketch.
 */
export type ApiCallSignature = ApiDeclarationBase<
	ApiItemKind.CallSignature,
	ApiItemKind.Interface
>;

/**
 * One interface construct signature.
 */
export type ApiConstructSignature = ApiDeclarationBase<
	ApiItemKind.ConstructSignature,
	ApiItemKind.Interface
>;

/**
 * One class or interface index signature.
 */
export type ApiIndexSignature = ApiDeclarationBase<
	ApiItemKind.IndexSignature,
	ApiItemKind.Class | ApiItemKind.Interface
>;

/**
 * One type-alias declaration; its type expression will be designed separately.
 */
export type ApiTypeAlias = ApiDeclarationBase<
	ApiItemKind.TypeAlias,
	ApiItemKind.Package | ApiItemKind.Namespace
>;

/**
 * One variable declaration; its type expression will be designed separately.
 */
export type ApiVariable = ApiDeclarationBase<
	ApiItemKind.Variable,
	ApiItemKind.Package | ApiItemKind.Namespace
>;

/**
 * Discriminated union of declaration items, including properties with individual source details.
 */
export type ApiDeclaration =
	| ApiClass
	| ApiInterface
	| ApiNamespace
	| ApiEnum
	| ApiEnumMember
	| ApiFunction
	| ApiMethod
	| ApiMethodSignature
	| ApiProperty
	| ApiPropertySignature
	| ApiConstructor
	| ApiCallSignature
	| ApiConstructSignature
	| ApiIndexSignature
	| ApiTypeAlias
	| ApiVariable;

/**
 * All inspection items. Checking kind narrows to the corresponding concrete interface.
 */
export type ApiItem = ApiPackage | ApiEntryPoint | ApiDeclaration;

/*
 * Exercises class and interface review output with independent member selection.
 * Inherited content changes documentation status without changing local release metadata.
 */

/** Contract for stored values. @public */
// The report must retain generic constraints and defaults while selecting members independently.
export interface Store<Value extends string = string> {
	/** The stored value. @public */
	// Keep readonly property syntax and the containing type's parameter name.
	readonly value: Value;
	/** Optional count. @beta */
	// Public-only reports must omit this property without affecting the containing interface.
	count?: number;
	/** Optional callback. @public */
	// This comment belongs to the property, not its unnamed function-type signature.
	callback?: (value: Value) => void;
	/** String lookup. @public */
	// Keep this overload and its compiler order when the internal overload is excluded.
	lookup(value: string): Value;
	/** Numeric lookup. @internal */
	// Excluding this overload must not remove the public overload with the same name.
	lookup(value: number): Value;
}

/** Source class. @internal */
// The unexported class supplies a documented member without becoming a report export.
declare class Base {
	/** Base operation. @public */
	// Member metadata stays public even though the containing class is internal.
	operation(value: string): string;
}

/** Public implementation. @public */
// Exercise instance members and independently documented constructor and static declarations.
export declare class Implementation extends Base {
	/** Construct an implementation. @public */
	// Printed constructor syntax must exclude this source documentation.
	constructor(label: string);
	/** Available by name. @public */
	// Static and readonly modifiers must survive detached report generation.
	static readonly nameOfImplementation: string;
	/** {@inheritDoc Base.operation} @public */
	// Effective inherited content makes this documented without copying the base class's release tag.
	operation(value: string): string;
	/** @public */
	// A release tag alone must still produce the undocumented annotation.
	label: string;
}

/**
 * Public alias. See {@link Store}, {@link Operations.visible}, {@link Implementation.operation}, and {@link Store.value}.
 *
 * @public
 */
// Resolve declaration, namespace, method, and property targets before rendering the alias.
export type ValueName = string;

/**
 * Shared settings.
 *
 * @public
 */
// Matching interface comments permit one documented API without selecting different descriptions.
export interface Settings {
	/**
	 * Public setting.
	 *
	 * @public
	 */
	// Members from both declaration parts must participate in the effective interface view.
	endpoint: string;
}

/**
 * Shared settings.
 *
 * @public
 */
// This part has the same header and comment, but contributes an independently filtered member.
export interface Settings {
	/**
	 * Internal setting.
	 *
	 * @internal
	 */
	// The public report must omit this member without discarding the merged interface.
	internalTimeout: number;
	/**
	 * Public setting.
	 *
	 * @public
	 */
	// Repeating the same property and comment must produce one effective member, not duplicate output.
	endpoint: string;
}

/** Public mode. @public */
// Enum members have independent release metadata and retain their explicit values.
export declare enum Mode {
	/** Visible mode. @public */
	// Keep the member value in the public report.
	Visible = 1,
	/** Hidden mode. @internal */
	// Filtering this member must not remove the enum itself.
	Hidden = 2,
}

/** Public constant. @public */
// Variable statement documentation must classify the exported constant.
export declare const version: "v1";

/** Hidden built-in shadow. @internal */
// An excluded built-in name must leave neither a declaration nor an alias export in the public report.
export declare const performance: number;

// The same class has both value and type-only export paths, which the report must distinguish.
export type { Implementation as TypeImplementation };

/** Grouped operations. @public */
// Nested exports must use the same selection rules as top-level exports.
export declare namespace Operations {
	// An alias back to this namespace must remain a reference rather than expanding forever.
	export import self = Operations;
	/** Visible operation. @public */
	// Keep a public nested declaration with its namespace export syntax.
	export function visible(): void;
	/** Hidden operation. @internal */
	// Exclude the nested API without discarding the selected namespace.
	export function hidden(): void;
}

/**
 * Internal recursive group.
 *
 * @internal
 */
// Filtering the namespace must also remove its recursive alias.
export declare namespace HiddenOperations {
	export import self = HiddenOperations;
}

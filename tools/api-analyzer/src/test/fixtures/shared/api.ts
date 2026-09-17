/*
 * Supplies shared compiler inputs for generic inheritance, effective members, and callable overloads.
 * Intersections and utility types exercise property selection, optionality, and readonly state.
 * Overload comments distinguish release levels; Identity exercises aliases and private class state.
 * Analysis tests also use this source for relocation and overload reordering.
 */

/** Generic member documentation. */
// Derived must observe Value as string without changing the original declaration or comment.
export interface Base<Value> {
	/** The stored value. */
	value: Value;
	// Utility-type views must preserve this optional flag.
	optional?: number;
}

/** Specialized interface documentation. */
export interface Derived extends Base<string> {
	// A local member distinguishes the complete inherited view from a view containing only base members.
	count: number;
}

export class GenericBase<Value> {
	// The parameter property becomes a substituted instance member in DerivedClass.
	public constructor(public value: Value) {}
}

export class DerivedClass extends GenericBase<string> {}

// Intersection expansion must include inherited, local, and newly intersected members.
export type Combined = Derived & { enabled: boolean };
// Pick preserves the selected members' types and optional flags.
export type Selected = Pick<Combined, "value" | "optional">;
// Omit removes count without losing inherited or intersected members.
export type Omitted = Omit<Combined, "count">;
// Readonly changes the effective modifiers even though the source properties are writable.
export type Frozen = Readonly<Pick<Combined, "value" | "optional">>;

/** Public overload documentation. @public */
export function convert(value: string): string;
/** Internal overload documentation. @internal */
export function convert(value: number): number;
// Keep the two overloads above with their comments: tests reorder the exact source block and check identity.
// The implementation signature must not appear as a third callable API overload.
export function convert(value: string | number): string | number {
	return value;
}

export class Identity {
	// This private member gives the class nominal identity that aliases and generated declarations must preserve.
	private readonly identity = "identity";
	// Referencing the private member keeps the fixture valid under unused-member checks.
	public getIdentity(): string {
		return this.identity;
	}
}

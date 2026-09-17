/*
 * Supplies shared compiler inputs for generic inheritance, effective members, and callable overloads.
 * Intersections and utility types exercise property selection, optionality, and readonly state.
 * Overload comments distinguish release levels; Identity exercises aliases and private class state.
 * Analysis tests also use this source for relocation and overload reordering.
 */

/** Generic member documentation. */
export interface Base<Value> {
	/** The stored value. */
	value: Value;
	optional?: number;
}

/** Specialized interface documentation. */
export interface Derived extends Base<string> {
	count: number;
}

export class GenericBase<Value> {
	public constructor(public value: Value) {}
}

export class DerivedClass extends GenericBase<string> {}

export type Combined = Derived & { enabled: boolean };
export type Selected = Pick<Combined, "value" | "optional">;
export type Omitted = Omit<Combined, "count">;
export type Frozen = Readonly<Pick<Combined, "value" | "optional">>;

/** Public overload documentation. @public */
export function convert(value: string): string;
/** Internal overload documentation. @internal */
export function convert(value: number): number;
export function convert(value: string | number): string | number {
	return value;
}

export class Identity {
	private readonly identity = "identity";
	public getIdentity(): string {
		return this.identity;
	}
}

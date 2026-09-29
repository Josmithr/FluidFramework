/* Ensures relocated overload references retain the dependency's private class identity. */

/** Nominal dependency result. @public */
export declare class Result {
	private state;
	readonly value: string;
}

/** @public */
export declare namespace NS { class Value { private brand; } }
export import NestedValue = NS.Value;

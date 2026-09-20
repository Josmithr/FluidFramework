/*
 * Compound symbols contribute type, value, callable, and namespace declarations to one API.
 * All parts share a release level and remain together when selected.
 */

/**
 * Type contract.
 * @public
 */
export interface Contract { value: string; }
/**
 * Runtime contract.
 * @public
 */
export declare const Contract: { create(): Contract };

/**
 * Callable factory.
 * @public
 */
export declare function Factory(value: string): string;
/**
 * Numeric factory.
 * @public
 */
export declare function Factory(value: number): number;
/**
 * Factory utilities.
 * @public
 */
export declare namespace Factory {
	/**
	 * Factory version.
	 */
	export const version: "v1";
}

/**
 * Instance implementation.
 * @public
 */
export declare class Widget {
	/**
	 * Instance label.
	 */
	label: string;
}
/**
 * Widget utilities.
 * @public
 */
export declare namespace Widget {
	/**
	 * Creates a widget.
	 */
	export function create(): Widget;
}

export type { Widget as WidgetType };

/**
 * Links to compound symbols and namespace members.
 * See {@link Contract}, {@link Factory.version}, {@link Widget.create}, and {@link (Factory:1)}.
 * @public
 */
export declare function links(): void;

/**
 * {@inheritDoc (Factory:1)}
 * @public
 */
export declare function copiedFactory(value: string): string;

/**
 * Shape type.
 * @public
 */
export interface Shape { size: number; }
/**
 * Shape values.
 * @public
 */
export declare namespace Shape {
	/**
	 * Default shape size.
	 */
	export const defaultSize: 1;
}

/**
 * Mode enum.
 * @public
 */
export declare enum Mode { First = 1, Second = 2 }
/**
 * Mode helpers.
 * @public
 */
export declare namespace Mode {
	/**
	 * Parses a mode.
	 */
	export function parse(text: string): Mode;
}

/**
 * Left base.
 * @public
 */
export interface Left { left: string; }
/**
 * Right base.
 * @public
 */
export interface Right { right: number; }
/**
 * First merged header.
 * @public
 */
export interface Extended<Value extends string> extends Left {
	(value: Value): Value;
}
/**
 * Second merged header.
 * @public
 */
export interface Extended<Value extends string = string> extends Right {
	(value: number): number;
}

/**
 * Class portion.
 * @public
 */
export declare class Augmented<Value extends string> { label: Value; }
/**
 * Interface portion.
 * @public
 */
export interface Augmented<Value extends string> {
	count: number;
	/**
	 * Calls the augmented instance.
	 * @param value - Input label.
	 * @returns The input label.
	 */
	(value: Value): Value;
}
/**
 * Defaulted construction contract.
 * @public
 */
export interface Augmented<Value extends string = string> {
	/**
	 * Constructs another instance through the augmented value.
	 * @param value - Initial count.
	 */
	new(value: number): Augmented<Value>;
}
export type { Augmented as AugmentedType };
/**
 * First enum part.
 * @public
 */
export declare enum Repeated { First = 1 }
/**
 * Second enum part.
 * @public
 */
export declare enum Repeated { Second = 2 }

/**
 * First recursive namespace.
 * @public
 */
export declare namespace CycleA {
	/**
	 * First operation.
	 */
	export function first(): void;
	export import next = CycleB;
}
/**
 * Second recursive namespace.
 * @public
 */
export declare namespace CycleB {
	/**
	 * Second operation.
	 */
	export function second(): void;
	export import back = CycleA;
}

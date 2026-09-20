/*
 * Resolves explicit member sides and numeric callable selectors without conflating identities.
 * All class members share the container release level; standalone overloads have separate levels.
 */

/**
 * Source members with distinct static and instance documentation.
 * @public
 */
export declare class ReferenceSource {
	/**
	 * Static operation documentation.
	 */
	static operation(value: string): string;
	/**
	 * Instance operation documentation.
	 */
	operation(value: string): string;
	/**
	 * An unambiguous static operation.
	 */
	static unique(value: string): string;
}

/**
 * Public overload documentation.
 * @public
 */
export declare function overloaded(value: string): string;
/**
 * Internal overload documentation.
 * @internal
 */
export declare function overloaded(value: number): number;

/**
 * Links to {@link ReferenceSource.(operation:static)}, {@link ReferenceSource.(operation:instance)},
 * {@link ReferenceSource.unique}, and {@link (overloaded:1)}.
 * @public
 */
// Member selectors retain separate targets even though both declarations have the same name.
export declare function links(): void;

/**
 * {@inheritDoc ReferenceSource.(operation:static)}
 * @public
 */
export declare function fromStatic(value: string): string;

/**
 * {@inheritDoc ReferenceSource.(operation:instance)}
 * @public
 */
export declare function fromInstance(value: string): string;

/**
 * Recursive exported operations.
 * @public
 */
export declare namespace Group {
	/**
	 * Operation retained through recursive aliases.
	 */
	export function run(): void;
	// Models must represent this as a finite alias rather than unrolling every possible path.
	export import self = Group;
}

/**
 * Selector contract.
 * @public
 */
export interface Contract { value: string; }
/**
 * Selector alias.
 * @public
 */
export type Text = string;
/**
 * Selector value.
 * @public
 */
export declare const version: "v1";
/**
 * Selector enumeration.
 * @public
 */
export declare enum Mode { First }
/**
 * See {@link (ReferenceSource:class)}, {@link (Contract:interface)}, {@link (Text:type)},
 * {@link (version:variable)}, {@link (Mode:enum)}, {@link (Group:namespace).(run:function)},
 * and {@link (fromStatic:function)}.
 * @public
 */
export declare function kindLinks(): void;

/**
 * Symbol key used for a computed API member.
 * @public
 */
export declare const token: unique symbol;

/**
 * All declaration-reference member forms. {@label SELECTED}
 * @public
 */
export declare class Selected {
	/**
	 * Creates a selected value. {@label CREATE}
	 */
	constructor();
	/**
	 * Text overload. {@label TEXT}
	 */
	read(value: string): string;
	/**
	 * Numeric overload. {@label NUMBER}
	 */
	read(value: number): number;
	/**
	 * Symbol method. {@label SYMBOL}
	 */
	[token](): string;
	/**
	 * Iteration method.
	 */
	[Symbol.iterator](): Iterator<string>;
	/**
	 * Quoted property.
	 */
	"first-name": string;
}

/**
 * Unnamed declarations selected through labels.
 * @public
 */
export interface Unnamed {
	/**
	 * String index. {@label STRING_INDEX}
	 */
	[key: string]: unknown;
	/**
	 * Call signature. {@label CALL}
	 */
	(value: string): string;
	/**
	 * Construct signature. {@label CONSTRUCT}
	 */
	new(value: number): Selected;
}

/**
 * See {@link (Selected:constructor)}, {@link Selected.(read:TEXT)},
 * {@link Selected.([token]:SYMBOL)}, {@link Selected."first-name"}, {@link (Selected:CREATE)},
 * {@link Selected.[Symbol.iterator]}, {@link Mode.First}, and {@link (Selected:SELECTED).(read:TEXT)}.
 * @public
 */
export declare function fullSyntaxLinks(): void;

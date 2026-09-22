/* Exercises members, instantiated inheritance, special signatures, and nominal classes. */
/**
 * Supplies a typed value.
 * @public
 */
export interface Box<TValue> {
    /** Stored value. */
    readonly value: TValue;
    /** Optional label. */
    label?: string;
    /** Returns the stored value. */
    get(): TValue;
}

/**
 * A text box with inherited generic members.
 * @public
 */
export interface TextBox extends Box<string> {}

/**
 * Callable and constructable value with indexed properties.
 * @public
 */
export interface Factory {
    /** Creates text when called. */
    (value: string): string;
    /** Creates a box when constructed. */
    new (value: string): Box<string>;
    /** Additional labels. */
    readonly [name: string]: unknown;
}

/**
 * Nominal implementation of a text box.
 * @public
 */
export class Store implements Box<string> {
    private current: string;
    /** Protected subclass state. */
    protected revision = 0;
    /** Creates a store. */
    constructor(value: string) { this.current = value; }
    /** Creates an empty store. */
    static create(): Store { return new Store(""); }
    /** Stored value. */
    get value(): string { return this.current; }
    set value(value: string) { this.current = value; }
    /** Returns the stored value. */
    get(): string { return this.current; }
}

/**
 * Abstract store contract.
 * @public
 */
export abstract class AbstractStore {
    /** Gets the current value. */
    abstract get(): string;
}

/**
 * Concrete implementation of the abstract base.
 * @public
 */
export class DerivedStore extends AbstractStore {
    /** Gets the current value. */
    get(): string { return "derived"; }
}

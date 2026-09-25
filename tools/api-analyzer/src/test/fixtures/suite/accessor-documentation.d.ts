/* Tests pair-level documentation without combining original comments or static and instance identities. */
/** Computed accessor key. @public */
export declare const key: unique symbol;
/** Accessor documentation cases. @public */
export declare class Accessors {
    /** Getter documentation. */
    get value(): string;
    set value(input: string);
    get fromSetter(): string;
    /** Setter documentation. */
    set fromSetter(input: string);
    /** First comment. */
    get both(): string;
    /** Second comment. */
    set both(input: string);
    /** */
    get blank(): string;
    set blank(input: string);
    /** @sealed */
    get tagOnly(): string;
    set tagOnly(input: string);
    get neither(): string;
    set neither(input: string);
    set setOnly(input: string);
    get getOnly(): string;
    static get value(): string;
    static set value(input: string);
    /** Computed property documentation. */
    get [key](): string;
    set [key](input: string);
    /** Setter precedes getter. */
    set reversed(input: string);
    get reversed(): string;
}
/** Inherited accessor documentation cases. @public */
export declare class Derived extends Accessors {}

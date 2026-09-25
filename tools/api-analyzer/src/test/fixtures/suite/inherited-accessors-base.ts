/* Exercises original accessibility and independent getter/setter documentation. */
/** Generic base API. @public */
export class Base<Value> {
    #token = 0;
    private hidden: Value;
    /** Subclass state. */
    protected state: Value;
    constructor(value: Value) { this.hidden = value; this.state = value; }
    /** Reads the value. */
    get value(): Value { void this.#token; return this.hidden; }
    // The getter documents this pair; keep the setter's own documentation absent.
    set value(input: Value) { this.hidden = input; }
    /** Read-only view. */
    get only(): Value { return this.hidden; }
    /** Write-only view. */
    set sink(input: Value) { this.hidden = input; }
    /** Protected read view. */
    protected get secret(): Value { return this.state; }
    /** Protected operation. */
    protected convert(input: Value): Value { return input; }
    /** Wider setter read view. */
    get flexible(): Value { return this.hidden; }
    /** Wider setter write view, retained through heritage when substitution is unavailable. */
    set flexible(input: Value | undefined) { if (input !== undefined) this.hidden = input; }
}
/** Concrete base with different accessor types. @public */
export class Concrete {
    // Only the setter documents this pair, independently of the different read/write types.
    get value(): number { return 0; }
    /** Accepts text or a number. */
    set value(input: string | number) { void input; }
}

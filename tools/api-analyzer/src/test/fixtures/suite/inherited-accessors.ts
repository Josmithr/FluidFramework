/* Exercises transitive generic inheritance and local visibility/accessor overrides. */
import { Base, Concrete } from "dependency";
/** Intermediate generic receiver. @public */
export class Middle<Value> extends Base<Value> {}
/** Concrete receiving API. @public */
export class Leaf extends Middle<string> {}
/** Local declarations replace inherited views. @public */
export class Override extends Base<string> {
    /** Public local operation. */
    public override convert(input: string): string { return input; }
    /** Local getter. */
    override get value(): string { return "local"; }
    /** Local setter. */
    override set value(input: string) { void input; }
}
/** Non-generic asymmetric accessor receiver. @public */
export class ConcreteLeaf extends Concrete {}

/** Removes readonly from the selected accessor. @public */
export type Mutable<TValue> = { -readonly [TKey in keyof TValue]: TValue[TKey] };
/** A mapped getter becomes a writable property. @public */
export interface MutableLeaf extends Mutable<Pick<Base<string>, "only">> {}
/** A mapped pair becomes a readonly property. @public */
export interface ReadonlyLeaf extends Readonly<Pick<Base<string>, "value">> {}
/** A mapped pair becomes an optional property. @public */
export interface PartialLeaf extends Partial<Pick<Base<string>, "value">> {}

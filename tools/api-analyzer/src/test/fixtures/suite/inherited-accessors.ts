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

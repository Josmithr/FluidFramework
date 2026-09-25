/* Checks original and rendered declarations for accessibility and accessor read/write behavior. */
import { Leaf, Override, ConcreteLeaf } from "./index.js";
const leaf = new Leaf("value");
const value: string = leaf.value;
leaf.value = "next";
leaf.sink = "next";
leaf.flexible = undefined;
const flexible: string = leaf.flexible;
// @ts-expect-error Getter-only accessors remain read-only.
leaf.only = "next";
// @ts-expect-error Protected state is not public API.
leaf.state;
// @ts-expect-error Protected accessors remain protected.
leaf.secret;
// @ts-expect-error Private members belong to the base class only.
leaf.hidden;
class Subclass extends Leaf {
    read(): string { return this.convert(this.state) + this.secret; }
}
const override = new Override("value");
override.convert("public override");
override.value = "next";
const concrete = new ConcreteLeaf();
concrete.value = "text";
concrete.value = 1;
const numeric: number = concrete.value;
void [value, flexible, numeric, Subclass];

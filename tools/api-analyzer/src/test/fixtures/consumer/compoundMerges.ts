/*
 * Verifies each declaration facet remains usable in originals and isolated compound reports.
 */
import { Contract, Factory, Widget, WidgetType, Shape, Mode, Augmented, Repeated, CycleA, CycleB } from "./compound-merges.js";
CycleA.next.back.next.second();
CycleB.back.next.back.first();
import type { Extended, AugmentedType } from "./compound-merges.js";
declare const extended: Extended;
const left: string = extended.left;
const right: number = extended.right;
const called: number = extended(1);
const contract: Contract = Contract.create();
const output: string = Factory(contract.value);
const version: "v1" = Factory.version;
const widget: Widget = Widget.create();
const typed: WidgetType = widget;
const numeric: number = Factory(1);
const label: string = widget.label;
const shape: Shape = { size: Shape.defaultSize };
const mode: Mode = Mode.parse(output);
const first: Mode = Mode.First;
const augmented = new Augmented();
const count: number = augmented.count;
const augmentedResult: string = augmented("label");
const constructed: Augmented = new augmented(1);
const typedAugmented: AugmentedType = constructed;
const repeated: Repeated = Repeated.Second;
void [version, label, shape, mode, first, typed, numeric, left, right, called, count, repeated, augmentedResult, typedAugmented];
// @ts-expect-error The instance call signature accepts only text.
augmented(1);
// @ts-expect-error The instance construct signature accepts only a number.
new augmented("label");
// @ts-expect-error The class instance cannot lose its declared label type.
widget.label = 0;
// @ts-expect-error Namespace merging must not widen the factory parameter.
Factory({});
// @ts-expect-error The compound namespace must not restore a type-only class alias's value.
WidgetType.create();

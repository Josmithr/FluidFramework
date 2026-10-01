/* Checks both namespace forms through original and generated package exports. */

import { Namespace } from "namespace-package";

const value: Namespace.Value = new Namespace.Value();
const shape: Namespace.Shape = { value: value.value };
const marker: "namespace" = Namespace.marker;
const nested: Namespace.Nested.Alias = new Namespace.Nested.Alias();
const nestedValue: string = nested.value;

// @ts-expect-error Private state rejects a structural substitute for the class.
const invalidValue: Namespace.Value = { value: "invalid" };
// @ts-expect-error An interface remains type-only.
Namespace.Shape;
// @ts-expect-error The nested export list does not publish the original name.
Namespace.Nested.Local;
// @ts-expect-error The original nested name is also unavailable as a type.
type HiddenNested = Namespace.Nested.Local;

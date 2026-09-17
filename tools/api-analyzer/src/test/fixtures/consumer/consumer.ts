/*
 * Validates printed declarations with both TypeScript consumer compilers.
 * Imports resolve to generated files copied beside this consumer in a temporary project.
 * Positive checks cover a class alias, inherited properties, and an overload call.
 * Negative checks require readonly assignment and value use of a type-only alias to remain errors.
 */

import { PublicIdentity, convert } from "./index.js";
import type { TypeIdentity, Frozen, Derived } from "./index.js";
// The value export must construct an instance assignable to the type-only alias of the same class.
const identity: TypeIdentity = new PublicIdentity();
// Printing must preserve the public method and its return type, not only the class name.
const text: string = identity.getIdentity();
// The inherited generic value property is string, and the local count property must also survive.
const derived: Derived = { value: text, count: 1 };
// Overload resolution must select the string return type needed by the readonly mapped view.
const frozen: Frozen = { value: convert(derived.value) };
// @ts-expect-error Readonly must survive declaration printing.
frozen.value = "changed";
// @ts-expect-error An exported type-only alias is not a value.
new TypeIdentity();

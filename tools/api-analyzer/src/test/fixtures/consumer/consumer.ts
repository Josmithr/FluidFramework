/*
 * Validates printed declarations with both TypeScript consumer compilers.
 * Imports resolve to generated files copied beside this consumer in a temporary project.
 * Positive checks cover a class alias, inherited properties, and an overload call.
 * Negative checks require readonly assignment and value use of a type-only alias to remain errors.
 */

import { PublicIdentity, convert } from "./index.js";
import type { TypeIdentity, Frozen, Derived } from "./index.js";
const identity: TypeIdentity = new PublicIdentity();
const text: string = identity.getIdentity();
const derived: Derived = { value: text, count: 1 };
const frozen: Frozen = { value: convert(derived.value) };
// @ts-expect-error Readonly must survive declaration printing.
frozen.value = "changed";
// @ts-expect-error An exported type-only alias is not a value.
new TypeIdentity();

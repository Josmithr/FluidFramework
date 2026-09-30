/* Checks that index-reexport.d.ts forwards the dependency identity without copying it. */
import { Published } from "alias-dependency";
import { Forwarded, roundTrip } from "alias-package";

// Assignments in both directions reject independently redeclared private classes.
const forwarded: Forwarded = new Published();
const original: Published = new Forwarded();
const result: Forwarded = roundTrip(original);
// @ts-expect-error Re-exporting the class must not remove its private identity.
const invalid: Forwarded = { value: "structural" };

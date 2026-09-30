/* Checks dependency identity through the original and generated alias-package exports. */
import { Published } from "alias-dependency";
import { roundTrip } from "alias-package";

// Both parameter and return types must use the dependency's original private identity.
const value: Published = roundTrip(new Published());
const text: string = value.value;
// @ts-expect-error A structural substitute must not acquire the private identity.
roundTrip({ value: "structural" });
// @ts-expect-error The dependency exposes only the alias, not the original declaration name.
import type { Original } from "alias-dependency";
// @ts-expect-error An imported dependency type must not become an extra package export.
import type { Published as Leaked } from "alias-package";

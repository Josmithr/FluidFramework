/* Checks the shared dependency identity through original, complete, and public package exports. */
import { Shared } from "import-dependency";
import { stable } from "import-selection";

const value: Shared = stable(new Shared());
const text: string = value.value;
// @ts-expect-error The retained shared import must preserve the class's private identity.
stable({ value: "structural" });

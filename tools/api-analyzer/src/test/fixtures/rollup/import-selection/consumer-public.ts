/* Checks that public output excludes the beta API and does not publish imported types. */
// @ts-expect-error The beta API must not remain in the public package exports.
import { preview } from "import-selection";
// @ts-expect-error A retained dependency import is not a package export.
import type { Shared } from "import-selection";

/* Checks that the beta API and its separate dependency remain usable in complete output. */
import { Shared } from "import-dependency";
import { preview } from "import-selection";

// The same consumer accepts either beta import while retaining the shared class identity.
declare const options: Parameters<typeof preview>[1];
const value: Shared = preview(new Shared(), options);
// @ts-expect-error Both beta option types require a beta property.
preview(new Shared(), {});

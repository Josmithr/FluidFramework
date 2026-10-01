/* Checks that public output excludes the package export while the global built-in remains available. */

import * as API from "builtin-shadow";

// @ts-expect-error The internal export is unavailable through a named import.
import { performance as excluded } from "builtin-shadow";
// @ts-expect-error An entrypoint alias must not expose the internal export.
API.performance;

const globalTime: number = performance.now();

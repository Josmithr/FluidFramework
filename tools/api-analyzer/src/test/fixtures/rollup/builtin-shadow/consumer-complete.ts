/* Checks that complete output retains the package export without substituting the global built-in. */

import { performance } from "builtin-shadow";

const internalMeasurement: number = performance;
// @ts-expect-error The package export is a number, not the standard performance API.
performance.now();

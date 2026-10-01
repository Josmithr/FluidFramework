/* Checks the public export and the global built-in against original and generated declarations. */

import { marker } from "builtin-shadow";

const publicMarker: "public" = marker;
const globalTime: number = globalThis.performance.now();

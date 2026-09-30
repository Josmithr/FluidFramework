/* Checks that index.d.ts does not expose the optional dependency re-export. */
// @ts-expect-error This package variant exports only the function.
import type { Forwarded } from "alias-package";

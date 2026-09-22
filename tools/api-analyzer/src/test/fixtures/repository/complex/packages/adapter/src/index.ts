/* Second diamond branch: the shared contract is a peer and is not re-exported. */
import type { Contract } from "@scenario/core";
/**
 * Adapter contract.
 * @public
 */
export interface Adapter extends Contract<string> {}

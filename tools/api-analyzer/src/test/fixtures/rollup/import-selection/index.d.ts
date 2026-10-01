/* Shares one dependency import across release levels and uses another only in beta output. */
import { Shared } from "import-dependency";
import type { BetaOnly } from "import-dependency/beta";

/**
 * Returns the supplied shared value.
 * @public
 */
export declare function stable(value: Shared): Shared;

/**
 * Returns a shared value using preview options.
 * @beta
 */
export declare function preview(value: Shared, options: BetaOnly): Shared;

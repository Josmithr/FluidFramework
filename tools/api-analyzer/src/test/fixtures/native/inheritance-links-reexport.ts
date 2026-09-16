/*
 * Inherits a linked comment through an imported alias and exports the receiver under an alias.
 * The local internal target must not replace the original beta target of inherited links.
 * Re-exporting the imported alias keeps it in emitted declarations for documentation lookup.
 */

import { middle as inherited } from "./inheritance-links.js";
export { inherited };
/** Local target. @internal */
export declare function target(): void;
/** {@inheritDoc inherited} @public */
declare function derived(): void;
export { derived as renamed };

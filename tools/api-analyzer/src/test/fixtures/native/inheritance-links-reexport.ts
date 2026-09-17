/*
 * Inherits a linked comment through an imported alias and exports the receiver under an alias.
 * The local internal target must not replace the original beta target of inherited links.
 * Re-exporting the imported alias keeps it in emitted declarations for documentation lookup.
 */

import { middle as inherited } from "./inheritance-links.js";
// Without this export, the compiler can omit the imported name referenced only by TSDoc.
export { inherited };
/** Local target. @internal */
// Resolving the inherited link here would incorrectly turn a valid public-to-beta link into an error.
export declare function target(): void;
/** {@inheritDoc inherited} @public */
// This third step follows the imported middle-to-base chain while keeping this receiver public.
declare function derived(): void;
// The exposed name must not replace the declaration identity used for inheritance resolution.
export { derived as renamed };

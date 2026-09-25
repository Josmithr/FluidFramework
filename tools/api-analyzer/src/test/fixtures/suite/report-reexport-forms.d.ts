/*
 * Preserves foreign aliases, namespaces, subpaths, and local forwarding without reading foreign tags.
 */

import { source as importedSource } from "dependency";
import type * as ImportedNamespace from "dependency";
export { importedSource as alias };
export type { ImportedNamespace as TypeNamespace };
export { source as default, target as "quoted-preview" } from "dependency";
export * as Namespace from "dependency";
export { target as subpathTarget } from "dependency/subpath.js";
export * from "./report-reexports.js";
export { source as localSource } from "./report-reexports.js";
export { source as starSource } from "./report-reexport-star.js";

/** @internal */
// Foreign bindings remain public even when the forwarding statement has a release tag.
export { target as annotated } from "dependency";

/** Local namespace wrapper. @public */
// A local namespace can contain opaque foreign bindings without adopting their release tags.
export * as Local from "./report-reexports.js";

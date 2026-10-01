/* Checks private identity in both directions through the named namespace re-export. */

import { Tools } from "namespace-dependency";
import { Namespace } from "namespace-package";

const original: Tools.Value = new Namespace.Value();
const forwarded: Namespace.Value = new Tools.Value();
const originalNested: Tools.Nested.Alias = new Namespace.Nested.Alias();
const forwardedNested: Namespace.Nested.Alias = new Tools.Nested.Alias();

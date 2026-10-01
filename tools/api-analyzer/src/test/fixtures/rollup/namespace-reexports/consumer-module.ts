/* Checks private identity in both directions through the module namespace re-export. */

import * as Dependency from "namespace-dependency";
import { Namespace } from "namespace-package";

const original: Dependency.Value = new Namespace.Value();
const forwarded: Namespace.Value = new Dependency.Value();
const originalNested: Dependency.Nested.Alias = new Namespace.Nested.Alias();
const forwardedNested: Namespace.Nested.Alias = new Dependency.Nested.Alias();

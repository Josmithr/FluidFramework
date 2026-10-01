/* Checks shared nominal identity through original, public, and tag-filtered package exports. */

import { Store as RootStore } from "tag-selection";
import { Store as SubpathStore } from "tag-selection/second";

const fromRoot: SubpathStore = new RootStore();
const fromSubpath: RootStore = new SubpathStore();
const rootText: string = fromRoot.read();
const subpathText: string = fromSubpath.read();

// @ts-expect-error The root export retains private state.
const invalidRoot: RootStore = { read: () => "invalid" };
// @ts-expect-error The subpath export retains the same private state.
const invalidSubpath: SubpathStore = { read: () => "invalid" };

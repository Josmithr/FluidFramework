/* Checks that requiring sealed excludes the untagged API from both package entrypoints. */

import * as Root from "tag-selection";
import * as Subpath from "tag-selection/second";

// @ts-expect-error The root entrypoint must not re-export the untagged function.
import { ordinary } from "tag-selection";
// @ts-expect-error The subpath must not re-export the untagged function.
import { ordinary as subpathOrdinary } from "tag-selection/second";
// @ts-expect-error A generated root alias must not expose the excluded function.
Root.ordinary;
// @ts-expect-error A generated subpath alias must not expose the excluded function.
Subpath.ordinary;

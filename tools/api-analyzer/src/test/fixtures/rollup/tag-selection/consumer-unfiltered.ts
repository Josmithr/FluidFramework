/* Checks that release selection alone retains the public API without the required modifier tag. */

import { ordinary } from "tag-selection";
import { ordinary as subpathOrdinary } from "tag-selection/second";

const rootText: string = ordinary("root");
const subpathText: string = subpathOrdinary("subpath");

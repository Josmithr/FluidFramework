import "./ambient-modules.js";
import { Tools, ToolsAgain, create, update } from "./ambient-entry.js";
import type { Settings } from "./ambient-entry.js";
const settings: Settings = Tools.create();
const count: number = settings.count;
const label: string = settings.label;
ToolsAgain.update(create());
update(settings);
void [count, label];
// @ts-expect-error The merged interface requires both contributions.
update({ label: "missing count" });

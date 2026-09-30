/* Augments local.d.ts with members that reference local and imported types. */
import "./local.js";
import type { Item as OtherItem } from "./other.js";
// This unexported type must remain available through the augmented method.
declare class Support { private brand; readonly support: true; }
declare module "./local.js" {
	interface Item<Value = string> { extra: number; related: OtherItem; store: Store; }
	interface Store {
		/**
		 * Returns supporting state.
		 * @privateRemarks
		 * Local augmentation secret.
		 */
		read(): Support;
	}
	namespace Nested { interface Shape { added: number; } }
}

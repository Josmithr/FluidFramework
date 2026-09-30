/* Tests imports without bindings and external module augmentations after relocation. */

import "effects";
import type { Input } from "foreign";

declare class Support { private brand; readonly value: string; }

declare module "foreign" {
	interface Input {
		readonly extra: number;
		/**
		 * Returns the local supporting type.
		 * @privateRemarks
		 * This detail must not be published.
		 */
		support(): Support;
	}
}

/** @public */
export interface Value {
	readonly global: RollupGlobal;
	readonly input: Input;
}

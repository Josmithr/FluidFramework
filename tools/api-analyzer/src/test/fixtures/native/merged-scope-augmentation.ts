/*
 * Augments the companion interface using identical TSDoc with a different lexical link target.
 */

// Load the original module so the declaration below augments its interface rather than defining a new module.
import "./merged-scope.js";

/**
 * Different destination.
 *
 * @internal
 */
// The augmentation resolves the same link spelling to this internal function instead.
export declare function localTarget(): void;

declare module "./merged-scope.js" {
	/** Shared description. See {@link localTarget}. @public */
	// Match the other scope's single-line TSDoc exactly; this test requires different targets for identical text.
	// Choosing either declaration by order would hide the other declaration's reference meaning.
	interface SharedSettings {
		/**
		 * Second setting.
		 *
		 * @public
		 */
		// Contribute a distinct member so the compiler must retain this declaration in the merged interface.
		second: string;
	}
}

// The entrypoint exposes the merged symbol, not two independently selectable interfaces.
export type { SharedSettings } from "./merged-scope.js";

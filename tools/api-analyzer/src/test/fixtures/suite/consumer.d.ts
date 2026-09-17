/*
 * Resolves dependency documentation through selected models, not consumer-scope names.
 */

// The native checker uses dependency declarations to prove instantiated member compatibility.
import type { Contract } from "dependency";

// Re-exporting with an alias must not relocate the dependency comment's unqualified references.
export { source as dependencyAlias } from "dependency";

/** {@inheritDoc dependency#source} @public */
// Tests replace this qualified reference to exercise missing, internal, peer, and transitive targets.
export declare function consumer(value: string): string;

/** Links across the suite. See {@link dependency#target}. @public */
// Public-to-beta links remain valid even when a public-only report excludes the target.
export declare function linked(value: string): string;

/** Public implementation. @public */
// The source contract is not re-exported; dependency types do not require consumer re-exports.
export declare class Implementation implements Contract<string> {
	// No local TSDoc permits automatic inheritance from the dependency's resolved model.
	operation(value: string): string;
}

/** Same-named consumer target must not replace the dependency target. @internal */
// Resolving inherited links in consumer scope would incorrectly select this internal API.
export declare function target(value: string): string;

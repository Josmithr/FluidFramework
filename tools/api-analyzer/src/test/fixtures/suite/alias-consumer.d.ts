/*
 * Dependency type aliases keep their exported spelling without forcing a consumer re-export.
 */

import type { AliasContract } from "dependency";

/**
 * Accepts a dependency contract through its exported alias.
 *
 * @public
 */
// Report syntax must preserve AliasContract even though the checker resolves the original Contract symbol.
export declare function accept(value: AliasContract<string>): void;

/**
 * Accepts a contract through a computed parameter type.
 *
 * @public
 */
// Reduction must remove the utility expression without replacing the dependency's exported alias.
export declare function computed(value: Parameters<(item: AliasContract<string>) => void>[0]): void;

// The test removes this exact export in the variant that does not re-export the dependency type.
export type { AliasContract } from "dependency";

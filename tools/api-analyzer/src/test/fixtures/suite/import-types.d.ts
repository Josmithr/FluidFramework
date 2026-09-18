/*
 * Type-only import expressions must participate in configured reference policies.
 */

export {};

/**
 * Uses a dependency preview type.
 *
 * @public
 */
// No named import exists for the checker to discover through an identifier reference alone.
export declare function usePreview(value: import("dependency").Preview): void;

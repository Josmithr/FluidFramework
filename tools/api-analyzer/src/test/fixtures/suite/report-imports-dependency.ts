// Supplies opaque external types and values for report import selection.
/**
 * Default input.
 * @public
 */
export default interface DefaultInput { defaultValue: string; }
/**
 * Named input.
 * @public
 */
export interface Input { value: string; }
/**
 * Preview input.
 * @public
 */
export interface Preview { preview: string; }
/**
 * Unused input.
 * @public
 */
export interface Unused { unused: string; }
/**
 * Computed member key.
 * @public
 */
export declare const token: unique symbol;
/**
 * Key referenced only by a computed property name.
 * @public
 */
export declare const key: unique symbol;

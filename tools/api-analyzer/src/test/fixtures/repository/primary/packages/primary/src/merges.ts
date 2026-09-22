/* Exercises supported compound declarations and nested namespace exports. */
/**
 * First merged shape.
 * @public
 */
export interface Merged { /** First property. */ first: string; }
/**
 * Second merged shape.
 * @public
 */
export interface Merged { /** Second property. */ second: number; }
/**
 * A callable class shape.
 * @public
 */
export class Callable { /** Stored value. */ value = ""; }
/**
 * Call signature augmenting the class.
 * @public
 */
export interface Callable { /** Calls the instance. */ (value: string): string; }
/**
 * Static namespace augmenting the class.
 * @public
 */
export namespace Callable { /** Static description. */ export const description = "callable"; }
/**
 * Function with namespace members.
 * @public
 */
export function parse(value: string): string { return value; }
/**
 * Function namespace.
 * @public
 */
export namespace parse { /** Parser version. */ export const version = 1; }
/**
 * Enum with namespace members.
 * @public
 */
export enum Status { Ready }
/**
 * Enum namespace.
 * @public
 */
export namespace Status { /** Default status. */ export const initial: Status = Status.Ready; }
/**
 * Nested namespace.
 * @public
 */
export namespace Space { /** Nested APIs. */ export namespace Nested { /** Nested value. */ export const value = 1; } }
/**
 * Repeated namespace contribution.
 * @public
 */
export namespace Space { /** Additional value. */ export const extra = 2; }
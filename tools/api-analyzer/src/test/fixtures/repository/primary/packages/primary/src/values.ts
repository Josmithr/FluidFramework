/* Exercises mutable values, enum variants, and unique-symbol member keys. */
/**
 * Current format version.
 * @public
 */
export const version = 1;
/**
 * Mutable counter.
 * @public
 */
export let count = 0;
/**
 * Unique API key.
 * @public
 */
export const key: unique symbol = Symbol("key");
/**
 * Symbol-keyed API.
 * @public
 */
export interface Keyed { /** Value associated with the key. */ readonly [key]: string; }
/**
 * Ordinary enum.
 * @public
 */
export enum Mode { Off, On }
/**
 * Compile-time enum.
 * @public
 */
export const enum Bits { None = 0, Read = 1 }
/*
 * Replaces the shared API source during session invalidation testing.
 * Derived.value changes from string to number; the invalidated session must agree with a fresh one.
 * Identity remains available to keep the existing export chain valid.
 */

export class Identity {}
export interface Derived {
	value: number;
}

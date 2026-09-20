/**
 * Freezes package-created data and its nested records and arrays.
 *
 * @remarks
 * Freezes objects in place; it does not copy them.
 * Traverses enumerable string-keyed values of objects that are not already frozen.
 * Already frozen objects are skipped, including their children.
 * Use only for acyclic data records and arrays constructed by this package.
 * This function does not make collections such as `Map` or `Set` immutable.
 *
 * @typeParam TValue - The input type, which is also the return type.
 * @param value - Data to freeze. Previously frozen objects must already have frozen children.
 * @returns The same value or object reference. Primitive values pass through unchanged.
 */
export function freezeData<TValue>(value: TValue): TValue {
	if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
		for (const child of Object.values(value)) {
			freezeData(child);
		}
		Object.freeze(value);
	}
	return value;
}

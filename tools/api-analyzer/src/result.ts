/**
 * A diagnostic for configuration, analysis, or resource management.
 *
 * @remarks
 * Can describe an operation failure or a limitation in otherwise successful analysis facts.
 */
export interface AnalyzerDiagnostic {
	/**
	 * The diagnostic category used for programmatic checks.
	 */
	readonly code: string;
	/**
	 * A human-readable description of the problem and, when available, a corrective action.
	 */
	readonly message: string;
}

/**
 * The successful value of an operation or its failure diagnostics.
 *
 * @remarks
 * Check `ok` before reading the value or diagnostics. Failure results contain no partial value.
 * This type alone does not guarantee that the value or result is frozen.
 *
 * @typeParam Value - The value produced when the operation succeeds.
 */
export type Result<Value> =
	| {
			/**
			 * Indicates that the operation succeeded.
			 */
			readonly ok: true;
			/**
			 * The successful operation's value.
			 */
			readonly value: Value;
	  }
	| {
			/**
			 * Indicates that the operation failed.
			 */
			readonly ok: false;
			/**
			 * Diagnostics that explain the operation's failure.
			 */
			readonly diagnostics: readonly AnalyzerDiagnostic[];
	  };

/**
 * Constructs a frozen failure result with one diagnostic.
 *
 * @param code - The diagnostic category used for programmatic checks.
 * @param message - A description of the failure and any corrective action.
 * @returns A failure result with a frozen diagnostic and diagnostic array.
 */
export function failure(code: string, message: string): Result<never> {
	return Object.freeze({
		ok: false,
		diagnostics: Object.freeze([Object.freeze({ code, message })]),
	});
}

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
 * @typeParam Value - The input type, which is also the return type.
 * @param value - Data to freeze. Previously frozen objects must already have frozen children.
 * @returns The same value or object reference. Primitive values pass through unchanged.
 */
export function freezeData<Value>(value: Value): Value {
	if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
		for (const child of Object.values(value)) {
			freezeData(child);
		}
		Object.freeze(value);
	}
	return value;
}

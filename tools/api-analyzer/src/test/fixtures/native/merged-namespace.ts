/*
 * Repeated namespace declarations share one export set but retain each part's documentation.
 * Nested declarations and recursive aliases must remain inside the selected namespace.
 */

/**
 * Primary services. See {@link Services.first}.
 * @public
 * @selected
 */
export declare namespace Services {
	/**
	 * First operation.
	 */
	export function first(): void;

	/**
	 * First nested description.
	 */
	export namespace Nested {
		/**
		 * Left operation.
		 */
		export function left(): void;
	}

	// Keep the recursive export finite in both report and dependency-model output.
	export import self = Services;
}

/**
 * Additional services. See {@link Services.second}.
 * @public
 */
export declare namespace Services {
	/**
	 * Second operation.
	 * @omit
	 */
	export function second(): void;

	/**
	 * Second nested description.
	 */
	export namespace Nested {
		/**
		 * Right operation.
		 */
		export function right(): void;
	}
}

// The alias must reuse the combined namespace, not render another partial declaration.
export { Services as RenamedServices };

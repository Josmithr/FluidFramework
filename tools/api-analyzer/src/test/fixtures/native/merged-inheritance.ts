/*
 * Exercises explicit documentation inheritance between merged interfaces and repeated properties.
 * Both declarations retain one target identity while contributing distinct original documentation.
 */

/**
 * First source description.
 * See {@link destination}.
 * @typeParam Value - Value documentation retained through the merged interface.
 * @public
 * @legacy
 */
export interface SourceSettings<Value> {
	/**
	 * First property description.
	 * @legacy
	 */
	value: string;
}

/**
 * Second source description.
 * @public
 */
export interface SourceSettings<Value> {
	/**
	 * Second property description.
	 */
	value: string;
}

/**
 * {@inheritDoc SourceSettings}
 * @public
 */
export interface ReceivingSettings<Value> {
	/**
	 * {@inheritDoc SourceSettings.value}
	 */
	value: string;
}

/**
 * @public
 */
export interface ReceivingSettings<Value> {
	/**
	 * {@inheritDoc SourceSettings.value}
	 */
	value: string;
}

/**
 * Destination whose original scope must survive interface inheritance.
 * @public
 */
export declare function destination(): void;

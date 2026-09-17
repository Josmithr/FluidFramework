/**
 * The custom tag vocabulary for classification and documentation resolution.
 *
 * @remarks
 * Pass the same options to classification, reference binding, and content resolution.
 * These options register modifier tags only. They do not load configuration files or disable syntax validation.
 */
export interface TsdocOptions {
	/**
	 * Custom modifier names, including `@`. Must not redefine standard tags or each other.
	 *
	 * @defaultValue No custom modifier tags.
	 */
	readonly customModifierTags?: readonly string[];
}

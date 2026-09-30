/* Defines a nominal dependency class whose original name is not exported. */
/**
 * A value shared across package boundaries.
 * @public
 */
declare class Original {
	private brand;
	readonly value: string;
}
export { Original as Published };

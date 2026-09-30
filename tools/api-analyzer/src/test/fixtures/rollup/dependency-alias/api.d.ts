/* Uses the dependency's published alias under a package-local import name. */
import { Published as LocalValue } from "alias-dependency";
/**
 * Returns the supplied dependency value.
 * @public
 */
export declare function roundTrip(value: LocalValue): LocalValue;

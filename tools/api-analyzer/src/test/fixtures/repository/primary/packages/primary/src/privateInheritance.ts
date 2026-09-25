/* Exercises inherited accessors and visibility without redeclaring base-private state. */
import { Store } from "./containers.js";
/**
 * Derived store with inherited private and protected state.
 * @public
 */
export class PrivateDerived extends Store {}

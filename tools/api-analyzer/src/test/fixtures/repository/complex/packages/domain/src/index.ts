/* First branch: generic inheritance and an intermediate documentation source. */
import type { Contract } from "@scenario/core";
export { source as domainAlias } from "@scenario/core";
/**
 * Domain text contract.
 * @public
 */
export interface Domain extends Contract<string> {}
/**
 * {@inheritDoc @scenario/core#source}
 * @public
 */
export function inherited(value: string): string { return value; }

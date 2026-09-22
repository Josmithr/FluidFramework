/* Joins both diamond branches and carries inherited documentation through a second package. */
import type { Domain } from "@scenario/domain";
import type { Adapter } from "@scenario/adapter";
export { domainAlias as serviceAlias } from "@scenario/domain";
/**
 * Combined service contract.
 * @public
 */
export interface Service extends Domain, Adapter {}
/**
 * {@inheritDoc @scenario/domain#inherited}
 * @public
 */
export function operation(value: string): string { return value; }

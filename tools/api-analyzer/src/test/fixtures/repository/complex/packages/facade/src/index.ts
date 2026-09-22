/* Final package re-exports the service while shadowing a link's original spelling. */
export { serviceAlias as facadeAlias, operation } from "@scenario/service";
export type { Service as Contract } from "@scenario/service";
/**
 * Local target must not capture the inherited core link.
 * @internal
 */
export function target(value: string): string { return value; }

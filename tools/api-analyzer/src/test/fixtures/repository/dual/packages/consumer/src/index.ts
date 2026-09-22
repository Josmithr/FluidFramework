/* Uses dependency APIs without exporting any dependency bindings. */
import type { Contract } from "@scenario/core";
/**
 * {@inheritDoc @scenario/core#source}
 * @public
 */
export function consumer(value: string): string { return value; }
/**
 * Local implementation of the generic contract. See {@link @scenario/core#source}.
 * @public
 */
export class Implementation implements Contract<string> {
    convert(value: string): string { return value; }
}

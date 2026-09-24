/* Supplies a uniform beta module with both type and value exports. */
/** Source function documentation. @beta */
export function foo(): string { return "value"; }
/** A source contract. @beta */
export interface Contract { value: string; }
/** A source class. @beta */
export class Box { value = "value"; }
/** A default API. @beta */
export default function create(): string { return "default"; }
/** Nested tools. @beta */
export namespace Nested {
    export const version = 1;
}

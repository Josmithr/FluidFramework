/* Defines the generic, nominal, and namespace targets for the augmentation fixtures. */
/** @public */
export interface Item<Value = string> { value: Value; }
/** @public */
// The private member must keep its identity across root and subpath exports.
export declare class Store { private brand; readonly value: string; }
/** @public */
export declare namespace Nested { interface Shape { base: string; } }
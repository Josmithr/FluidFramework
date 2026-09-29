/* Exports a nested type through a local import alias. */

/** @public */
export declare namespace Local { interface Item { value: string; } }
export import Item = Local.Item;

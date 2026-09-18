/*
 * Consumes member-side, overload, and recursive namespace references from a serialized dependency model.
 * Package-qualified references need no TypeScript import; the imported alias tests unqualified lookup.
 */
export {};

import { overloaded as localAlias } from "dependency";
// Retain the imported name in declaration input so unqualified lookup can resolve it in its original scope.
export { localAlias };

/**
 * Links to {@link dependency#ReferenceSource.(operation:static)},
 * {@link dependency#ReferenceSource.(operation:instance)}, {@link dependency#(overloaded:1)},
 * {@link dependency#Group.self.self.run}, and {@link (localAlias:1)}.
 * @public
 */
export declare function links(): void;

/**
 * {@inheritDoc dependency#ReferenceSource.(operation:static)}
 * @public
 */
export declare function fromStatic(value: string): string;

/**
 * {@inheritDoc dependency#Group.self.run}
 * @public
 */
export declare function fromAlias(): void;

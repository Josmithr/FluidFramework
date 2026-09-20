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

/**
 * See {@link dependency#(ReferenceSource:class).(operation:static)},
 * {@link dependency#(Contract:interface)}, {@link dependency#(Text:type)},
 * {@link dependency#(version:variable)}, {@link dependency#(Mode:enum)},
 * {@link dependency#(Group:namespace).self.(run:function)}, and {@link dependency#(fromStatic:function)}.
 * @public
 */
export declare function kindLinks(): void;

/**
 * {@inheritDoc dependency#(Contract:interface)}
 * @public
 */
export interface CopiedContract { value: string; }

/**
 * See {@link dependency#(Selected:constructor)}, {@link dependency#Selected.(read:TEXT)},
 * {@link dependency#Selected.([dependency#token]:SYMBOL)}, {@link dependency#Selected."first-name"},
 * {@link dependency#(Selected:CREATE)}, {@link dependency#Selected.[Symbol.iterator]}, {@link dependency#Mode.First},
 * and {@link dependency#(Selected:SELECTED).(read:TEXT)}.
 * @public
 */
export declare function fullSyntaxLinks(): void;

/**
 * {@inheritDoc dependency#Selected.(read:TEXT)}
 * @public
 */
export declare function fromLabel(value: string): string;

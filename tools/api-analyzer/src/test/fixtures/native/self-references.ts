/*
 * Resolves qualified documentation through configured exports rather than the comment's lexical scope.
 * reference-selectors.ts supplies a separate configured subpath and the re-exported class.
 */
export { ReferenceSource as SourceAlias } from "./reference-selectors.js";

/**
 * Private names must not replace qualified exported targets.
 * @internal
 */
declare function overloaded(value: string): string;

/**
 * Retains the private declaration in emitted input without exporting its name.
 * @internal
 */
export type KeepPrivate = typeof overloaded;

/**
 * Links to {@link example#SourceAlias.(operation:static)},
 * {@link example#SourceAlias.(operation:instance)},
 * {@link example/selectors#(overloaded:1)},
 * {@link example/selectors#Group.self.self.run}, and
 * {@link example/selectors#ReferenceSource.unique}.
 * @public
 */
export declare function qualifiedLinks(): void;

/**
 * {@inheritDoc example/selectors#(overloaded:1)}
 * @public
 */
export declare function qualifiedInheritance(value: string): string;

/**
 * {@inheritDoc example#SourceAlias.(operation:static)}
 * @public
 */
export declare function qualifiedStatic(value: string): string;

/*
 * Uses a self-qualified export alias whose documentation belongs to a selected dependency.
 * Qualified dependency subpaths must use model export records, not lexical names in this file.
 */
export { source as ExportedSource } from "dependency";

/**
 * Links to {@link consumer#ExportedSource} and {@link dependency/compat#source}.
 * @public
 */
export declare function links(): void;

/**
 * {@inheritDoc consumer#ExportedSource}
 * @public
 */
export declare function fromSelf(value: string): string;

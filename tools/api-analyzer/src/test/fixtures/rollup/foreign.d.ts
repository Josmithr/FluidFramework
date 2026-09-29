/* Provides external types and values without suite release metadata. */

export interface Input { readonly text: string; }
export interface PreviewOnly { readonly preview: number; }
export declare class ForeignClass { private state; value: string; }

declare const value: string;
export { value as "a-b" };

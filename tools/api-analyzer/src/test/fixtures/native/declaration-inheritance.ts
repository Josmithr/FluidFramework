/*
 * Same-kind explicit inheritance copies declaration prose without changing members or metadata.
 */
/**
 * Class description.
 * @typeParam Value - Class value.
 * @public
 */
export declare class SourceClass<Value> { value: Value; }
/**
 * {@inheritDoc SourceClass}
 * @public
 */
export declare class ReceiverClass<Value> { other: Value; }
/**
 * Alias description.
 * @typeParam Value - Alias value.
 * @public
 */
export type SourceAlias<Value> = Value | null;
/**
 * {@inheritDoc SourceAlias}
 * @public
 */
export type ReceiverAlias<Value> = readonly Value[];
/**
 * Constant description.
 * @public
 */
export declare const sourceConstant: string;
/**
 * {@inheritDoc sourceConstant}
 * @public
 */
export declare const receiverConstant: number;
/**
 * Enum description.
 * @public
 */
export declare enum SourceEnum { One = 1 }
/**
 * {@inheritDoc SourceEnum}
 * @public
 */
export declare enum ReceiverEnum { Two = 2 }
/**
 * Namespace description.
 * @public
 */
export declare namespace SourceNamespace { const first: string; }
/**
 * {@inheritDoc SourceNamespace}
 * @public
 */
export declare namespace ReceiverNamespace { const second: number; }

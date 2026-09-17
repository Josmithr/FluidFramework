/*
 * Shared Node/browser contract, changed only in the intentional parity-failure case.
 */

// Keep the module overview separate from the first tested documentation block.
export {};

/** Platform identity. @public */
// The parity test changes only the browser return literal; existing analysis results must stay unchanged.
export declare function platform(): "same";

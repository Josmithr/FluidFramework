/* Uses the installed producer declaration while suite analysis requires its generated model. */
import { read } from "analyzer-pilot";

/**
 * Reads text using the producer's parameter and return contracts.
 * @param value - Text forwarded to the producer.
 * @returns The producer's text result.
 * @public
 */
export declare function forward(value: Parameters<typeof read>[0]): ReturnType<typeof read>;

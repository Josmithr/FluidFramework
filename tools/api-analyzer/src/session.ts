import type { EffectiveConfiguration } from "./configuration.js";
import type { AnalysisFacts } from "./facts.js";
import { createNativeAdapter } from "./nativeAdapter.js";
import { DiagnosticCode, failure, type Result } from "./result.js";

/**
 * A synchronous owner of compiler resources and reusable facts.
 *
 * @remarks
 * Facts contain no compiler objects and remain usable after the session closes.
 * The caller must invalidate the session when analysis inputs change.
 */
export interface AnalysisSession {
	/**
	 * Analyzes a configuration or returns its cached facts.
	 *
	 * @remarks
	 * Calls block the calling thread. Cached requests do not contact the compiler.
	 * Entrypoint order and rule settings do not affect the cache key.
	 * Project validation failures are not cached and do not close the session.
	 * An unexpected adapter failure closes the session and clears its cache.
	 *
	 * @param configuration - Effective settings returned by configuration resolution.
	 * @returns Facts on success, or diagnostics on failure. Repeated requests for a cached
	 * configuration return the same facts object. Requests after close return `session-closed`.
	 * @throws The original unexpected adapter error after closing the session and clearing its cache.
	 * If cleanup also fails, throws an `AggregateError` containing both errors.
	 */
	analyze(configuration: EffectiveConfiguration): Result<AnalysisFacts>;
	/**
	 * Discards all cached facts and closes the current compiler connection.
	 *
	 * @remarks
	 * Call after relevant changes to source files, dependencies, project settings, or module resolution.
	 * The next analysis creates a new connection. Does nothing if the session is closed.
	 *
	 * @throws If the compiler connection cannot be closed.
	 */
	invalidate(): void;
	/**
	 * Returns the session's analysis and cache counters.
	 *
	 * @remarks
	 * Counters start at zero and are not reset by invalidation or close.
	 * They do not measure compiler-internal work.
	 *
	 * @returns A frozen copy of the current counters, including after close.
	 */
	getStatistics(): Readonly<{
		/**
		 * The number of adapter analysis calls, including calls that fail.
		 */
		analyses: number;
		/**
		 * The number of requests served from cached facts.
		 */
		cacheHits: number;
		/**
		 * The number of invalidation calls made while the session was open.
		 */
		generation: number;
	}>;
	/**
	 * Closes the session and releases its cached facts and compiler connection.
	 *
	 * @remarks
	 * Repeated calls have no effect. Previously returned facts remain usable.
	 * The session remains closed even if connection cleanup fails.
	 *
	 * @throws If the compiler connection cannot be closed.
	 */
	close(): void;
}

/**
 * Creates an experimental analysis session.
 *
 * @remarks
 * Starts no compiler process until an analysis requires a connection.
 * Owns a cache for this session only. Does not watch files or detect input changes automatically.
 * The caller must close the session when it is no longer needed.
 *
 * @returns An open session with an empty cache and zero counters.
 */
export function createAnalysisSession(): AnalysisSession {
	let adapter: ReturnType<typeof createNativeAdapter> | undefined;
	let closed = false;
	let analyses = 0;
	let cacheHits = 0;
	let generation = 0;
	const cache = new Map<string, AnalysisFacts>();
	/**
	 * Clears cached facts and releases the owned connection.
	 *
	 * @remarks
	 * Removes the connection reference before cleanup so it cannot be reused if cleanup throws.
	 * Does not change the session's closed state or counters.
	 *
	 * @throws If connection cleanup fails.
	 */
	function discard(): void {
		cache.clear();
		const owned = adapter;
		adapter = undefined;
		owned?.close();
	}
	return {
		analyze(configuration) {
			if (closed) {
				return failure(
					DiagnosticCode.SessionClosed,
					"The analysis session is closed. Create a new session.",
				);
			}
			// Only analysis inputs affect reuse. Rule settings do not change extracted facts.
			const key = JSON.stringify([
				configuration.packageName,
				configuration.packageRoot,
				configuration.project,
				[...configuration.entrypoints].sort((left, right) =>
					left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
				),
			]);
			const cached = cache.get(key);
			if (cached) {
				cacheHits++;
				return { ok: true, value: cached };
			}
			try {
				adapter ??= createNativeAdapter();
				analyses++;
				const result = adapter.analyze(configuration);
				if (result.ok) {
					cache.set(key, result.value);
				}
				return result;
			} catch (error) {
				// Do not reuse compiler state or cached facts after an unexpected adapter failure.
				closed = true;
				try {
					discard();
				} catch (cleanupError) {
					throw new AggregateError(
						[error, cleanupError],
						`Analysis and cleanup failed for ${configuration.project}. Create a new session.`,
						{ cause: error },
					);
				}
				throw error;
			}
		},
		invalidate() {
			if (!closed) {
				generation++;
				discard();
			}
		},
		getStatistics() {
			return Object.freeze({ analyses, cacheHits, generation });
		},
		close() {
			if (!closed) {
				closed = true;
				discard();
			}
		},
	};
}

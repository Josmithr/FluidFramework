/*
 * Validates original, reduced, and normalized signatures through real consumer compilation.
 * Narrowing and rejected calls must survive changes to declaration presentation.
 */

// Original declarations come from either supported input-build compiler.
import * as original from "./declarations/signature-views.js";
// Both generated modules use detached fact text, not a live compiler printer.
import * as normalized from "./signature-normalized.js";
import * as reduced from "./signature-reduced.js";

// Check assignability in both directions, including generic rest and predicate signatures.
const originalFromNormalized: typeof original = normalized;
const normalizedFromOriginal: typeof normalized = original;
const originalFromReduced: typeof original = reduced;
const reducedFromOriginal: typeof reduced = original;

normalized.receiver.call({ value: "context" }, "value");
// @ts-expect-error An explicit receiver must not disappear during printing.
normalized.receiver("value");
normalized.optional();
normalized.optional(null);
normalized.optional(undefined);
normalized.tuple("first");
normalized.tuple("first", 2);
// @ts-expect-error Tuple-rest expansion must preserve the second argument type.
normalized.tuple("first", "wrong");
const tuple: [string, number] = normalized.genericRest("value", 2);
const text: string = normalized.genericReturn({ value: "value" });

declare let candidate: unknown;
if (normalized.predicate(candidate)) {
	const narrowed: string = candidate.value;
}
normalized.assertion(candidate);
const asserted: string = candidate.value;

declare const token: original.Token;
normalized.branded(token);
// @ts-expect-error A brand must not disappear during reduction.
reduced.branded("plain text");
normalized.shadow({ value: "text" });
const mapped = normalized.mapped({ value: "text" });
// @ts-expect-error A compiler utility's readonly modifier must remain effective.
mapped.value = "changed";

// An assertion without a predicate type must still narrow the argument.
declare let maybe: string | undefined;
normalized.present(maybe);
const present: string = maybe;
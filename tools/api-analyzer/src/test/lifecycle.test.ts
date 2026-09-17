import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it } from "mocha";

async function runWorker(mode: string): Promise<string> {
	const directory = mkdtempSync(path.join(tmpdir(), "api-analyzer-lifecycle-"));
	cpSync(
		fileURLToPath(new URL("../../src/test/fixtures/shared/", import.meta.url)),
		path.join(directory, "src"),
		{ recursive: true },
	);
	writeFileSync(path.join(directory, "package.json"), JSON.stringify({ type: "module" }));
	writeFileSync(
		path.join(directory, "tsconfig.json"),
		JSON.stringify({
			compilerOptions: {
				target: "ES2022",
				module: "NodeNext",
				strict: true,
				types: [],
				noEmit: true,
			},
			include: ["src"],
		}),
	);
	const worker = spawn(
		process.execPath,
		[fileURLToPath(new URL("lifecycleWorker.js", import.meta.url)), mode, directory],
		{
			detached: true,
			stdio: ["ignore", "pipe", "pipe"],
		},
	);
	let output = "";
	worker.stdout.on("data", (chunk: Buffer) => {
		output += chunk.toString();
	});
	worker.stderr.on("data", (chunk: Buffer) => {
		output += chunk.toString();
	});
	const errors: unknown[] = [];
	try {
		await new Promise<void>((resolve, reject) => {
			const deadline = setTimeout(
				() => reject(new Error(`Lifecycle worker timed out: ${output}`)),
				10000,
			);
			worker.once("error", (error) => {
				clearTimeout(deadline);
				reject(error);
			});
			worker.once("close", (code, signal) => {
				clearTimeout(deadline);
				if (code === 0) {
					resolve();
				} else {
					reject(new Error(`Lifecycle worker failed (${code}, ${signal}): ${output}`));
				}
			});
		});
	} catch (error) {
		errors.push(error);
	} finally {
		if (worker.pid !== undefined) {
			try {
				process.kill(-worker.pid, "SIGKILL");
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
					errors.push(error);
				}
			}
		}
		try {
			rmSync(directory, { recursive: true, force: true });
		} catch (error) {
			errors.push(error);
		}
	}
	if (errors.length > 0) {
		throw new AggregateError(errors, "Lifecycle worker execution or cleanup failed.");
	}
	return output;
}

describe("Native TS7 lifecycle (Linux process checks)", () => {
	for (const mode of ["sync", "sync-crash", "async", "analysis", "analysis-failure"]) {
		// Design requirement: W6.
		it(`${mode} worker terminates without a retained child`, async function () {
			if (process.platform !== "linux") {
				this.skip();
			}
			const output = await runWorker(mode);
			assert.match(output, /client disposed/);
			if (mode.includes("crash")) {
				assert.match(output, /termination rejected the next request/);
			}
		});
	}

	// TODO (Stage 0 client lifecycle, W6): Re-enable when the native async client reliably rejects
	// pending requests after process termination. TS7 7.0.2 leaves the request unsettled.
	// Do not adopt that client before this failure is resolved or contained by an approved design.
	it.skip("crash worker terminates without a retained child", async function () {
		if (process.platform !== "linux") {
			this.skip();
		}
		const output = await runWorker("crash");
		assert.match(output, /client disposed/);
		assert.match(output, /termination rejected the next request/);
	});
});

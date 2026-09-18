import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { mock } from "node:test";

import { API as AsyncAPI } from "typescript/unstable/async";
import { API as SyncAPI } from "typescript/unstable/sync";
import { analyzeAPIs, ReleaseLevel } from "../index.js";

const mode = process.argv[2];
const directory = process.argv[3];
assert(directory !== undefined);
assert.notEqual(directory, "");

function getChildProcessIds(): readonly number[] {
	return readFileSync(`/proc/self/task/${process.pid}/children`, "utf8")
		.trim()
		.split(/\s+/)
		.filter(Boolean)
		.map(Number);
}

if (mode === "analysis" || mode === "analysis-failure") {
	const close = mock.method(SyncAPI.prototype, "close");
	const documentation =
		mode === "analysis" ? "/** @public */" : "/** {@inheritDoc missing} @public */";
	writeFileSync(
		path.join(directory, "src/public.d.ts"),
		`${documentation}\nexport declare function example(): void;\n`,
	);
	const result = await analyzeAPIs(
		{
			packageName: "example",
			project: "tsconfig.json",
			entrypoints: [{ name: ".", path: "src/public.d.ts" }],
		},
		directory,
	);
	assert.equal(result.ok, mode === "analysis");

	// The official close destroys streams and signals termination but does not await OS process reaping.
	assert.equal(close.mock.callCount(), 1);
	close.mock.restore();
	if (result.ok) {
		assert.equal(
			result.value.generateReport(".", {
				name: "public",
				releaseLevels: [ReleaseLevel.Public],
			}).ok,
			true,
		);
	}
	console.log("analysis client disposed before return");
} else if (mode === "sync" || mode === "sync-crash") {
	const before = getChildProcessIds();
	const api = new SyncAPI({ cwd: directory, collectTiming: true });
	try {
		const configFileName = path.join(directory, "tsconfig.json");
		const snapshot = api.updateSnapshot({ openProjects: [configFileName] });
		const project = snapshot.getProject(configFileName);
		assert(project !== undefined);
		const source = project.program.getSourceFile(path.join(directory, "src/api.ts"));
		assert(source !== undefined);
		const moduleSymbol = project.checker.getSymbolAtLocation(source);
		assert(moduleSymbol !== undefined);
		const exports = moduleSymbol.getExports();
		const derived = [...exports.values()].find((symbol) => symbol.name === "Derived");
		assert(derived !== undefined);
		const type = project.checker.getDeclaredTypeOfSymbol(derived);
		const value = project.checker.getPropertyOfType(type, "value");
		assert(value !== undefined);
		const valueType = project.checker.getTypeOfSymbol(value);
		assert(valueType !== undefined);
		assert.equal(project.checker.typeToString(valueType), "string");
		api.resetTimingInfo();
		assert.strictEqual(moduleSymbol.getExports(), exports);
		assert.equal(api.getTimingInfo().totals.requestCount, 0);
		snapshot.dispose();
		assert.equal(snapshot.isDisposed(), true);
		assert.throws(() => snapshot.getProjects());
		if (mode === "sync-crash") {
			const owned = getChildProcessIds().filter((pid) => !before.includes(pid));
			assert.equal(owned.length, 1);
			const nativePid = owned[0];
			assert(nativePid !== undefined);
			assert.equal(nativePid > 0, true);
			const command = readFileSync(`/proc/${nativePid}/cmdline`, "utf8").split("\0");
			assert.equal(path.basename(command[0] ?? ""), "tsc");
			assert(command.includes("--api"));
			process.kill(nativePid, "SIGKILL");
			assert.throws(() => api.getTimingInfo());
			console.log("native termination rejected the next request");
		}
	} finally {
		api.close();
	}
	console.log("sync client disposed");
} else {
	const before = getChildProcessIds();
	const api = new AsyncAPI({ cwd: directory, collectTiming: true });
	const errors: unknown[] = [];
	try {
		const snapshot = await api.updateSnapshot();
		const owned = getChildProcessIds().filter((pid) => !before.includes(pid));
		assert.equal(owned.length, 1, "One native compiler child must belong to this worker");
		const nativePid = owned[0];
		assert(nativePid !== undefined);
		assert.equal(nativePid > 0, true);
		const command = readFileSync(`/proc/${nativePid}/cmdline`, "utf8").split("\0");
		assert.equal(path.basename(command[0] ?? ""), "tsc");
		assert(command.includes("--api") && command.includes("--async"));
		if (mode === "crash") {
			process.kill(nativePid, "SIGKILL");
			await assert.rejects(api.getTimingInfo());
			console.log("native termination rejected the next request");
		} else {
			await snapshot.dispose();
			assert.equal(snapshot.isDisposed(), true);
			assert.throws(() => snapshot.getProjects());
		}
	} catch (error) {
		errors.push(error);
	} finally {
		try {
			await api.close();
		} catch (error) {
			if (mode === "crash") {
				console.log(`close after native termination: ${String(error)}`);
			} else {
				errors.push(error);
			}
		}
	}
	if (errors.length > 0) {
		throw new AggregateError(errors, "Async compiler probe or cleanup failed.");
	}
	console.log("async client disposed");
}

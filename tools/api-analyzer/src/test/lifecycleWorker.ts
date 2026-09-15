import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { API as AsyncAPI } from "typescript/unstable/async";
import { API as SyncAPI } from "typescript/unstable/sync";
import { resolveConfiguration } from "../configuration.js";
import { createAnalysisSession } from "../session.js";

const mode = process.argv[2];
const directory = process.argv[3];
assert.ok(directory);

function childPids(): readonly number[] {
	return readFileSync(`/proc/self/task/${process.pid}/children`, "utf8")
		.trim()
		.split(/\s+/)
		.filter(Boolean)
		.map(Number);
}

if (mode === "session" || mode === "session-crash") {
	const before = childPids();
	const session = createAnalysisSession();
	try {
		const configuration = resolveConfiguration(
			{
				packageName: "example",
				project: "tsconfig.json",
				entrypoints: [{ name: ".", path: "src/api.ts" }],
			},
			directory,
		);
		assert.ok(configuration.ok);
		assert.ok(session.analyze(configuration.value).ok);
		const owned = childPids().filter((pid) => !before.includes(pid));
		assert.equal(owned.length, 1);
		const nativePid = owned[0];
		assert.ok(nativePid);
		if (mode === "session-crash") {
			process.kill(nativePid, "SIGKILL");
			// Use an uncached configuration so the next request contacts the failed compiler process.
			const failed = session.analyze({
				...configuration.value,
				entrypoints: [{ name: "./different", path: path.join(directory, "src/api.ts") }],
			});
			assert.equal(failed.ok, false);
			if (!failed.ok) {
				assert.equal(failed.diagnostics[0]?.code, "analysis-failed");
			}
			assert.equal(session.analyze(configuration.value).ok, false);
			console.log("native termination rejected the next request");
		}
	} finally {
		session.close();
		session.close();
	}
	console.log("session client disposed");
} else if (mode === "sync" || mode === "sync-crash") {
	const before = childPids();
	const api = new SyncAPI({ cwd: directory, collectTiming: true });
	try {
		const configFileName = path.join(directory, "tsconfig.json");
		const snapshot = api.updateSnapshot({ openProjects: [configFileName] });
		const project = snapshot.getProject(configFileName);
		assert.ok(project);
		const source = project.program.getSourceFile(path.join(directory, "src/api.ts"));
		assert.ok(source);
		const moduleSymbol = project.checker.getSymbolAtLocation(source);
		assert.ok(moduleSymbol);
		const exports = moduleSymbol.getExports();
		const derived = [...exports.values()].find((symbol) => symbol.name === "Derived");
		assert.ok(derived);
		const type = project.checker.getDeclaredTypeOfSymbol(derived);
		const value = project.checker.getPropertyOfType(type, "value");
		assert.ok(value);
		const valueType = project.checker.getTypeOfSymbol(value);
		assert.ok(valueType);
		assert.equal(project.checker.typeToString(valueType), "string");
		api.resetTimingInfo();
		assert.strictEqual(moduleSymbol.getExports(), exports);
		assert.equal(api.getTimingInfo().totals.requestCount, 0);
		snapshot.dispose();
		assert.equal(snapshot.isDisposed(), true);
		assert.throws(() => snapshot.getProjects());
		if (mode === "sync-crash") {
			const owned = childPids().filter((pid) => !before.includes(pid));
			assert.equal(owned.length, 1);
			const nativePid = owned[0];
			assert.ok(nativePid);
			const command = readFileSync(`/proc/${nativePid}/cmdline`, "utf8").split("\0");
			assert.equal(path.basename(command[0] ?? ""), "tsc");
			assert.ok(command.includes("--api"));
			process.kill(nativePid, "SIGKILL");
			assert.throws(() => api.getTimingInfo());
			console.log("native termination rejected the next request");
		}
	} finally {
		api.close();
	}
	console.log("sync client disposed");
} else {
	const before = childPids();
	const api = new AsyncAPI({ cwd: directory, collectTiming: true });
	try {
		const snapshot = await api.updateSnapshot();
		const owned = childPids().filter((pid) => !before.includes(pid));
		assert.equal(owned.length, 1, "One native compiler child must belong to this worker");
		const nativePid = owned[0];
		assert.ok(nativePid);
		const command = readFileSync(`/proc/${nativePid}/cmdline`, "utf8").split("\0");
		assert.equal(path.basename(command[0] ?? ""), "tsc");
		assert.ok(command.includes("--api") && command.includes("--async"));
		if (mode === "crash") {
			process.kill(nativePid, "SIGKILL");
			await assert.rejects(api.getTimingInfo());
			console.log("native termination rejected the next request");
		} else {
			await snapshot.dispose();
			assert.equal(snapshot.isDisposed(), true);
			assert.throws(() => snapshot.getProjects());
		}
	} finally {
		try {
			await api.close();
		} catch (error) {
			if (mode !== "crash") throw error;
			console.log(`close after native termination: ${String(error)}`);
		}
	}
	console.log("async client disposed");
}

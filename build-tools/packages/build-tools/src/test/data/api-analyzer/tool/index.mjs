/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* Exercises package-local ESM loading and graph execution; compiler behavior is tested in api-analyzer. */
import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Minimal release-level exports used to exercise the loader's runtime contract checks.
 */
export const ReleaseLevel = {
	/**
	 * Public release-level value provided by the fixture analyzer.
	 */
	Public: 0,
	/**
	 * Beta release-level value provided by the fixture analyzer.
	 */
	Beta: 1,
	/**
	 * Alpha release-level value provided by the fixture analyzer.
	 */
	Alpha: 2,
	/**
	 * Internal release-level value provided by the fixture analyzer.
	 */
	Internal: 3,
};

/**
 * Records an analysis call and returns fixed generators for graph and output-policy tests.
 *
 * @param configuration - Configuration object with the package name string to place in the model.
 * @param directory - Absolute package directory string where the call log is appended.
 * @returns A successful analysis-shaped object; no compiler or semantic validation is performed.
 */
export async function analyzeAPIs(configuration, directory) {
	// A missing producer model must fail before the consumer records successful analysis.
	const manifest = JSON.parse(await readFile(path.join(directory, "package.json"), "utf8"));
	const selected = Object.keys(manifest.dependencies ?? {}).filter((name) =>
		configuration.suite?.packages.some((pattern) => path.posix.matchesGlob(name, pattern)),
	);
	for (const name of selected) {
		await readFile(path.join(directory, "node_modules", name, configuration.suite.modelFile));
	}
	await appendFile(path.join(directory, "calls.txt"), "analysis\n");
	return {
		ok: true,
		value: {
			configuration: {
				packageRoot: directory,
				project: path.join(directory, "tsconfig.json"),
				...(configuration.suite === undefined ? {} : { suite: configuration.suite }),
				entrypoints: [{ name: ".", path: path.join(directory, "lib/index.d.ts") }],
			},
			generateModel: () => JSON.stringify({ packageName: configuration.packageName }),
			generateRollups: () => ({ ok: true, value: { "index.d.ts": "export {};" } }),
			generateReport: () => ({ ok: true, value: "report" }),
		},
	};
}

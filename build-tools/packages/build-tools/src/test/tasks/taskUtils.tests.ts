/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert/strict";
import path from "node:path";

import { walkRequireGraph } from "../../fluidBuild/tasks/taskUtils.js";
import { testDataPath } from "../init.js";

const requireGraphFixtureRoot = path.resolve(testDataPath, "requireGraph");

describe("walkRequireGraph", () => {
	it("returns the entry plus every transitively-required file", () => {
		const entry = path.resolve(requireGraphFixtureRoot, "entry.cjs");
		const result = walkRequireGraph(entry).sort();
		const expected = [
			path.resolve(requireGraphFixtureRoot, "entry.cjs"),
			path.resolve(requireGraphFixtureRoot, "inner.cjs"),
			path.resolve(requireGraphFixtureRoot, "helper.cjs"),
		].sort();
		assert.deepEqual(result, expected);
	});

	it("applies the filter to children", () => {
		const entry = path.resolve(requireGraphFixtureRoot, "entry.cjs");
		// Exclude inner.cjs; helper.cjs is only reachable via inner.cjs so it should be dropped too.
		const result = walkRequireGraph(entry, {
			filter: (p) => !p.endsWith("inner.cjs"),
		}).sort();
		assert.deepEqual(result, [entry]);
	});

	it("returns just the entry if the module fails to load", () => {
		const entry = path.resolve(requireGraphFixtureRoot, "broken.cjs");
		const result = walkRequireGraph(entry);
		assert.deepEqual(result, [entry]);
	});

	it("returns an empty list if the entry itself fails the filter", () => {
		const entry = path.resolve(requireGraphFixtureRoot, "entry.cjs");
		const result = walkRequireGraph(entry, { filter: () => false });
		assert.deepEqual(result, []);
	});
});

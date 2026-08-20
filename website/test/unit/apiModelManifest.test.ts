/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";

import fs from "fs-extra";
import { afterEach, describe, expect, it, vi } from "vitest";

import { logApiModelManifest } from "../../infra/api-model-manifest.mjs";

const temporaryDirectories: string[] = [];

async function createTemporaryDirectory(): Promise<string> {
	const directory = await fs.mkdtemp(path.join(process.cwd(), "api-model-manifest-test-"));
	temporaryDirectories.push(directory);
	return directory;
}

afterEach(async () => {
	await Promise.all(
		temporaryDirectories.splice(0).map(async (directory) => fs.remove(directory)),
	);
});

describe("logApiModelManifest", () => {
	it("logs artifact provenance when a manifest is present", async () => {
		const directory = await createTemporaryDirectory();
		const manifest = {
			manifestVersion: 1,
			releaseGroup: "client",
			version: "2.116.1",
			modelCount: 42,
			publication: { sourceCommit: "0123456789abcdef" },
		};
		await fs.writeJSON(path.join(directory, "api-model-manifest.json"), manifest);
		const log = vi.fn();

		await logApiModelManifest(directory, "2", log);

		expect(log).toHaveBeenCalledTimes(2);
		expect(log).toHaveBeenNthCalledWith(1, expect.stringContaining("docs version 2"));
		expect(log).toHaveBeenNthCalledWith(2, JSON.stringify(manifest, undefined, 2));
	});

	it("reports legacy artifacts without a manifest", async () => {
		const directory = await createTemporaryDirectory();
		const log = vi.fn();

		await logApiModelManifest(directory, "1", log);

		expect(log).toHaveBeenCalledOnce();
		expect(log).toHaveBeenCalledWith(expect.stringContaining("does not include a manifest"));
	});
});

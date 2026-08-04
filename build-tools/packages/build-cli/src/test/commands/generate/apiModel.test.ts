/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import path from "node:path";
import type { ExtractorConfig } from "@microsoft/api-extractor";
import { describe, it } from "mocha";

import {
	type ApiModelDependencyMetadata,
	assertApiModelIsGeneratable,
	buildApiModelDependencyMetadata,
	getDependencyMetadataFilePath,
} from "../../../commands/generate/apiModel.js";

/**
 * Builds a minimal stand-in for a prepared {@link ExtractorConfig}, exposing only the `apiJsonFilePath`
 * property that {@link assertApiModelIsGeneratable} inspects.
 */
function fakeExtractorConfig(apiJsonFilePath: string): ExtractorConfig {
	return { apiJsonFilePath } as ExtractorConfig;
}

describe("generate:apiModel", () => {
	describe("buildApiModelDependencyMetadata", () => {
		it("includes only the name when there are no dependencies", () => {
			const metadata = buildApiModelDependencyMetadata({ name: "@scope/pkg" });
			assert.deepStrictEqual(metadata, { name: "@scope/pkg" } satisfies ApiModelDependencyMetadata);
		});

		it("includes dependencies and peerDependencies when present", () => {
			const metadata = buildApiModelDependencyMetadata({
				name: "@scope/pkg",
				dependencies: { "@scope/a": "workspace:~", "@scope/b": "1.2.3" },
				peerDependencies: { "@scope/c": "^2.0.0" },
			});
			assert.deepStrictEqual(metadata, {
				name: "@scope/pkg",
				dependencies: { "@scope/a": "workspace:~", "@scope/b": "1.2.3" },
				peerDependencies: { "@scope/c": "^2.0.0" },
			} satisfies ApiModelDependencyMetadata);
		});

		it("omits dependencies when only peerDependencies are present", () => {
			const metadata = buildApiModelDependencyMetadata({
				name: "@scope/pkg",
				peerDependencies: { "@scope/c": "^2.0.0" },
			});
			assert.deepStrictEqual(metadata, {
				name: "@scope/pkg",
				peerDependencies: { "@scope/c": "^2.0.0" },
			} satisfies ApiModelDependencyMetadata);
			assert.ok(!("dependencies" in metadata));
		});

		it("omits peerDependencies when only dependencies are present", () => {
			const metadata = buildApiModelDependencyMetadata({
				name: "@scope/pkg",
				dependencies: { "@scope/a": "workspace:~" },
			});
			assert.deepStrictEqual(metadata, {
				name: "@scope/pkg",
				dependencies: { "@scope/a": "workspace:~" },
			} satisfies ApiModelDependencyMetadata);
			assert.ok(!("peerDependencies" in metadata));
		});

		it("preserves empty dependency objects", () => {
			const metadata = buildApiModelDependencyMetadata({
				name: "@scope/pkg",
				dependencies: {},
			});
			assert.deepStrictEqual(metadata, {
				name: "@scope/pkg",
				dependencies: {},
			} satisfies ApiModelDependencyMetadata);
		});
	});

	describe("getDependencyMetadataFilePath", () => {
		it("mirrors the API model file name for a scoped package", () => {
			const apiJsonFilePath = path.join("some", "dir", "tree.api.json");
			assert.strictEqual(
				getDependencyMetadataFilePath(apiJsonFilePath, "@fluidframework/tree"),
				path.join("some", "dir", "tree.dependencies.json"),
			);
		});

		it("uses the unscoped name for an unscoped package", () => {
			const apiJsonFilePath = path.join("out", "benchmark.api.json");
			assert.strictEqual(
				getDependencyMetadataFilePath(apiJsonFilePath, "benchmark"),
				path.join("out", "benchmark.dependencies.json"),
			);
		});

		it("places the metadata file in the same directory as the API model", () => {
			const apiJsonFilePath = path.join("a", "b", "c", "id-compressor.api.json");
			const result = getDependencyMetadataFilePath(apiJsonFilePath, "@fluidframework/id-compressor");
			assert.strictEqual(path.dirname(result), path.dirname(apiJsonFilePath));
			assert.strictEqual(path.basename(result), "id-compressor.dependencies.json");
		});
	});

	describe("assertApiModelIsGeneratable", () => {
		it("throws when the package has no API Extractor configuration", () => {
			assert.throws(
				() =>
					assertApiModelIsGeneratable(
						"@scope/pkg",
						path.join("packages", "pkg"),
						undefined,
					),
				(error: Error) => {
					assert.match(error.message, /@scope\/pkg: No API Extractor configuration was found\./);
					// The error should point the user at where the configuration is expected.
					assert.ok(error.message.includes(path.join("packages", "pkg")));
					assert.match(error.message, /mark the package as private/);
					return true;
				},
			);
		});

		it("throws when the doc model output is disabled (empty apiJsonFilePath)", () => {
			assert.throws(
				() =>
					assertApiModelIsGeneratable(
						"@scope/pkg",
						path.join("packages", "pkg"),
						fakeExtractorConfig(""),
					),
				(error: Error) => {
					assert.match(
						error.message,
						/@scope\/pkg: API Extractor's doc model output is not enabled\./,
					);
					assert.match(error.message, /"docModel"/);
					assert.match(error.message, /mark the package as private/);
					return true;
				},
			);
		});

		it("does not throw when the doc model output is enabled", () => {
			assert.doesNotThrow(() =>
				assertApiModelIsGeneratable(
					"@scope/pkg",
					path.join("packages", "pkg"),
					fakeExtractorConfig(path.join("packages", "pkg", "_api-extractor-temp", "pkg.api.json")),
				),
			);
		});
	});
});

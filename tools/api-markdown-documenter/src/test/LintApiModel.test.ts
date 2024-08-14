/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as Path from "node:path";
import { fileURLToPath } from "node:url";

import { expect } from "chai";

import { lintApiModel } from "../LintApiModel.js";

const dirname = Path.dirname(fileURLToPath(import.meta.url));
const testModelsDirectoryPath = Path.resolve(dirname, "..", "..", "src", "test", "test-data");

describe("lintApiModel", () => {
	// TODO: add case with no errors

	it("API Model with invalid links yields the expected errors", async () => {
		const modelDirectoryPath = Path.resolve(testModelsDirectoryPath, "simple-suite-test");
		const result = await lintApiModel({ modelDirectoryPath });

		expect(result).to.not.be.undefined;
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		expect([...result!.malformedTagErrors]).to.deep.equal([]);
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		expect([...result!.referenceErrors]).to.deep.equal([
			{
				tagName: "@link",
				sourceItem: "", // link appears in package documentation
				packageName: "simple-suite-test",
				referenceTarget: "InvalidItem",
				linkText: undefined,
			},
			{
				tagName: "@link",
				sourceItem: "", // link appears in package documentation
				packageName: "simple-suite-test",
				referenceTarget: "InvalidItem",
				linkText:
					"even though I link to an invalid item, I would still like this text to be rendered",
			},
			{
				tagName: "@inheritDoc",
				sourceItem: "TestInterface.propertyWithBadInheritDocTarget",
				packageName: "simple-suite-test",
				referenceTarget: "BadInheritDocTarget",
				linkText: undefined,
			},
		]);
	});

	it("Invalid model directory throws", async () => {
		const modelDirectoryPath = Path.resolve(testModelsDirectoryPath, "non-existent-directory");

		try {
			await lintApiModel({ modelDirectoryPath });
		} catch (error: unknown) {
			expect(error).to.be.an.instanceOf(Error);
			expect((error as Error).message).to.match(/^Provided directory does not exist/);
			return;
		}
		expect.fail("Expected an error to be thrown, but none was.");
	});

	it("Empty model directory throws", async () => {
		const modelDirectoryPath = Path.resolve(testModelsDirectoryPath, "empty-model");

		try {
			await lintApiModel({ modelDirectoryPath });
		} catch (error: unknown) {
			expect(error).to.be.an.instanceOf(Error);
			expect((error as Error).message).to.match(
				/^No ".api.json" files found under provided directory path/,
			);
			return;
		}
		expect.fail("Expected an error to be thrown, but none was.");
	});
});

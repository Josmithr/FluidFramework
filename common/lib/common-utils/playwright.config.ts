/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "dist/test/playwright",
	forbidOnly: !!process.env.CI,
	retries: 0,
	outputDir: "nyc/test-results",
	reporter: [["list"], ["junit", { outputFile: "nyc/junit-report.xml" }]],
	use: {
		headless: true,
		launchOptions: {
			args: ["--no-sandbox", "--disable-setuid-sandbox"],
		},
	},
});

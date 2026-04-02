/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { HeadingOptions, TransformConfig, TransformOptions } from "../utilities.js";
import {
	formattedGeneratedContentBody,
	formattedSectionText,
	getPackageMetadata,
	parseHeadingOptions,
	resolveRelativePackageJsonPath,
} from "../utilities.js";

/**
 * Generates a `Getting Started` heading and contents for the specified example package.
 *
 * @param packageJsonPath - The path to the package's `package.json` file.
 * @param includeTinyliciousStep - Whether or not to include the `Tinylicious` step in the instructions.
 * @param headingOptions - Heading generation options.
 */
const generateExampleGettingStartedSection = (
	packageJsonPath: string,
	includeTinyliciousStep: boolean,
	headingOptions: HeadingOptions,
): string => {
	const packageJsonMetadata = getPackageMetadata(packageJsonPath);
	const packageName = packageJsonMetadata.name;

	const sectionBody: string[] = [];
	sectionBody.push("You can run this example using the following steps:\n");
	sectionBody.push(
		"1. Enable [corepack](https://nodejs.org/docs/latest-v16.x/api/corepack.html) by running `corepack enable`.",
	);
	sectionBody.push(`1. Run \`pnpm install\` and \`pnpm run build:fast --nolint\` from the \`FluidFramework\` root directory.
    - For an even faster build, you can add the package name to the build command, like this:
      \`pnpm run build:fast --nolint ${packageName}\``);

	if (includeTinyliciousStep) {
		sectionBody.push(
			`1. In a separate terminal, start a Tinylicious server by running \`pnpm tinylicious\` in this directory.`,
		);

		sectionBody.push(
			`1. If using codespaces in a browser, set tinylicious (port 7070) visibility to "public". "Private to Organization" will not work. See [sharing a port](https://docs.github.com/en/codespaces/developing-in-a-codespace/forwarding-ports-in-your-codespace#sharing-a-port) for how to do this.`,
		);
	}

	sectionBody.push(
		`1. Run \`pnpm start\` from this directory and open [http://localhost:8080](http://localhost:8080) in a web browser to see the app running.`,
	);

	sectionBody.push(
		`1. If you want to run the app against SharePoint, follow the instructions in [webpack-fluid-loader](https://github.com/microsoft/FluidFramework/blob/main/examples/utils/webpack-fluid-loader/README.md#sharepoint) to get auth credentials. Then run \`pnpm start:spo\` or \`pnpm start:spo-df\` and open [http://localhost:8080](http://localhost:8080) like above.`,
	);

	return formattedSectionText(sectionBody.join("\n"), {
		...headingOptions,
		headingText: "Getting Started",
	});
};

/**
 * Generates a "Getting Started" section for an example app README.
 *
 * @param content - The original document file contents.
 * @param options - Transform options.
 * `options.usesTinylicious` (`"TRUE"|"FALSE"`, default `"TRUE"`),
 * `options.includeHeading` (`"TRUE"|"FALSE"`, default `"TRUE"`),
 * `options.headingLevel` (positive integer string, default `"2"`).
 * @param config - Transform configuration.
 */
function exampleGettingStartedTransform(
	content: string,
	options: TransformOptions,
	config: TransformConfig,
): string {
	const usesTinylicious = options.usesTinylicious !== "FALSE";
	const headingOptions = parseHeadingOptions(options);

	const packageJsonPath = resolveRelativePackageJsonPath(
		config.originalPath,
		options.packageJsonPath,
	);
	return formattedGeneratedContentBody(
		generateExampleGettingStartedSection(packageJsonPath, usesTinylicious, headingOptions),
		config,
	);
}

export { generateExampleGettingStartedSection, exampleGettingStartedTransform };

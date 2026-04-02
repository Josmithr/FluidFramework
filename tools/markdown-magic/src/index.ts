/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import chalk from "chalk";
import path from "node:path";
import process from "node:process";
import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";

import config from "./md-magic.config.js";
import { processFiles } from "./processor.js";

const defaultMatchPattern = "**/*.{md,mdx}";

const argv = await yargs(hideBin(process.argv))
	.usage("Usage: $0 [options]")
	.option("f", {
		alias: "files",
		type: "array",
		description: `Glob pattern(s) indicating the files to process. Default: "${defaultMatchPattern}".`,
	})
	.option("w", {
		alias: "workingDirectory",
		type: "string",
		description:
			"The working directory in which to run the script. Default: the current Node.js working directory.",
	})
	.example(
		"$0 -f docs/**/*.md !docs/README.md",
		"Run on all Markdown files under 'docs', except 'README.md'.",
	)
	.help("h")
	.alias("h", "--help").argv;

const matchPattern = argv.f ?? defaultMatchPattern;

let workingDirectory = process.cwd();
if (argv.w) {
	workingDirectory = path.resolve(argv.w);
	process.chdir(workingDirectory);
}

console.log(
	`Searching for files matching pattern(s) "${matchPattern}" under "${workingDirectory}"...`,
);

try {
	await processFiles(matchPattern as string | string[], config);
	console.log(chalk.green("SUCCESS: Documentation updated!"));
	process.exit(0);
} catch (error) {
	console.error(
		chalk.red("FAILURE: Markdown Magic could not be completed due to an error: "),
		error,
	);
	process.exit(1);
}

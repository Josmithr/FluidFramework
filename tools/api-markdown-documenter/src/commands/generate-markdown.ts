/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import Path from "node:path";

import type { ApiModel } from "@microsoft/api-extractor-model";
import { Args, Command, Flags } from "@oclif/core";
import Chalk from "chalk";

import { loadModel } from "../LoadModel.js";
import { adaptLogger } from "./utilities/index.js";
import { renderApiModelAsMarkdown } from "../RenderMarkdown.js";

// TODO: notes about imperative extensibility
const commandDescription = `Generates a Markdown documentation suite for the specified API model.`;

/**
 * `oclif` command for linting an API model.
 *
 * @see {@link lintApiModel}
 */
// eslint-disable-next-line import/no-default-export
export default class GenerateMarkdownCommand extends Command {
	public static override args = {
		apiModelDirectory: Args.string({
			description:
				"Path to the directory containing the series of `.api.json` files that comprise the API Model.",
			required: true,
		}),
	};

	public static override description = commandDescription;

	public static override examples = ["<%= config.bin %> <%= command.id %>"];

	public static override flags = {
		quiet: Flags.boolean({
			char: "q",
			description: "Whether or not to silence logging.",
			required: false,
			default: false,
			exclusive: ["verbose"],
		}),
		verbose: Flags.boolean({
			char: "v",
			description: "Whether or not to perform verbose logging.",
			required: false,
			default: false,
			exclusive: ["quiet"],
		}),
		workingDirectory: Flags.string({
			char: "w",
			description: "The working directory to run the command in.",
			required: false,
			default: process.cwd(),
		}),

		// TODO: JS file config
	};

	public async run(): Promise<void> {
		const { args, flags } = await this.parse(GenerateMarkdownCommand);
		const { apiModelDirectory } = args;
		const { verbose, workingDirectory, quiet } = flags;

		const loggerVerbosity = quiet ? "quiet" : verbose ? "verbose" : "normal";
		const logger = adaptLogger(this, loggerVerbosity);

		const resolvedApiModelDirectoryPath = Path.resolve(workingDirectory, apiModelDirectory);

		// Load the API model
		let apiModel: ApiModel;
		try {
			apiModel = await loadModel({
				modelDirectoryPath: resolvedApiModelDirectoryPath,
				logger,
			});
		} catch (error: unknown) {
			this.error(`Error loading API model: ${(error as Error).message}`, { exit: 1 });
		}

		// Generate Markdown

		try {
			await renderApiModelAsMarkdown({apiModel}, {}, {});
		} catch (error: unknown) {
			this.error(Chalk.red(`Error rendering API model as Markdown: ${(error as Error).message}`), { exit: 1 });
		}
		this.log(Chalk.green("Markdown API documentation generated successfully!"));
	}
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Command } from "@oclif/core";
import Chalk from "chalk";

import { type Logger, silentLogger } from "../../Logging.js";

/**
 * Adapts a {@link Logger} to an `oclif` command.
 */
export function adaptLogger(command: Command, verbosity: "quiet" | "normal" | "verbose"): Logger {
	let logger: Logger = {
		...silentLogger,
	};
	if (verbosity !== "quiet") {
		logger = {
			...logger,
			info: (message, ...parameters) =>
				command.log(Chalk.blue(getMessage(message)), ...parameters),
			error: (message) => command.error(message),
			warning: (message) => command.warn(message),
			success: (message, ...parameters) =>
				command.log(Chalk.green(getMessage(message)), ...parameters),
		};
	}
	if (verbosity === "verbose") {
		logger = {
			...logger,
			verbose: (message, ...parameters) =>
				command.log(Chalk.gray(getMessage(message)), ...parameters),
		};
	}
	return logger;
}

function getMessage(messageOrError: string | Error): string | undefined {
	if (messageOrError instanceof Error) {
		return messageOrError.message;
	}
	return messageOrError;
}

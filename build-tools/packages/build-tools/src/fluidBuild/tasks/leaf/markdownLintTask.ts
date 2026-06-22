/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import * as path from "node:path";
import globby from "globby";

import type { BuildContext } from "../../buildContext.js";
import type { BuildPackage } from "../../buildGraph.js";
import {
	getInstalledPackageVersion,
	getMarkdownLintConfigFilePaths,
	getRecursiveFiles,
} from "../taskUtils.js";
import { LeafWithDoneFileTask } from "./leafTask.js";

const MARKDOWN_EXTENSIONS = new Set([".md"]);

/**
 * Parsed representation of a `markdownlint-cli2` command line.
 *
 * @remarks
 * Exported for unit tests; `MarkdownLintTask` is the production consumer.
 */
export interface ParsedMarkdownLintCommand {
	/** Positional entries that should be linted (files, directories, or globs). */
	positiveEntries: string[];
	/** Negative globs from `#prefix` or `!prefix` positional args. */
	negativeEntries: string[];
	/** Explicit config file from `--config`/`-c`. */
	explicitConfigPath?: string;
	/** True if `--no-globs` was passed. */
	noGlobs: boolean;
}

/**
 * Parse a `markdownlint-cli2` command line.
 *
 * Returns `undefined` if the command cannot be confidently understood (unknown flag, missing
 * argument to a known flag, or no positional entries).
 */
export function parseMarkdownLintCommand(
	command: string,
): ParsedMarkdownLintCommand | undefined {
	const tokens = tokenize(command);
	if (tokens.length === 0 || tokens[0] !== "markdownlint-cli2") {
		return undefined;
	}

	const parsed: ParsedMarkdownLintCommand = {
		positiveEntries: [],
		negativeEntries: [],
		noGlobs: false,
	};

	for (let i = 1; i < tokens.length; i++) {
		const token = tokens[i];
		if (token.startsWith("-")) {
			if (token === "--config" || token === "-c") {
				if (i + 1 >= tokens.length) return undefined;
				parsed.explicitConfigPath = stripQuotes(tokens[++i]);
				continue;
			}
			if (token === "--fix") {
				// Mutates inputs in place; covered by the post-run hash recomputation.
				continue;
			}
			if (token === "--no-globs") {
				parsed.noGlobs = true;
				continue;
			}
			// Unrecognized flag.
			return undefined;
		}
		const stripped = stripQuotes(token);
		if (stripped.startsWith("#") || stripped.startsWith("!")) {
			parsed.negativeEntries.push(stripped.slice(1));
		} else {
			parsed.positiveEntries.push(stripped);
		}
	}

	if (parsed.positiveEntries.length === 0) {
		return undefined;
	}
	return parsed;
}

/**
 * Tracks `markdownlint-cli2` invocations for `fluid-build`.
 *
 * The fingerprint is `{ version, configs, hashes }`:
 *  - `version`: installed `markdownlint-cli2` package version, so tool bumps invalidate.
 *  - `configs`: every markdownlint config file from the package directory up to the repo root.
 *  - `hashes`: every input file the cli would scan, hashed via the shared file-hash cache.
 *
 * In-config `ignores` / `gitignore` settings are not honored in v1 — only CLI `#`/`!` negations
 * are. See `build-tools/plans/markdownlint-task.md` for the design and rollout plan.
 */
export class MarkdownLintTask extends LeafWithDoneFileTask {
	private readonly parsed: ParsedMarkdownLintCommand | undefined;

	constructor(
		node: BuildPackage,
		command: string,
		context: BuildContext,
		taskName: string | undefined,
	) {
		super(node, command, context, taskName);
		this.parsed = parseMarkdownLintCommand(command);
	}

	protected async getDoneFileContent(): Promise<string | undefined> {
		const parsed = this.parsed;
		if (parsed === undefined) {
			this.traceError("error generating done file content: unable to parse command line");
			return undefined;
		}
		try {
			const version = await getInstalledPackageVersion(
				"markdownlint-cli2",
				this.node.pkg.directory,
			);

			const cwd = this.node.pkg.directory;
			const repoRoot = this.node.context.repoRoot;
			const configPaths =
				parsed.explicitConfigPath !== undefined
					? [this.getPackageFileFullPath(parsed.explicitConfigPath)]
					: getMarkdownLintConfigFilePaths(cwd, repoRoot);

			const configs = await Promise.all(
				configPaths
					.filter((p) => existsSync(p))
					.map(async (p) => ({
						path: path.relative(cwd, p),
						hash: await this.node.context.fileHashCache.getFileHash(p),
					})),
			);

			const files = await this.enumerateInputFiles(parsed);
			const hashes = (
				await Promise.all(
					files.map(async (name) => ({
						name,
						hash: await this.node.context.fileHashCache.getFileHash(
							this.getPackageFileFullPath(name),
						),
					})),
				)
			).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

			return JSON.stringify({ version, configs, hashes });
		} catch (e) {
			this.traceError(`error generating done file content. ${e}`);
			return undefined;
		}
	}

	private async enumerateInputFiles(parsed: ParsedMarkdownLintCommand): Promise<string[]> {
		const cwd = this.node.pkg.directory;
		const collected = new Set<string>();

		for (const entry of parsed.positiveEntries) {
			const fullPath = path.resolve(cwd, entry);
			if (existsSync(fullPath)) {
				const s = await stat(fullPath);
				if (s.isDirectory()) {
					const recursive = await getRecursiveFiles(fullPath);
					for (const f of recursive) {
						if (MARKDOWN_EXTENSIONS.has(path.extname(f).toLowerCase())) {
							collected.add(path.relative(cwd, f));
						}
					}
				} else {
					collected.add(path.relative(cwd, fullPath));
				}
				continue;
			}
			// Treat as a glob.
			const matches = await globby([entry], {
				cwd,
				ignore: [...parsed.negativeEntries],
				absolute: false,
			});
			for (const m of matches) {
				if (MARKDOWN_EXTENSIONS.has(path.extname(m).toLowerCase())) {
					collected.add(m);
				}
			}
		}

		return Array.from(collected);
	}
}

/** Lex a command line into whitespace-separated tokens, respecting `"..."` and `'...'`. */
function tokenize(command: string): string[] {
	const result: string[] = [];
	let current = "";
	let quote: '"' | "'" | undefined;
	for (const ch of command) {
		if (quote !== undefined) {
			current += ch;
			if (ch === quote) {
				quote = undefined;
			}
		} else if (ch === '"' || ch === "'") {
			quote = ch;
			current += ch;
		} else if (/\s/.test(ch)) {
			if (current.length > 0) {
				result.push(current);
				current = "";
			}
		} else {
			current += ch;
		}
	}
	if (current.length > 0) {
		result.push(current);
	}
	return result;
}

function stripQuotes(s: string): string {
	if (
		s.length >= 2 &&
		((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))
	) {
		return s.slice(1, -1);
	}
	return s;
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { existsSync, readFileSync } from "node:fs";
import { stat } from "node:fs/promises";
import { createRequire } from "node:module";
import * as path from "node:path";
import globby from "globby";
import * as JSON5 from "json5";
import { parse as parseYamlString } from "yaml";

import type { BuildContext } from "../../buildContext.js";
import type { BuildPackage } from "../../buildGraph.js";
import {
	getInstalledPackageVersion,
	getRecursiveFiles,
	walkRequireGraph,
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
 *  - `configs`: the cli2 options file at `cwd` (or `--config`) and the sibling main config,
 *    plus every file they transitively pull in via `require()` / `import()` or `extends`.
 *    See {@link resolveMarkdownLintCli2ConfigChain} for the resolution rules.
 *  - `hashes`: every input file the cli would scan, hashed via the shared file-hash cache.
 *
 * In-config `ignores` / `gitignore` settings are not honored in v1 — only CLI `#`/`!` negations
 * are.
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
			const configPaths = await resolveMarkdownLintCli2ConfigChain(
				cwd,
				repoRoot,
				parsed.explicitConfigPath,
			);

			const configs = (
				await Promise.all(
					configPaths.map(async (p) => ({
						path: path.relative(cwd, p),
						hash: await this.node.context.fileHashCache.getFileHash(p),
					})),
				)
			).sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

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

/**
 * `markdownlint-cli2` options files, in the priority order cli2 itself uses.
 * Only the first match in a given directory is honored.
 */
const MARKDOWNLINT_CLI2_OPTIONS_FILE_NAMES = [
	".markdownlint-cli2.jsonc",
	".markdownlint-cli2.yaml",
	".markdownlint-cli2.cjs",
	".markdownlint-cli2.mjs",
];

/**
 * Sibling "main" markdownlint config files cli2 also reads, in priority order.
 */
const MARKDOWNLINT_MAIN_CONFIG_FILE_NAMES = [
	".markdownlint.jsonc",
	".markdownlint.json",
	".markdownlint.yaml",
	".markdownlint.yml",
	".markdownlint.cjs",
	".markdownlint.mjs",
];

/**
 * Resolves the full set of `markdownlint-cli2` configuration files that influence an invocation
 * run from `cwd`, by following the configs' own inheritance chain.
 *
 * Unlike most tools, `markdownlint-cli2` does *not* walk up parent directories looking for a
 * config: it loads the first matching options file at the working directory (or whatever
 * `--config` points to), plus an optional sibling "main" config, and then cascades downward into
 * subdirectories of the linted tree. The inheritance between configs is expressed inside the
 * config files themselves:
 *
 *  - `.cjs` / `.mjs` configs can pull in other files via `require()` / `import()`.
 *  - `.jsonc` / `.json` / `.yaml` / `.yml` configs use an `extends` field (string or array)
 *    and, for cli2 options files, a `config` field that can point to another file.
 *
 * This function:
 *  1. Picks the cli2 options file at `cwd` (or `explicitConfigPath` if supplied) and the sibling
 *     main config, in cli2's documented priority order.
 *  2. For `.cjs` configs: `require()`s the module and walks `Module.children` to enumerate every
 *     transitively-loaded file.
 *  3. For JSONC/JSON/YAML configs: parses and recursively follows the `extends` field (and the
 *     `config` field for cli2 options files when it is a string path).
 *  4. `.mjs` configs are recorded but their import graph is not expanded (would require dynamic
 *     `import()` machinery that isn't worth the complexity until we have one in the repo).
 *
 * Exported for unit tests.
 *
 * @param cwd - Absolute path to the directory cli2 would run from.
 * @param repoRoot - Absolute path to the repository root; the search ignores files outside it.
 * @param explicitConfigPath - Optional argument from `--config`, resolved against `cwd`.
 * @returns Absolute paths to every existing file in the resolved chain. Order is not significant.
 *
 * @remarks
 * Does not enumerate per-subdirectory configs that cli2 would load when descending into the
 * linted tree. Today every Fluid package places its config only at the package root, so this is
 * sufficient; revisit if nested configs become a thing.
 */
export async function resolveMarkdownLintCli2ConfigChain(
	cwd: string,
	repoRoot: string,
	explicitConfigPath?: string,
): Promise<string[]> {
	const found = new Set<string>();
	const repoRootResolved = path.resolve(repoRoot);
	const requireFromCwd = createRequire(path.join(cwd, "noop.js"));

	const isUnderRepoRoot = (abs: string): boolean => {
		const rel = path.relative(repoRootResolved, abs);
		return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
	};

	const visit = (file: string): void => {
		const abs = path.resolve(file);
		if (found.has(abs) || !existsSync(abs) || !isUnderRepoRoot(abs)) {
			return;
		}
		found.add(abs);
		const ext = path.extname(abs).toLowerCase();
		switch (ext) {
			case ".cjs":
			case ".js": {
				const dependencies = walkRequireGraph(abs, {
					requireFn: requireFromCwd,
					filter: isUnderRepoRoot,
				});
				for (const dependency of dependencies) {
					found.add(dependency);
				}
				break;
			}
			case ".jsonc":
			case ".json": {
				followExtends(abs, visit, parseJsoncLike);
				break;
			}
			case ".yaml":
			case ".yml": {
				followExtends(abs, visit, parseYamlLike);
				break;
			}
			default: {
				// `.mjs`: just record the file itself.
			}
		}
	};

	if (explicitConfigPath !== undefined) {
		visit(path.resolve(cwd, explicitConfigPath));
	} else {
		for (const name of MARKDOWNLINT_CLI2_OPTIONS_FILE_NAMES) {
			const candidate = path.join(cwd, name);
			if (existsSync(candidate)) {
				visit(candidate);
				break;
			}
		}
	}
	for (const name of MARKDOWNLINT_MAIN_CONFIG_FILE_NAMES) {
		const candidate = path.join(cwd, name);
		if (existsSync(candidate)) {
			visit(candidate);
			break;
		}
	}

	return Array.from(found);
}

function followExtends(
	absPath: string,
	visit: (next: string) => void,
	parse: (raw: string) => unknown,
): void {
	let parsed: unknown;
	try {
		parsed = parse(readFileSync(absPath, "utf8"));
	} catch {
		return;
	}
	if (typeof parsed !== "object" || parsed === null) {
		return;
	}
	const obj = parsed as Record<string, unknown>;
	const dir = path.dirname(absPath);
	const recur = (target: string): void => visit(path.resolve(dir, target));

	const extendsValue = obj.extends;
	if (typeof extendsValue === "string") {
		recur(extendsValue);
	} else if (Array.isArray(extendsValue)) {
		for (const entry of extendsValue) {
			if (typeof entry === "string") {
				recur(entry);
			}
		}
	}
	// cli2 options files can point `config` at another file (relative path).
	if (typeof obj.config === "string") {
		recur(obj.config);
	}
}

function parseJsoncLike(raw: string): unknown {
	// JSON5 accepts JSONC's comments and trailing commas, which is enough for our purposes.
	return JSON5.parse(raw);
}

function parseYamlLike(raw: string): unknown {
	return parseYamlString(raw);
}

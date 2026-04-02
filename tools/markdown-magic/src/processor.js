/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// @ts-check

import fs from "node:fs";
import path from "node:path";
import globby from "globby";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMdx from "remark-mdx";
import { visit } from "unist-util-visit";

/**
 * A remark/mdx AST node that carries a string value and source position offsets.
 * Covers both `html` nodes (Markdown) and `mdxFlowExpression` nodes (MDX).
 * @typedef {{ value: string, position: { start: { offset: number }, end: { offset: number } } }} PragmaNode
 */

/**
 * A pragma entry collected during AST traversal.
 * @typedef {{ type: "start", node: PragmaNode, spec: string } | { type: "end", node: PragmaNode }} PragmaEntry
 */

/**
 * Configuration object passed to {@link processFiles} and {@link processFile}.
 * @typedef {object} ProcessorConfig
 * @property {Record<string, Function>} transforms - Map of transform name to transform function.
 * @property {object} [globbyOptions] - Additional options passed to globby for file matching.
 */

/**
 * The keyword used to identify auto-generated content blocks.
 */
const MATCH_WORD = "AUTO-GENERATED-CONTENT";

/**
 * Patterns for detecting pragma nodes in Markdown (.md) files.
 * In remark's AST, HTML comments are represented as `html` nodes.
 * The capture group yields the transform spec: "TRANSFORM_NAME:opt1=val1&opt2=val2"
 */
const MD_START_PATTERN = new RegExp(`${MATCH_WORD}:START\\s*\\(([^)]+)\\)`);
const MD_END_PATTERN = new RegExp(`${MATCH_WORD}:END`);

/**
 * Patterns for detecting pragma nodes in MDX (.mdx) files.
 * In remark-mdx's AST, JSX expression comments are represented as
 * `mdxFlowExpression` nodes. The node's `.value` is the expression text inside
 * the braces, e.g. "/* AUTO-GENERATED-CONTENT:START (TRANSFORM) *\/".
 */
const MDX_START_PATTERN = new RegExp(
	`\\/\\*\\s*${MATCH_WORD}:START\\s*\\(([^)]+)\\)\\s*\\*\\/`,
);
const MDX_END_PATTERN = new RegExp(`\\/\\*\\s*${MATCH_WORD}:END\\s*\\*\\/`);

/**
 * Parses a transform spec string into a command name and options object.
 * The spec format is "TRANSFORM_NAME:opt1=val1&opt2=val2" (options are optional).
 *
 * @param {string} spec - The transform spec string.
 * @returns {{ cmd: string, cmdOptions: object }}
 */
function parseTransformSpec(spec) {
	const colonIndex = spec.indexOf(":");
	if (colonIndex === -1) {
		return { cmd: spec.trim(), cmdOptions: {} };
	}
	const cmd = spec.slice(0, colonIndex).trim();
	const optionsStr = spec.slice(colonIndex + 1);
	/** @type {Record<string, string>} */
	const cmdOptions = {};
	for (const part of optionsStr.split("&")) {
		const eqIndex = part.indexOf("=");
		if (eqIndex !== -1) {
			cmdOptions[part.slice(0, eqIndex)] = part.slice(eqIndex + 1);
		}
	}
	return { cmd, cmdOptions };
}

/**
 * Processes a single file: finds all AUTO-GENERATED-CONTENT pragma blocks, runs the
 * associated transforms, and splices the new content back into the source string.
 * The file is written back only if content changed.
 *
 * Uses the remark AST for pragma detection (robust against false matches in code
 * fences) and string-offset splicing for content replacement (preserves all
 * non-generated content exactly).
 *
 * Before calling each transform, a `fileConfig` object is assembled by spreading the
 * base `config` and injecting three additional fields that transforms may use:
 * - `originalPath` {string} — path of the file being processed
 * - `originalContent` {string} — full source of the file as it was read from disk
 * - `outputContent` {string} — current state of the source after any previously
 *   applied transforms within this run (updated after each block)
 *
 * Note: the `content` argument passed to each transform function is the trimmed text
 * currently between the START and END pragma markers — leading/trailing whitespace is
 * removed before the transform sees it.
 *
 * @param {string} filePath - Absolute or cwd-relative path to the file.
 * @param {ProcessorConfig} config - Configuration object (transforms, globbyOptions, etc.)
 * @returns {Promise<void>}
 * @throws If the file cannot be read, or if a transform throws an error.
 */
async function processFile(filePath, config) {
	let source;
	try {
		source = fs.readFileSync(filePath, "utf8");
	} catch (e) {
		console.error(`FILE NOT FOUND ${filePath}`);
		throw e;
	}

	const isMdx = path.extname(filePath).toLowerCase() === ".mdx";

	// Parse the file into an AST. For MDX files, add the remark-mdx plugin so that
	// JSX expression comments ({/* ... */}) are recognized as mdxFlowExpression nodes.
	const processor = unified().use(remarkParse);
	if (isMdx) {
		processor.use(remarkMdx);
	}
	const tree = processor.parse(source);

	// Walk the AST to collect pragma nodes in document order.
	// .md:  html nodes            whose .value matches <!-- AUTO-GENERATED-CONTENT:... -->
	// .mdx: mdxFlowExpression nodes whose .value matches /* AUTO-GENERATED-CONTENT:... */
	const nodeType = isMdx ? "mdxFlowExpression" : "html";
	const startPattern = isMdx ? MDX_START_PATTERN : MD_START_PATTERN;
	const endPattern = isMdx ? MDX_END_PATTERN : MD_END_PATTERN;

	/** @type {PragmaEntry[]} */
	const pragmaNodes = [];
	visit(tree, nodeType, /** @param {PragmaNode} node */ (node) => {
		const value = node.value ?? "";
		const startMatch = value.match(startPattern);
		if (startMatch) {
			pragmaNodes.push({ type: "start", node, spec: startMatch[1] });
			return;
		}
		if (endPattern.test(value)) {
			pragmaNodes.push({ type: "end", node });
		}
	});

	if (pragmaNodes.length === 0) {
		return;
	}

	// Pair each START pragma with its immediately following END pragma.
	const pairs = [];
	for (let i = 0; i < pragmaNodes.length; i++) {
		const current = pragmaNodes[i];
		if (current.type === "start") {
			const next = pragmaNodes[i + 1];
			if (next?.type === "end") {
				pairs.push({ startNode: current.node, endNode: next.node, spec: current.spec });
				i++; // consume the end node
			} else {
				console.warn(
					`[markdown-magic] Warning: Unmatched START pragma in "${filePath}": (${current.spec})`,
				);
			}
		} else {
			console.warn(`[markdown-magic] Warning: Unmatched END pragma in "${filePath}"`);
		}
	}

	if (pairs.length === 0) {
		return;
	}

	const originalSource = source;
	const fileConfig = {
		...config,
		originalPath: filePath,
		originalContent: originalSource,
		outputContent: source,
	};

	// Process pairs from end to start (reverse document order) so that each string
	// splice does not shift the offsets of the pairs that come earlier in the file.
	for (const { startNode, endNode, spec } of [...pairs].reverse()) {
		const { cmd, cmdOptions } = parseTransformSpec(spec);

		if (!config.transforms?.[cmd]) {
			console.warn(
				`[markdown-magic] Warning: Transform "${cmd}" not found. Block skipped in "${filePath}".`,
			);
			continue;
		}

		// Extract the current content between the pragma nodes (exclusive of the pragma
		// lines themselves). Trim leading/trailing whitespace to get the raw content.
		const contentStart = startNode.position.end.offset;
		const contentEnd = endNode.position.start.offset;
		const originalContent = source.slice(contentStart, contentEnd).replace(/^\s+|\s+$/g, "");

		let newContent;
		try {
			newContent = await config.transforms[cmd](originalContent, cmdOptions, fileConfig);
			if (typeof newContent === "function") {
				newContent = await newContent(originalContent, cmdOptions, fileConfig);
			}
		} catch (err) {
			console.error(
				`[markdown-magic] Error running transform "${cmd}" in "${filePath}":`,
				err,
			);
			throw err;
		}

		if (newContent === undefined || newContent === null) {
			console.warn(
				`[markdown-magic] Warning: Transform "${cmd}" returned no content. Keeping original.`,
			);
			newContent = originalContent;
		}

		// Splice the new content between the pragma node boundaries.
		source =
			source.slice(0, contentStart) + "\n" + newContent + "\n" + source.slice(contentEnd);
		fileConfig.outputContent = source;
	}

	if (source !== originalSource) {
		fs.writeFileSync(filePath, source);
		console.log(`✔ ${filePath.replace(process.cwd(), "")} Updated`);
	}
}

/**
 * Processes all files matching the provided glob patterns.
 * For each matched file, finds AUTO-GENERATED-CONTENT pragma blocks and runs the
 * associated transforms to regenerate the block content.
 *
 * Handles both .md files (HTML comment pragma syntax) and .mdx files (JSX expression
 * comment pragma syntax) through a single unified code path.
 *
 * @param {string | string[]} patterns - Glob pattern(s) to match files against.
 * @param {ProcessorConfig} config - Configuration object.
 * The defaults applied before any `config.globbyOptions` overrides are: `{ gitignore: true, onlyFiles: true, deep: 5 }`.
 * @returns {Promise<void>}
 */
async function processFiles(patterns, config) {
	const files = await globby(patterns, {
		gitignore: true,
		onlyFiles: true,
		deep: 5,
		...config.globbyOptions,
	});

	if (files.length === 0) {
		console.log("[markdown-magic] No files found matching the provided patterns.");
		return;
	}

	await Promise.all(files.map((filePath) => processFile(filePath, config)));
}

export { processFiles };

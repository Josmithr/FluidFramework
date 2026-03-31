<!-- NOTE: This is a working design document. It is not part of the package's published output. -->

# Plan: MDX Support via unified/remark

## Goal

Replace `@tylerbu/markdown-magic` as the processing engine with a new processor built on
`unified` + `remark`. The new processor handles both `.md` and `.mdx` files through a single
code path by leveraging the AST's typed comment nodes, rather than format-specific regexes.

All 14 existing transforms continue to work unchanged. The `.md` pragma syntax is preserved
exactly, so no existing files need to be updated.

---

## Background

The current engine (`@tylerbu/markdown-magic`) hardcodes HTML comment syntax (`<!-- -->`) in its
detection regexes. MDX does not support HTML comment syntax — it uses JSX expression comments
(`{/* */}`) instead. Adding MDX support via regex would require either forking the upstream package
again or maintaining a second parallel processing loop.

Instead, we replace the engine entirely with a `unified`-based processor that parses files into
a typed AST. In this AST, comments have distinct node types by format:

- `.md` → `html` nodes (e.g. `<!-- AUTO-GENERATED-CONTENT:START (TRANSFORM) -->`)
- `.mdx` → `mdxFlowExpression` nodes (e.g. `{/* AUTO-GENERATED-CONTENT:START (TRANSFORM) */}`)

Content replacement is done by **string splicing on the original source using AST node position
offsets** — `remark-stringify` is never called. Everything outside the generated blocks is
preserved character-for-character.

A secondary benefit: the AST approach is immune to false pragma matches inside fenced code blocks,
which the current regex-based approach is not.

---

## New pragma format for MDX

Existing `.md` pragmas are **unchanged**:

```md
<!-- AUTO-GENERATED-CONTENT:START (TRANSFORM_NAME:opt1=val1&opt2=val2) -->
...generated content...
<!-- AUTO-GENERATED-CONTENT:END -->
```

New `.mdx` pragmas use JSX expression comment syntax:

```mdx
{/* AUTO-GENERATED-CONTENT:START (TRANSFORM_NAME:opt1=val1&opt2=val2) */}
...generated content...
{/* AUTO-GENERATED-CONTENT:END */}
```

`{/* */}` is a JSX expression comment — it renders to nothing in the MDX output and is valid
everywhere in MDX that a flow element can appear.

---

## New requirement: transforms must not output HTML

The new processor enables `.mdx` support, but MDX files will reject HTML tags and HTML comment
syntax (`<!-- -->`) appearing in generated content. Therefore, all transform output must be valid
in both `.md` and `.mdx`.

**Rule:** Transform functions must only return content that is valid in both Markdown and MDX.
Specifically:
- No raw HTML tags (e.g. `<div>`, `<span>`)
- No HTML comment syntax (`<!-- -->`)
- No Markdown autolink syntax (`<https://url>` or `<http://url>`) — use explicit link syntax
  (`[https://url](https://url)`) instead, which is valid in both formats

This rule applies to all existing and future transforms. It is enforced by the documentation in
`src/transforms/index.cjs` and verified via the test suite.

---

## Dependency changes

### Added to `tools/markdown-magic/package.json`

| Package | Purpose | Status in pnpm store |
|---|---|---|
| `unified` | Core processor pipeline | Already installed (transitively) |
| `remark-parse` | Parses Markdown/MDX source to AST | Already installed (transitively) |
| `remark-mdx` | Extends remark-parse to understand MDX nodes | **New — not yet in repo** |
| `unist-util-visit` | AST node walker | Already installed (transitively) |
| `globby` | File glob expansion | Already installed (transitively) |

### Removed from `tools/markdown-magic/package.json`

- `@tylerbu/markdown-magic` — replaced entirely by `src/processor.cjs`

---

## File-by-file changes

### 1. `package.json` (tools/markdown-magic)

- Add `unified`, `remark-parse`, `remark-mdx`, `unist-util-visit`, `globby` as dependencies
- Remove `@tylerbu/markdown-magic`

---

### 2. `src/processor.cjs` *(new file)*

This is the core engine. It replaces `@tylerbu/markdown-magic`'s `processFile.js` and
`updateContents.js`.

**Public API:**

```js
/**
 * Processes all files matching the given glob patterns.
 * For each file, finds AUTO-GENERATED-CONTENT pragma blocks and runs the
 * associated transform to regenerate the block content.
 *
 * Handles both .md (HTML comment pragmas) and .mdx (JSX expression comment
 * pragmas) files through a single code path.
 *
 * @param {string | string[]} patterns - Glob pattern(s) to match files against.
 * @param {object} config - Configuration object.
 * @param {object} config.transforms - Map of transform name → transform function.
 * @param {object} [config.globbyOptions] - Options forwarded to globby for file matching.
 * @returns {Promise<void>}
 */
async function processFiles(patterns, config) { ... }
```

**Internal design:**

```
processFiles(patterns, config)
  → globby(patterns, config.globbyOptions)         // expand globs
  → for each file: processFile(filePath, config)   // sequential, same as current behavior

processFile(filePath, config)
  → fs.readFileSync(filePath)
  → detect format: path.extname(filePath) === '.mdx'
  → unified().use(remarkParse)[.use(remarkMdx)].parse(source)
  → collectPragmas(tree, source, isMdx)            // find all START/END nodes
  → pairPragmas(pragmas)                           // match START↔END
  → for each pair (in reverse document order):
      originalContent = source between start.end and end.start, trimmed
      newContent = await config.transforms[cmd](originalContent, cmdOptions, fileConfig)
      source = splice(source, start.position.end.offset, end.position.start.offset, newContent)
  → if source changed: fs.writeFileSync(filePath, source)
```

**Pragma node collection:**

For `.md` files, visit AST nodes of type `'html'`:
```
node.value matches: /AUTO-GENERATED-CONTENT:START\s*\(([^)]+)\)/  → START pragma
node.value matches: /AUTO-GENERATED-CONTENT:END/                  → END pragma
```

For `.mdx` files, visit AST nodes of type `'mdxFlowExpression'`
(whose `.value` is the expression text without the surrounding `{` and `}`):
```
node.value matches: /\/\*\s*AUTO-GENERATED-CONTENT:START\s*\(([^)]+)\)\s*\*\//  → START pragma
node.value matches: /\/\*\s*AUTO-GENERATED-CONTENT:END\s*\*\//                  → END pragma
```

**Transform options parsing** (same logic as `@tylerbu/markdown-magic`'s `parseOptions`):

From the capture group `TRANSFORM_NAME:opt1=val1&opt2=val2`:
- `cmd` = `TRANSFORM_NAME`
- `options` = `{ opt1: "val1", opt2: "val2" }` (split on `&`, then on first `=`)

**The `fileConfig` object passed to each transform** (same interface as today):
```js
{
  ...config,              // inherits transforms, globbyOptions, etc.
  originalPath: filePath,
  originalContent: originalSource,   // content before any transforms ran
  outputContent: source,             // current content (updated after each splice)
}
```

**String splicing** (processes pairs in reverse document order to keep earlier offsets valid):
```js
const before = source.slice(0, startNode.position.end.offset);
const after  = source.slice(endNode.position.start.offset);
source = `${before}\n${newContent}\n${after}`;
```

**Error handling:**
- Unmatched START pragma (no following END): log a warning and skip the block
- Unknown transform name: log a warning (same behavior as current engine)
- Transform throws: propagate the error (same as current behavior)

---

### 3. `src/index.cjs`

- Replace `require('@tylerbu/markdown-magic')` with `require('./processor.cjs')`
- Change the call from `markdownMagic(matchPattern, config)` to `processFiles(matchPattern, config)`
- Change the default `--files` pattern from `**/*.md` to `**/*.{md,mdx}` so MDX files are
  processed by default without any script changes

```js
// Before:
const markdownMagic = require("@tylerbu/markdown-magic");
const defaultMatchPattern = "**/*.md";
markdownMagic(matchPattern, config).then(...)

// After:
const { processFiles } = require("./processor.cjs");
const defaultMatchPattern = "**/*.{md,mdx}";
processFiles(matchPattern, config).then(...)
```

---

### 4. `src/constants.cjs`

The `generatedContentNotice` and `embeddedContentNotice` values are currently HTML comments
(`<!-- NOTE: ... -->`), which are invalid in MDX.

Add MDX-compatible equivalents using JSX expression comment syntax, which renders to nothing
(same visible behavior as the HTML comment equivalents in `.md` files):

```js
// Existing — used for .md files (unchanged):
const generatedContentNotice =
    `<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. ` +
    `Do not update these generated contents directly. -->`;

const embeddedContentNotice =
    `<!-- NOTE: This section is automatically generated by embedding the referenced file ` +
    `contents. Do not update these generated contents directly. -->`;

// New — used for .mdx files:
const mdxGeneratedContentNotice =
    `{/* NOTE: This section is automatically generated using @fluid-tools/markdown-magic. ` +
    `Do not update these generated contents directly. */}`;

const mdxEmbeddedContentNotice =
    `{/* NOTE: This section is automatically generated by embedding the referenced file ` +
    `contents. Do not update these generated contents directly. */}`;
```

Export all four constants.

---

### 5. `src/utilities.cjs`

Three changes:

**A. `bundlePrettierPragmas(contents, config)` — add `config` parameter; skip for MDX**

Prettier does not support the version of MDX used in this repo. Prettier-ignore directives are
therefore not emitted for `.mdx` files. The HTML comment form is also invalid in MDX. So for MDX
files, we return the contents as-is.

```js
/**
 * @param {string} contents
 * @param {object} [config] - The transform config object. Used to detect the file format.
 */
function bundlePrettierPragmas(contents, config) {
    // Prettier does not support the version of MDX (v3 / @mdx-js/mdx) used in this repo,
    // so prettier-ignore directives are omitted for .mdx files.
    // See: https://github.com/prettier/prettier/issues/12209
    if (path.extname(config?.originalPath ?? "") === ".mdx") {
        return contents;
    }
    return ["\n<!-- prettier-ignore-start -->", contents, "<!-- prettier-ignore-end -->\n"].join("\n");
}
```

**B. `formattedGeneratedContentBody(contents, config)` — add `config` parameter; select notice by format**

```js
function formattedGeneratedContentBody(contents, config) {
    const isMdx = path.extname(config?.originalPath ?? "") === ".mdx";
    const notice = isMdx ? mdxGeneratedContentNotice : generatedContentNotice;
    return bundlePrettierPragmas([notice, contents].join("\n"), config);
}
```

**C. `formattedEmbeddedContentBody(contents, config)` — same pattern**

```js
function formattedEmbeddedContentBody(contents, config) {
    const isMdx = path.extname(config?.originalPath ?? "") === ".mdx";
    const notice = isMdx ? mdxEmbeddedContentNotice : embeddedContentNotice;
    return bundlePrettierPragmas([notice, contents].join("\n"), config);
}
```

Add `path` to the requires at the top of the file, and import `mdxGeneratedContentNotice` and
`mdxEmbeddedContentNotice` from `constants.cjs`.

---

### 6. `src/md-magic.config.cjs`

Thread `config` through to all `formattedGeneratedContentBody` call sites.

**`templateTransform` helper** — add `config` parameter:

```js
// Before:
function templateTransform(templateFileName, headingOptions) {
    return formattedGeneratedContentBody(
        generateSectionFromTemplate(templateFileName, headingOptions),
    );
}

// After:
function templateTransform(templateFileName, headingOptions, config) {
    return formattedGeneratedContentBody(
        generateSectionFromTemplate(templateFileName, headingOptions),
        config,
    );
}
```

**`readmeFooterTransform`** — pass `config` to `formattedGeneratedContentBody`:

```js
// Before:
return formattedGeneratedContentBody(sections.join(""));

// After:
return formattedGeneratedContentBody(sections.join(""), config);
```

**`libraryReadmeHeaderTransform`** — same change.

**`exampleAppReadmeHeaderTransform`** — same change.

**`CLIENT_REQUIREMENTS`, `TRADEMARK`, `CONTRIBUTION_GUIDELINES`, `DEPENDENCY_GUIDELINES`, `HELP`**
— these are arrow functions that call `templateTransform`. Pass `config` through:

```js
// Before:
CLIENT_REQUIREMENTS: (content, options, config) =>
    templateTransform("Client-Requirements-Template.md", parseHeadingOptions(options, "Client Requirements")),

// After:
CLIENT_REQUIREMENTS: (content, options, config) =>
    templateTransform("Client-Requirements-Template.md", parseHeadingOptions(options, "Client Requirements"), config),
```

(Same pattern for `TRADEMARK`, `CONTRIBUTION_GUIDELINES`, `DEPENDENCY_GUIDELINES`, `HELP`.)

---

### 7. `src/transforms/includeTransform.cjs`

Thread `config` to `formattedEmbeddedContentBody`:

```js
// Before:
return formattedEmbeddedContentBody(section);

// After:
return formattedEmbeddedContentBody(section, config);
```

---

### 8. `src/transforms/includeCodeTransform.cjs`

Same change as `includeTransform.cjs`:

```js
// Before:
return formattedEmbeddedContentBody(section);

// After:
return formattedEmbeddedContentBody(section, config);
```

---

### 9. `src/transforms/packageScriptsTransform.cjs`

Thread `config` to `formattedGeneratedContentBody`:

```js
// Before:
return formattedGeneratedContentBody(
    generatePackageScriptsSection(scriptsTable, headingOptions),
);

// After:
return formattedGeneratedContentBody(
    generatePackageScriptsSection(scriptsTable, headingOptions),
    config,
);
```

---

### 10. `src/transforms/apiDocsLinkSectionTransform.cjs`

Replace Markdown autolink with an explicit link (autolinks parse as JSX tags in MDX):

```js
// Before:
const sectionBody = `API documentation for **${packageName}** is available at <https://fluidframework.com/docs/apis/${shortName}>.`;

// After:
const sectionBody = `API documentation for **${packageName}** is available at [https://fluidframework.com/docs/apis/${shortName}](https://fluidframework.com/docs/apis/${shortName}).`;
```

---

### 11. `src/transforms/exampleGettingStartedTransform.cjs`

Replace two Markdown autolinks with explicit links (same reason as above):

```js
// Before (line ~52):
`open <http://localhost:8080> in a web browser`

// After:
`open [http://localhost:8080](http://localhost:8080) in a web browser`
```

```js
// Before (line ~56):
`...and open <http://localhost:8080> like above.`

// After:
`...and open [http://localhost:8080](http://localhost:8080) like above.`
```

---

### 12. `src/transforms/index.cjs`

Add a documentation comment at the top of the file stating the HTML-free requirement for all
transforms, so it is visible to anyone adding a new transform:

```js
/**
 * Transform functions registered with markdown-magic.
 *
 * IMPORTANT: All transform functions must return content that is valid in both
 * Markdown (.md) and MDX (.mdx) files. Specifically:
 * - No raw HTML tags (e.g. <div>, <span>)
 * - No HTML comment syntax (<!-- -->)
 * - No Markdown autolink syntax (<https://url>) — use explicit links ([url](url)) instead
 *
 * Violating this constraint will cause MDX parse errors when the generated content
 * is embedded in .mdx files.
 */
```

---

## What does NOT change

- The `.md` pragma syntax — all 179 existing files with `AUTO-GENERATED-CONTENT` blocks are
  unmodified and continue to work exactly as before.
- The 14 transform function signatures and behavior (except the `config` param threading, which
  is transparent to callers since `config` was already the third argument).
- The CLI interface (`--files`, `--workingDirectory`).
- The `md-magic.config.cjs` structure (transforms map + globbyOptions).
- The template files under `src/templates/` — they are all clean Markdown with no HTML.
- The `test/` directory and test fixtures — existing `.md` test files continue to pass; new
  `.mdx` test files will be added.

---

## Test plan

### Existing tests (regression)

The current test (`npm test`) runs `node src/index.cjs --files "test/**/*.md"` and verifies that
the output matches the committed fixture files. These must continue to pass unchanged.

### New MDX tests

Add test fixture files under `test/` for MDX pragma scenarios:

| File | Transforms exercised |
|---|---|
| `test/mdx/include.mdx` | `INCLUDE` |
| `test/mdx/include-code.mdx` | `INCLUDE_CODE` |
| `test/mdx/library-readme-header.mdx` | `LIBRARY_README_HEADER` |
| `test/mdx/readme-footer.mdx` | `README_FOOTER` |
| `test/mdx/package-scope-notice.mdx` | `PACKAGE_SCOPE_NOTICE` |
| `test/mdx/api-docs.mdx` | `API_DOCS` |

Each fixture uses `{/* AUTO-GENERATED-CONTENT:START (TRANSFORM) */}` syntax. The committed file
contains already-generated content. `npm test` re-runs the tool and the output must match.

A key assertion for MDX fixtures: the generated content must contain **no HTML comments**
(`<!-- prettier-ignore-start -->`, `<!-- NOTE: ... -->`, etc.) — those are replaced with their
MDX-compatible equivalents or omitted (per the prettier-ignore decision above).

---

## Open questions

None at this time. This document captures the full agreed design.

---

## Implementation order

Suggested sequence to keep the changes reviewable in isolation:

1. `package.json` — add/remove dependencies
2. `src/constants.cjs` — add MDX notice constants
3. `src/utilities.cjs` — format-aware `bundlePrettierPragmas` and `formattedGeneratedContentBody`/`formattedEmbeddedContentBody`
4. `src/transforms/apiDocsLinkSectionTransform.cjs` and `src/transforms/exampleGettingStartedTransform.cjs` — autolink fixes
5. `src/transforms/includeTransform.cjs`, `src/transforms/includeCodeTransform.cjs`, `src/transforms/packageScriptsTransform.cjs` — thread `config`
6. `src/md-magic.config.cjs` — thread `config` through `templateTransform` and all `formattedGeneratedContentBody` call sites
7. `src/transforms/index.cjs` — add HTML-free requirement doc comment
8. `src/processor.cjs` — new unified/remark-based engine
9. `src/index.cjs` — wire up new processor, update default glob
10. `test/mdx/` — add MDX fixture files and verify

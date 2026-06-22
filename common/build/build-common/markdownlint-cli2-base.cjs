/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Shared markdownlint-cli2 configuration used by the repo root and every package in the client
// release group. Per-package `.markdownlint-cli2.cjs` files should `require()` and re-export this
// module so a single source of truth defines both the rule set and the ignore list.
//
// See https://github.com/DavidAnson/markdownlint-cli2#configuration for the schema.

module.exports = {
	// markdownlint rules. See https://github.com/DavidAnson/markdownlint/blob/main/doc/Rules.md.
	config: {
		default: true,
		"first-line-heading": false,
		"line-length": false,
		"no-inline-html": false,
		"no-multiple-blanks": { maximum: 2 },
		MD010: false,
		MD025: false,
		MD026: false,
		MD028: false,
	},
	// Glob patterns ignored by every consumer. Patterns are applied relative to the directory
	// containing the per-package `.markdownlint-cli2.cjs` that re-exports this module.
	ignores: [
		"**/node_modules/**",
		"**/lib/**",
		"**/dist/**",
		"**/CHANGELOG.md",
		// Deprecated; contents have moved out of this file.
		"BREAKING.md",
	],
};

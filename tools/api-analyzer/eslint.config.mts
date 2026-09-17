/* eslint import-x/no-default-export: "off", import-x/no-internal-modules: ["error", { allow: ["@fluidframework/eslint-config-fluid/flat.mts"] }] -- ESLint requires a default export and the shared preset's documented subpath. */

import { strict } from "@fluidframework/eslint-config-fluid/flat.mts";
import type { Linter } from "eslint";

const config: Linter.Config[] = [
	// Generated output and compiler fixture inputs are not product-code lint targets.
	{ ignores: ["lib/**", "src/test/fixtures/**"] },
	...strict,
	{
		files: ["**/*.{ts,mts}"],
		languageOptions: {
			parserOptions: {
				// The shared project service must receive the same allowance regardless of lint order.
				// Only this tooling file is outside the source build's root directory.
				projectService: { allowDefaultProject: ["eslint.config.mts"] },
			},
		},
	},
	{
		// This package runs in Node.js and owns file-system and compiler-process operations.
		rules: { "import-x/no-nodejs-modules": "off" },
	},
	{
		files: ["src/**/*.ts"],
		rules: {
			// Good-fences owns relative module boundaries. Keep external subpath restrictions here.
			"import-x/no-internal-modules": [
				"error",
				{
					allow: [
						"**/api-analyzer/src/**",
						"typescript/unstable/**",
						"typescript/package.json",
						"typescript6/package.json",
					],
				},
			],
		},
	},
	{
		files: ["src/**/test/**/*.ts"],
		// Tests may intentionally verify JSON serialization, not in-memory cloning.
		rules: { "unicorn/prefer-structured-clone": "off" },
	},
];

export default config;

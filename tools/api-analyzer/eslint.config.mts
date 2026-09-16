import { strict } from "@fluidframework/eslint-config-fluid/flat.mts";
import type { Linter } from "eslint";

const config: Linter.Config[] = [
	// Generated output and compiler fixture inputs are not product-code lint targets.
	{ ignores: ["lib/**", "src/test/fixtures/**"] },
	...strict,
	{
		files: ["eslint.config.mts"],
		languageOptions: {
			parserOptions: {
				// This tooling file is outside the source build's root directory.
				projectService: { allowDefaultProject: ["eslint.config.mts"] },
			},
		},
	},
	{
		// This package runs in Node.js and owns file-system and compiler-process operations.
		rules: { "import-x/no-nodejs-modules": "off" },
	},
	{
		files: ["src/nativeAdapter.ts", "src/test/nativeCapabilities.test.ts", "src/test/lifecycleWorker.ts"],
		rules: {
			// These are official TS7 entrypoints; tests also verify the installed compiler versions.
			"import-x/no-internal-modules": [
				"error",
				{ allow: ["typescript/unstable/**", "typescript/package.json", "typescript6/package.json"] },
			],
		},
	},
	{
		files: ["src/nativeAdapter.ts", "src/test/nativeCapabilities.test.ts"],
		// TypeScript exposes symbol flags as bit masks.
		rules: { "no-bitwise": "off" },
	},
];

export default config;

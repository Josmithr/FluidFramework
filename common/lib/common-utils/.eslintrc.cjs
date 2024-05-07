/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	extends: [require.resolve("@fluidframework/eslint-config-fluid"), "prettier"],
	parserOptions: {
		project: [
			"./tsconfig.json",
			"./src/test/mocha/tsconfig.json",
			"./src/test/jest/tsconfig.json",
			"./src/test/types/tsconfig.json",
		],
	},
	rules: {
		// This package is being deprecated, so it's okay to use deprecated APIs.
		"import/no-deprecated": "off",

		// This package uses node's events APIs.
		// This should probably be reconsidered, but until then we will leave an exception for it here.
		"import/no-nodejs-modules": ["error", { allow: ["events"] }],

		// TODO
		"unicorn/prefer-node-protocol": "off",
	},
	overrides: [
		{
			files: ["src/test/**/*"],
			rules: {
				// It's fine for tests to use node.js modules.
				"import/no-nodejs-modules": "off",
			},
		},
	],
};

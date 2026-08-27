/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

const path = require("node:path");
const webpack = require("webpack");

module.exports = {
	mode: "development",
	devtool: "inline-source-map",
	entry: "./dist/test/playwright/browserHash.js",
	output: {
		filename: "browserHash.bundle.js",
		path: path.resolve(__dirname, "dist/test/playwright"),
	},
	plugins: [
		/** The tests use Web Crypto on localhost. Exclude the Node fallback to test only the browser path. */
		new webpack.IgnorePlugin({
			resourceRegExp: /^\.\/hashFileNode\.js$/,
		}),
	],
};

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Root-level markdownlint-cli2 configuration. Re-exports the shared config from build-common so
// the repo root uses the same rule set and ignore list as every package in the client release
// group. Do not edit by hand — update the shared base instead.

module.exports = require("./common/build/build-common/markdownlint-cli2-base.cjs");

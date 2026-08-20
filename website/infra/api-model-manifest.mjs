/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";

import chalk from "chalk";
import fs from "fs-extra";

const manifestFileName = "api-model-manifest.json";

/**
 * Logs provenance from an extracted API model artifact when available.
 *
 * @param {string} artifactDirectory - Directory containing the extracted artifact.
 * @param {string} docsVersion - Documentation version associated with the artifact.
 * @param {(message: string) => void} log - Logging callback.
 * @returns {Promise<void>}
 */
export async function logApiModelManifest(artifactDirectory, docsVersion, log = console.log) {
	const manifestPath = path.join(artifactDirectory, manifestFileName);
	if (!(await fs.pathExists(manifestPath))) {
		log(
			chalk.yellow(
				`API model artifact for docs version ${docsVersion} does not include a manifest.`,
			),
		);
		return;
	}

	const manifest = await fs.readJSON(manifestPath);
	log(chalk.blue(`API model artifact manifest for docs version ${docsVersion}:`));
	log(JSON.stringify(manifest, undefined, 2));
}

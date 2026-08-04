/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { existsSync } from "node:fs";
import path from "node:path";
import type { Package } from "@fluidframework/build-tools";
import {
	Extractor,
	ExtractorConfig,
	ExtractorLogLevel,
	type ExtractorMessage,
} from "@microsoft/api-extractor";
import { Flags } from "@oclif/core";
import { PackageName } from "@rushstack/node-core-library";
import { PackageCommand } from "../../BasePackageCommand.js";
import { writeFileWithLineFeeds } from "../../library/text.js";

/**
 * The dependency metadata written alongside a package's API model.
 *
 * @remarks
 * Only the package name and its production dependency edges are recorded; the website's API documentation
 * generation uses the dependency names (keys) to reconstruct the local dependency graph.
 */
export interface ApiModelDependencyMetadata {
	readonly name: string;
	dependencies?: Partial<Record<string, string>>;
	peerDependencies?: Partial<Record<string, string>>;
}

/**
 * Builds the {@link ApiModelDependencyMetadata} for a package from its package.json fields.
 *
 * @remarks
 * `dependencies` and `peerDependencies` are only included when present, so the serialized output omits
 * empty edges rather than emitting empty objects.
 */
export function buildApiModelDependencyMetadata(packageJson: {
	readonly name: string;
	readonly dependencies?: Partial<Record<string, string>>;
	readonly peerDependencies?: Partial<Record<string, string>>;
}): ApiModelDependencyMetadata {
	const { name, dependencies, peerDependencies } = packageJson;
	const metadata: ApiModelDependencyMetadata = { name };
	if (dependencies !== undefined) {
		metadata.dependencies = dependencies;
	}
	if (peerDependencies !== undefined) {
		metadata.peerDependencies = peerDependencies;
	}
	return metadata;
}

/**
 * Computes the dependency metadata file path for a package, as a sibling of its API model file.
 *
 * @remarks
 * The file name mirrors the API model file name: `<unscopedName>.api.json` -> `<unscopedName>.dependencies.json`.
 */
export function getDependencyMetadataFilePath(
	apiJsonFilePath: string,
	packageName: string,
): string {
	const unscopedName = PackageName.getUnscopedName(packageName);
	return path.join(path.dirname(apiJsonFilePath), `${unscopedName}.dependencies.json`);
}

/**
 * Validates that a non-private package can produce an API model, throwing a user-friendly error otherwise.
 *
 * @remarks
 * `extractorConfig` is the package's prepared API Extractor configuration, or `undefined` when the
 * package has no API Extractor configuration at all. API Extractor leaves `apiJsonFilePath` empty (`""`)
 * when the doc model output is not enabled. Both cases are errors for a non-private package.
 *
 * @param packageName - The name of the package being validated.
 * @param packageDirectory - The package's directory, included in the "missing configuration" error.
 * @param extractorConfig - The package's prepared configuration, or `undefined` when there is none.
 */
export function assertApiModelIsGeneratable(
	packageName: string,
	packageDirectory: string,
	extractorConfig: Pick<ExtractorConfig, "apiJsonFilePath"> | undefined,
): asserts extractorConfig is ExtractorConfig {
	if (extractorConfig === undefined) {
		throw new Error(
			`${packageName}: No API Extractor configuration was found. Expected an "api-extractor.json" file in ${packageDirectory} (or inherited via "extends"). Add one, or mark the package as private if it should not produce API documentation.`,
		);
	}

	if (extractorConfig.apiJsonFilePath === "") {
		throw new Error(
			`${packageName}: API Extractor's doc model output is not enabled. Enable it by configuring the "docModel" setting in the package's API Extractor configuration, or mark the package as private if it should not produce API documentation.`,
		);
	}
}

/**
 * Generates the API model (`<unscopedPackageName>.api.json`) and its dependency metadata
 * (`<unscopedPackageName>.dependencies.json`) for each selected package.
 *
 * @remarks
 * This combines the two steps previously required to prepare the inputs for the website's API
 * documentation build: running API Extractor (via each package's `ci:build:docs` script) to produce the
 * API model, and a separate pass to emit the dependency metadata. Here, API Extractor is invoked through
 * its programmatic API so both outputs are produced together, per package.
 */
export default class GenerateApiModelCommand extends PackageCommand<
	typeof GenerateApiModelCommand
> {
	static readonly summary =
		"Generates the API model (api.json) and its dependency metadata (dependencies.json) for each package.";

	static readonly description = `For each selected package that produces an API model (i.e. one whose API Extractor configuration enables the doc model output), this command:

1. Runs API Extractor to generate the API model file: \`<unscopedPackageName>.api.json\` (equivalent to running \`api-extractor run\` via the package's \`ci:build:docs\` script).
2. Writes a sibling \`<unscopedPackageName>.dependencies.json\` file recording the package's name and its production dependencies (\`dependencies\` and \`peerDependencies\`).

The website uses the dependency metadata to reconstruct the (version-accurate) local dependency graph and scope API documentation generation to only the packages reachable from a curated set of entrypoint packages. See the website's \`docs-api-scoping-design.md\` for details.

Every selected non-private package is processed; private packages (\`"private": true\` in package.json) are skipped. It is an error for a non-private package to be missing its API Extractor configuration or to have the doc model output disabled. This command must run after the packages have been compiled, since API Extractor consumes the generated type declarations.`;

	static readonly flags = {
		local: Flags.boolean({
			description:
				'Run API Extractor in "local" mode, equivalent to `api-extractor run --local`. When omitted, API Extractor runs in CI mode, equivalent to `api-extractor run`.',
			default: false,
		}),
		...PackageCommand.flags,
	} as const;

	protected defaultSelection = "all" as const;

	protected async processPackage(pkg: Package): Promise<void> {
		// Private packages are not published and do not contribute to the public API documentation, so they
		// are intentionally skipped. Every non-private package is expected to produce an API model.
		if (pkg.packageJson.private === true) {
			this.verbose(`${pkg.nameColored}: Package is private; skipping.`);
			return;
		}

		const prepareOptions = ExtractorConfig.tryLoadForFolder({ startingFolder: pkg.directory });
		const extractorConfig =
			prepareOptions === undefined ? undefined : ExtractorConfig.prepare(prepareOptions);

		// Throws a user-friendly error if the package has no API Extractor configuration or its configuration
		// does not enable the doc model (API Extractor leaves `apiJsonFilePath` empty in that case). On success
		// this narrows `extractorConfig` to a defined configuration.
		assertApiModelIsGeneratable(pkg.name, pkg.directory, extractorConfig);

		this.runApiExtractor(pkg, extractorConfig);
		await this.writeDependencyMetadata(pkg, extractorConfig);
	}

	/**
	 * Invokes API Extractor to generate the package's API model file.
	 */
	private runApiExtractor(pkg: Package, extractorConfig: ExtractorConfig): void {
		const errorMessages: string[] = [];
		const result = Extractor.invoke(extractorConfig, {
			localBuild: this.flags.local,
			// By default, when run programmatically API Extractor does not surface diagnostic messages the way
			// it does as a CLI tool. Enabling verbose messages and routing them through this command's logger
			// keeps its output consistent with the rest of the command.
			showVerboseMessages: true,
			messageCallback: (message: ExtractorMessage): void => {
				// Handle the message ourselves so API Extractor does not also print it to the console.
				message.handled = true;
				const text = `${pkg.nameColored} (API Extractor): ${message.text}`;
				switch (message.logLevel) {
					case ExtractorLogLevel.Error: {
						errorMessages.push(message.text);
						this.errorLog(text);
						break;
					}
					case ExtractorLogLevel.Warning: {
						this.warning(text);
						break;
					}
					default: {
						this.verbose(text);
					}
				}
			},
		});

		// Only errors are treated as fatal. This command's job is to produce the API model consumed by the
		// documentation build; warnings (e.g. TSDoc naming hints) do not affect the generated model, so they
		// are surfaced but do not abort generation. Note that API Extractor's own `result.succeeded` also
		// treats warnings as failures in CI (non-local) mode, so it is intentionally not used here.
		if (result.errorCount > 0) {
			const details =
				errorMessages.length > 0 ? ` Errors: ${errorMessages.join("; ")}` : "";
			throw new Error(
				`${pkg.name}: API Extractor completed with ${result.errorCount} error(s).${details}`,
			);
		}

		if (result.warningCount > 0) {
			this.warning(
				`${pkg.nameColored}: API Extractor completed with ${result.warningCount} warning(s).`,
			);
		}
	}

	/**
	 * Writes the dependency metadata file as a sibling of the package's API model file.
	 */
	private async writeDependencyMetadata(
		pkg: Package,
		extractorConfig: ExtractorConfig,
	): Promise<void> {
		const { apiJsonFilePath } = extractorConfig;
		if (!existsSync(apiJsonFilePath)) {
			this.warning(
				`${pkg.nameColored}: Expected API model at ${apiJsonFilePath} was not produced; skipping dependency metadata.`,
			);
			return;
		}

		const metadata = buildApiModelDependencyMetadata(pkg.packageJson);

		const outputFilePath = getDependencyMetadataFilePath(apiJsonFilePath, pkg.name);
		await writeFileWithLineFeeds(
			outputFilePath,
			`${JSON.stringify(metadata, undefined, "\t")}\n`,
		);
		this.verbose(`${pkg.nameColored}: Wrote dependency metadata to ${outputFilePath}.`);
	}
}

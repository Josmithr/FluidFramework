import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
	cpSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { analyzeAPIs, ReleaseLevel, type APIAnalysis, type Configuration } from "../index.js";
import { decodeDependencyModel, type DependencyModel } from "../model.js";

/**
 * Invocation-owned installed package layout and its compiler.
 */
export interface TestRepository {
	/**
	 * Temporary repository directory.
	 */
	readonly directory: string;

	/**
	 * Compiler package used to emit declarations.
	 */
	readonly compiler: "typescript6" | "typescript";

	/**
	 * Packages in dependency-first order.
	 */
	readonly packages: readonly string[];
}

/**
 * Detached outputs and the completed analysis that produced them.
 */
export interface RepositoryArtifact {
	/**
	 * Owning package basename.
	 */
	readonly name: string;

	/**
	 * Completed public analysis, with no live compiler.
	 */
	readonly analysis: APIAnalysis;

	/**
	 * Exact serialized model.
	 */
	readonly text: string;

	/**
	 * Validated model data.
	 */
	readonly model: DependencyModel;

	/**
	 * Reports keyed by surface and selection.
	 */
	readonly reports: Readonly<Record<string, string>>;
}

/**
 * Gets an installed package root without resolving through source aliases.
 * @param repository - Temporary layout.
 * @param name - Package basename.
 * @returns Absolute installed root.
 */
export function getPackageRoot(repository: TestRepository, name: string): string {
	return path.join(repository.directory, "packages", name);
}

/**
 * Copies a complete checked-in workspace and links its local packages without network installation.
 * @param compiler - Declaration producer.
 * @param scenario - Checked-in repository directory name.
 * @returns Temporary layout owned by the caller, which must remove it.
 */
export function createRepository(
	compiler: TestRepository["compiler"],
	scenario: string,
): TestRepository {
	const directory = mkdtempSync(path.join(tmpdir(), "api-repository-"));
	cpSync(
		new URL(`../../src/test/fixtures/repository/${scenario}/`, import.meta.url),
		directory,
		{ recursive: true },
	);
	const { packages } = z
		.object({ packages: z.array(z.string()) })
		.parse(JSON.parse(readFileSync(path.join(directory, "repository.json"), "utf8")));
	const repository = { directory, compiler, packages };
	mkdirSync(path.join(directory, "node_modules", "@scenario"), { recursive: true });
	for (const name of packages) {
		symlinkSync(
			getPackageRoot(repository, name),
			path.join(directory, "node_modules", "@scenario", name),
			"dir",
		);
	}
	return repository;
}

/**
 * Compiles one package with the selected producer.
 * @param repository - Temporary layout.
 * @param name - Package basename.
 */
export function compilePackage(repository: TestRepository, name: string): void {
	const require = createRequire(import.meta.url);
	const compilerRoot = path.dirname(require.resolve(`${repository.compiler}/package.json`));
	execFileSync(process.execPath, [path.join(compilerRoot, "bin/tsc"), "-p", "tsconfig.json"], {
		cwd: getPackageRoot(repository, name),
		stdio: "pipe",
		timeout: 15000,
	});
}

/**
 * Reads the checked-in analyzer settings without deriving policy from the test harness.
 * @param repository - Temporary workspace.
 * @param name - Package basename.
 * @returns Fixture-owned configuration, validated by the public analysis entrypoint.
 */
export function getRepositoryConfiguration(
	repository: TestRepository,
	name: string,
): Configuration {
	return JSON.parse(
		readFileSync(path.join(getPackageRoot(repository, name), "analyzer.json"), "utf8"),
	) as Configuration;
}

/**
 * Generates reports independently of the full portable model.
 * @param analysis - Completed public analysis.
 * @returns Deterministic reports for all configured surfaces and selections.
 */
export function generateRepositoryReports(analysis: APIAnalysis): Record<string, string> {
	const reports: Record<string, string> = {};
	for (const surface of analysis.configuration.entrypoints) {
		for (const selection of [
			{
				name: "complete",
				releaseLevels: [
					ReleaseLevel.Public,
					ReleaseLevel.Beta,
					ReleaseLevel.Alpha,
					ReleaseLevel.Internal,
				],
			},
			{ name: "public", releaseLevels: [ReleaseLevel.Public] },
		]) {
			const result = analysis.generateReport(surface.name, selection);
			assert(result.ok, JSON.stringify(result));
			reports[`${surface.name === "." ? "root" : surface.name.slice(2)}.${selection.name}`] =
				result.value;
		}
	}
	return reports;
}

/**
 * Analyzes packages in dependency order and installs their models for downstream analysis.
 * @param repository - Temporary layout with compiled inputs.
 * @returns Detached outputs for every package, in dependency order.
 */
export async function analyzeRepository(
	repository: TestRepository,
): Promise<readonly RepositoryArtifact[]> {
	const artifacts: RepositoryArtifact[] = [];
	for (const name of repository.packages) {
		artifacts.push(await analyzeRepositoryPackage(repository, name));
	}
	return artifacts;
}

/**
 * Analyzes and installs one model, including during dependency-first recovery.
 * @param repository - Temporary workspace.
 * @param name - Package basename.
 * @returns Completed analysis and its exact outputs.
 */
export async function analyzeRepositoryPackage(
	repository: TestRepository,
	name: string,
): Promise<RepositoryArtifact> {
	const result = await analyzeAPIs(
		getRepositoryConfiguration(repository, name),
		getPackageRoot(repository, name),
	);
	assert(result.ok, JSON.stringify(result));
	const reports = generateRepositoryReports(result.value);
	const text = result.value.generateModel();
	const decoded = decodeDependencyModel(text, `@scenario/${name}`);
	assert(decoded.ok, JSON.stringify(decoded));
	writeFileSync(path.join(getPackageRoot(repository, name), "api.json"), text);
	return { name, analysis: result.value, reports, text, model: decoded.value };
}

/**
 * Removes fixture inputs and verifies that completed analyses remain reusable.
 * @param repository - Disposable layout.
 * @param artifacts - Outputs obtained before removing inputs.
 */
export function verifyDetachedOutputs(
	repository: TestRepository,
	artifacts: readonly RepositoryArtifact[],
): void {
	for (const name of repository.packages) {
		const root = getPackageRoot(repository, name);
		rmSync(path.join(root, "src"), { recursive: true });
		rmSync(path.join(root, "lib"), { recursive: true });
	}
	for (const artifact of artifacts) {
		const statistics = artifact.analysis.getStatistics();
		assert.equal(artifact.analysis.generateModel(), artifact.text);
		assert.deepEqual(generateRepositoryReports(artifact.analysis), artifact.reports);
		assert.deepEqual(artifact.analysis.getStatistics(), statistics);
	}
}

/**
 * Reads artifacts in a fresh process that forbids compiler-backed imports.
 * @param artifacts - Only serialized model contents are supplied to the reader.
 * @returns Exact test-owned documentation index.
 */
export function readRepositoryIndex(artifacts: readonly RepositoryArtifact[]): string {
	return execFileSync(
		process.execPath,
		[fileURLToPath(new URL("repositoryReader.js", import.meta.url))],
		{
			cwd: tmpdir(),
			input: JSON.stringify(
				artifacts.map((artifact) => ({
					packageName: artifact.model.packageName,
					text: artifact.text,
				})),
			),
			encoding: "utf8",
			maxBuffer: 16 * 1024 * 1024,
			timeout: 15000,
		},
	);
}

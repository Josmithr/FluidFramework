import assert from "node:assert/strict";
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { describe, it } from "mocha";
import { assertSnapshot } from "./snapshotUtils.js";
import {
	analyzeRepository,
	compilePackage,
	createRepository,
	getPackageRoot,
	readRepositoryIndex,
	verifyDetachedOutputs,
} from "./repositoryUtils.js";
import { repositoryScenarios } from "./repositoryScenarios.js";
import { analyzeAPIs, ReleaseLevel, type Configuration } from "../index.js";
import { verifyRepositorySemantics } from "./repositoryAssertions.js";

describe("Repository end-to-end workflows", () => {
	for (const compiler of ["typescript6", "typescript"] as const) {
		for (const scenario of repositoryScenarios) {
			it(`compares all ${scenario} repository artifacts with ${compiler}`, async () => {
				const repository = createRepository(compiler, scenario);
				try {
					for (const name of repository.packages) {
						compilePackage(repository, name);
					}
					const artifacts = await analyzeRepository(repository);
					verifyRepositorySemantics(scenario, artifacts);
					verifyDetachedOutputs(repository, artifacts);
					const index = readRepositoryIndex(artifacts);
					const snapshots = new URL(
						`../../src/test/snapshots/repository/${scenario}/${scenario === "primary" ? `${compiler}/` : ""}`,
						import.meta.url,
					);
					for (const artifact of artifacts) {
						assertSnapshot(artifact.text, `${artifact.name}.api.json`, snapshots);
						for (const [selection, report] of Object.entries(artifact.reports)) {
							assertSnapshot(report, `${artifact.name}.${selection}.md`, snapshots);
						}
					}
					assertSnapshot(index, "index.json", snapshots);
				} finally {
					rmSync(repository.directory, { recursive: true, force: true });
				}
			});
		}

		// TODO: Add successful baselines when inherited non-public members can be reported.
		it(`rejects inherited non-public members with ${compiler}`, async () => {
			const repository = createRepository(compiler, "primary");
			try {
				compilePackage(repository, "primary");
				const root = getPackageRoot(repository, "primary");
				const configuration = JSON.parse(
					readFileSync(path.join(root, "analyzer.variants.json"), "utf8"),
				) as Configuration;
				const result = await analyzeAPIs(configuration, root);
				assert(result.ok, JSON.stringify(result));
				assert.throws(
					() =>
						result.value.generateReport("./private", {
							name: "public",
							releaseLevels: [ReleaseLevel.Public],
						}),
					/not supported|unsupported syntax/,
				);
			} finally {
				rmSync(repository.directory, { recursive: true, force: true });
			}
		});
	}
});

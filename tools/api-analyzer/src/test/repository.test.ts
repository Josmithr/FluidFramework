import { rmSync } from "node:fs";
import { describe, it } from "mocha";
import { assertSnapshot } from "./snapshotUtils.js";
import {
	analyzeRepository,
	compilePackage,
	createRepository,
	readRepositoryIndex,
	verifyDetachedOutputs,
} from "./repositoryUtils.js";
import { repositoryScenarios } from "./repositoryScenarios.js";
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
	}
});

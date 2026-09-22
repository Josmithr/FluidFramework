import assert from "node:assert/strict";
import { ReleaseLevel } from "../index.js";
import { decodeDependencyModels } from "../model.js";
import type { RepositoryArtifact } from "./repositoryUtils.js";
import { primaryExports } from "./repositoryScenarios.js";

/**
 * Checks identities and source-free contracts independently of accepted text snapshots.
 * @param scenario - Fixture workspace name.
 * @param artifacts - Dependency-first outputs.
 */
export function verifyRepositorySemantics(
	scenario: string,
	artifacts: readonly RepositoryArtifact[],
): void {
	const inputs = artifacts.map((artifact) => ({
		packageName: artifact.model.packageName,
		text: artifact.text,
	}));
	const decoded = decodeDependencyModels(inputs);
	assert(decoded.ok, JSON.stringify(decoded));
	assert.deepEqual(decodeDependencyModels([...inputs].reverse()), decoded);
	for (const artifact of artifacts) {
		assert.equal(artifact.model.version, 1);
		assert.equal(artifact.model.identityVersion, 1);
		assert(
			artifact.model.apis.every(
				(api) => api.documentation.packageName === api.origin.packageName,
			),
		);
		for (const external of artifact.model.external) {
			assert(
				artifacts
					.find((candidate) => candidate.model.packageName === external.packageName)
					?.model.apis.some((api) => api.id === external.id) === true,
			);
		}
	}
	const first = artifacts[0];
	assert(first !== undefined);
	if (scenario === "independent") {
		assert.equal(artifacts.length, 2);
		assert(
			artifacts.every(
				(artifact) =>
					artifact.model.external.length === 0 && artifact.model.dependencyModels.length === 0,
			),
		);
		return;
	}
	if (scenario === "empty" || scenario === "overview") {
		assert.deepEqual(first.model.graph.surfaces, [{ name: ".", exports: [] }]);
		assert.deepEqual(first.model.apis, []);
		assert.equal(first.model.packageDocumentation !== undefined, scenario === "overview");
		assert.match(first.reports["root.public"] ?? "", /No selected exports/);
		return;
	}
	if (scenario === "primary") {
		verifyPrimaryArtifact(first);
	} else {
		verifyPackageRelationships(scenario, artifacts);
	}
}

/**
 * Checks the primary API-kind inventory and report selections.
 * @param artifact - Primary package outputs.
 */
function verifyPrimaryArtifact(artifact: RepositoryArtifact): void {
	const { model, analysis, reports } = artifact;
	const surface = model.graph.surfaces.find((current) => current.name === ".");
	assert(surface !== undefined);
	assert.deepEqual(
		surface.exports.map((entry) => entry.name).sort(),
		[...primaryExports].sort(),
	);
	assert.equal(
		surface.exports.find((entry) => entry.name === "identity")?.target,
		surface.exports.find((entry) => entry.name === "renamedIdentity")?.target,
	);
	assert.equal(surface.exports.find((entry) => entry.name === "StoreType")?.typeOnly, true);
	assert.equal(
		surface.exports.find((entry) => entry.name === "StoreType")?.target,
		surface.exports.find((entry) => entry.name === "Store")?.target,
	);
	assert.deepEqual(model.external, []);
	assert.deepEqual(model.dependencyModels, []);
	assert(model.graph.declarations.some((declaration) => declaration.name === "Support"));
	assert(!model.exports.some((entry) => entry.path[0] === "Support"));
	assert(model.packageDocumentation?.documentation.includes("Primary API inventory") === true);
	for (const kind of [
		"FunctionDeclaration",
		"InterfaceDeclaration",
		"ClassDeclaration",
		"TypeAliasDeclaration",
		"VariableDeclaration",
		"EnumDeclaration",
		"ModuleDeclaration",
	]) {
		assert(
			model.graph.declarations.some((declaration) =>
				declaration.sources.some((source) => source.kind === kind),
			),
			kind,
		);
	}
	const box = model.graph.declarations.find((declaration) => declaration.name === "TextBox");
	assert.equal(box?.members.find((member) => member.name === "value")?.type, "string");
	const merged = model.graph.declarations.find((declaration) => declaration.name === "Merged");
	assert.deepEqual(merged?.members.map((member) => member.name).sort(), ["first", "second"]);
	assert.equal(
		model.apis.filter((api) => api.name === "format" && api.parameters !== undefined).length,
		2,
	);
	assert.doesNotMatch(reports["root.public"] ?? "", /export function (experiment|hidden)/);
	assert.match(reports["root.complete"] ?? "", /export function hidden/);
	for (const selection of [
		{ name: "tagged", releaseLevels: [ReleaseLevel.Public], requireTags: ["@exampleTag"] },
		{ name: "none", releaseLevels: [ReleaseLevel.Internal], requireTags: ["@exampleTag"] },
	]) {
		const report = analysis.generateReport(".", selection);
		assert(report.ok, JSON.stringify(report));
		if (selection.name === "none") {
			assert.match(report.value, /No selected exports/);
		} else {
			assert.match(report.value, /identity/);
			assert.doesNotMatch(report.value, /export class Store/);
		}
	}
	assert.equal(analysis.generateModel(), artifact.text);
}

/**
 * Checks cross-package aliases, substitutions, and original documentation targets.
 * @param scenario - Multi-package fixture name.
 * @param artifacts - Dependency-first outputs.
 */
function verifyPackageRelationships(
	scenario: string,
	artifacts: readonly RepositoryArtifact[],
): void {
	const core = artifacts.find((artifact) => artifact.name === "core");
	assert(core !== undefined);
	const source = core.model.apis.find((api) => api.name === "source");
	const target = core.model.apis.find((api) => api.name === "target");
	assert(source !== undefined && target !== undefined);
	assert.equal(source.documentation.links[0]?.targetSignature, target.id);
	assert.equal(target.metadata.releaseLevel, ReleaseLevel.Beta);
	if (scenario === "dual") {
		const consumer = artifacts.find((artifact) => artifact.name === "consumer");
		assert(consumer !== undefined);
		assert.deepEqual(
			consumer.model.graph.surfaces[0]?.exports.map((entry) => entry.name),
			["Implementation", "consumer"],
		);
		const inherited = consumer.model.apis.find((api) => api.name === "consumer");
		assert(
			inherited?.documentation.documentation?.includes("Core source documentation") === true,
		);
		assert.equal(inherited?.documentation.links[0]?.targetSignature, target.id);
		const member = consumer.model.graph.declarations
			.find((declaration) => declaration.name === "Implementation")
			?.members.find((current) => current.name === "convert");
		assert.equal(
			member?.signatures[0]?.effective.callSignatureText,
			"(value: string): string;",
		);
		assert(
			consumer.model.apis.some(
				(api) => api.documentation.documentation?.includes("Converts a value") === true,
			),
		);
		return;
	}
	const facade = artifacts.find((artifact) => artifact.name === "facade");
	assert(facade !== undefined);
	const alias = facade.model.exports.find(
		(entry) =>
			entry.path.join(".") === (scenario === "complex" ? "facadeAlias" : "renamedSource"),
	);
	assert.deepEqual(alias?.items, [source.id]);
	assert(!facade.model.apis.some((api) => api.id === source.id));
	if (scenario === "reexports") {
		assert.equal(
			facade.model.exports.find((entry) => entry.path.join(".") === "SourceType")?.typeOnly,
			true,
		);
		assert.deepEqual(
			facade.model.exports.find((entry) => entry.path.join(".") === "SourceType")?.items,
			[source.id],
		);
		return;
	}
	const service = artifacts.find((artifact) => artifact.name === "service");
	assert(service !== undefined);
	assert(
		facade.model.dependencyModels.some(
			(dependency) => dependency.packageName === "@scenario/unused",
		),
	);
	assert(
		!facade.model.external.some((external) => external.packageName === "@scenario/unused"),
	);
	const operation = service.model.apis.find((api) => api.name === "operation");
	assert.equal(operation?.documentation.links[0]?.targetSignature, target.id);
	assert(
		operation?.documentation.sections?.some(
			(section) => section.packageName === "@scenario/core",
		) === true,
	);
	const contract = core.model.graph.declarations.find(
		(declaration) => declaration.name === "Contract",
	);
	assert(contract !== undefined);
	for (const name of ["domain", "adapter"]) {
		const branch = artifacts.find((artifact) => artifact.name === name);
		assert(
			branch?.model.graph.declarations.some((declaration) =>
				declaration.baseDeclarations.includes(contract.id),
			) === true,
		);
	}
	assert.equal(
		service.model.graph.declarations
			.find((declaration) => declaration.name === "Service")
			?.members.find((member) => member.name === "convert")?.signatures[0]?.effective
			.callSignatureText,
		"(value: string): string;",
	);
}

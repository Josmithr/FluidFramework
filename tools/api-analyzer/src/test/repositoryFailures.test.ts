import assert from "node:assert/strict";
import { cpSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "mocha";
import { analyzeAPIs, DiagnosticCode, type Configuration, type Result } from "../index.js";
import { decodeDependencyModel, decodeDependencyModels } from "../model.js";
import {
	analyzeRepository,
	analyzeRepositoryPackage,
	compilePackage,
	createRepository,
	getPackageRoot,
	getRepositoryConfiguration,
	readRepositoryIndex,
	verifyDetachedOutputs,
} from "./repositoryUtils.js";

/**
 * Requires a diagnostic result rather than an exception or partially usable output.
 * @param result - Public API result under test.
 * @param code - Expected diagnostic category.
 */
function assertFailure(result: Result<unknown>, code = DiagnosticCode.DependencyModel): void {
	assert(!result.ok);
	assert.equal(result.diagnostics[0]?.code, code);
	assert.equal("value" in result, false);
}

describe("Repository failure and recovery workflows", () => {
	it("rejects inconsistent API roles, owners, provenance, and member identities", () => {
		const original = decodeDependencyModel(
			readFileSync(
				new URL(
					"../../src/test/snapshots/repository/primary/typescript/primary.api.json",
					import.meta.url,
				),
				"utf8",
			),
			"@scenario/primary",
		);
		assert(original.ok, JSON.stringify(original));
		const model = original.value;
		const format = model.graph.declarations.find((item) => item.name === "format");
		const unrelated = model.graph.declarations.find((item) => item.name === "default");
		const store = model.graph.declarations.find((item) => item.name === "Store");
		assert(format !== undefined && unrelated !== undefined && store?.container !== undefined);
		const container = store.container;
		const getter = container.declaredMembers.find(
			(member) => member.source.kind === "GetAccessor",
		);
		assert(getter !== undefined);
		const variants = [
			{
				...model,
				apis: model.apis.map((api) => {
					const {
						parameters: _parameters,
						typeParameters: _typeParameters,
						...withoutParameters
					} = api;
					return api.id === format.signatures[0]?.id ? withoutParameters : api;
				}),
			},
			{
				...model,
				apis: model.apis.map((api) =>
					api.name === "isText" ? { ...api, declarationId: unrelated.id } : api,
				),
			},
			{
				...model,
				apis: model.apis.map((api) => ({
					...api,
					documentation: { ...api.documentation, packageName: "nonexistent-package" },
				})),
			},
			{
				...model,
				apis: model.apis.map((api) => ({
					...api,
					documentation: {
						...api.documentation,
						sections: api.documentation.sections.map((section) => ({
							...section,
							packageName: "nonexistent-package",
						})),
					},
				})),
			},
			{
				...model,
				graph: {
					...model.graph,
					declarations: model.graph.declarations.map((declaration) =>
						declaration.id === store.id
							? {
									...declaration,
									container: {
										...container,
										declaredMembers: [...container.declaredMembers, getter],
									},
								}
							: declaration,
					),
				},
			},
		];
		for (const [index, variant] of variants.entries()) {
			const result = decodeDependencyModels([
				{ packageName: model.packageName, text: JSON.stringify(variant) },
			]);
			assert(!result.ok, `Corruption case ${index} must fail`);
			assertFailure(result);
		}
	});

	it("rejects malformed and inconsistent artifact sets without source access", () => {
		const inputs = ["core", "domain", "adapter", "unused", "service", "facade"].map(
			(name) => ({
				packageName: `@scenario/${name}`,
				text: readFileSync(
					new URL(
						`../../src/test/snapshots/repository/complex/${name}.api.json`,
						import.meta.url,
					),
					"utf8",
				),
			}),
		);
		const result = decodeDependencyModels(inputs);
		assert(result.ok, JSON.stringify(result));
		const core = result.value.find((model) => model.packageName === "@scenario/core");
		const facade = result.value.find((model) => model.packageName === "@scenario/facade");
		assert(core !== undefined && facade !== undefined);
		for (const selected of [
			inputs.slice(1),
			inputs.filter((input) => input.packageName !== "@scenario/unused"),
			[...inputs, ...inputs],
		]) {
			assertFailure(decodeDependencyModels(selected));
			assertFailure(decodeDependencyModels([...selected].reverse()));
		}
		for (const text of [
			"{",
			JSON.stringify({ ...core, packageName: "wrong" }),
			JSON.stringify({ ...core, version: 99 }),
			JSON.stringify({ ...core, identityVersion: 99 }),
		]) {
			assertFailure(decodeDependencyModel(text, core.packageName));
		}
		const wrongOwner = {
			...facade,
			external: facade.external.map((external) => ({
				...external,
				packageName: "@scenario/unused",
			})),
		};
		assertFailure(
			decodeDependencyModels(
				inputs.map((input) =>
					input.packageName === facade.packageName
						? { ...input, text: JSON.stringify(wrongOwner) }
						: input,
				),
			),
		);
		const badLink = {
			...core,
			apis: core.apis.map((api) => ({
				...api,
				documentation: {
					...api.documentation,
					links: api.documentation.links.map((link) => ({
						...link,
						target: api.declarationId,
					})),
				},
			})),
		};
		assertFailure(
			decodeDependencyModels(
				inputs.map((input) =>
					input.packageName === core.packageName
						? { ...input, text: JSON.stringify(badLink) }
						: input,
				),
			),
		);
		const badExcerpt = JSON.stringify(facade, (_key: string, value: unknown): unknown => {
			if (
				value !== null &&
				typeof value === "object" &&
				"kind" in value &&
				value.kind === "Reference"
			) {
				return { ...value, target: "missing-declaration" };
			}
			return value;
		});
		assertFailure(decodeDependencyModel(badExcerpt, facade.packageName));
		const formatted = inputs.map((input) => ({
			...input,
			text: JSON.stringify(
				JSON.parse(input.text),
				(_key: string, value: unknown): unknown =>
					value !== null && typeof value === "object" && !Array.isArray(value)
						? Object.fromEntries(Object.entries(value).reverse())
						: value,
				4,
			),
		}));
		assert.deepEqual(decodeDependencyModels(formatted), result);
		const reordered = JSON.stringify({ ...core, apis: [...core.apis].reverse() });
		assert(decodeDependencyModel(reordered, core.packageName).ok);
		assertFailure(
			decodeDependencyModels(
				inputs.map((input) =>
					input.packageName === core.packageName ? { ...input, text: reordered } : input,
				),
			),
		);
	});

	it("rejects missing and stale transitive models and recovers in dependency order", async () => {
		const repository = createRepository("typescript", "complex");
		try {
			for (const name of repository.packages) {
				compilePackage(repository, name);
			}
			const artifacts = await analyzeRepository(repository);
			const facade = artifacts.find((artifact) => artifact.name === "facade");
			assert(facade !== undefined);
			const root = getPackageRoot(repository, "facade");
			const explicit = JSON.parse(
				readFileSync(path.join(root, "analyzer.explicit.json"), "utf8"),
			) as Configuration;
			const explicitResult = await analyzeAPIs(explicit, root);
			assert(explicitResult.ok, JSON.stringify(explicitResult));
			assert.equal(explicitResult.value.generateModel(), facade.text);
			const configuration = getRepositoryConfiguration(repository, "facade");
			const unusedFile = path.join(getPackageRoot(repository, "unused"), "api.json");
			const unusedText = readFileSync(unusedFile, "utf8");
			rmSync(unusedFile);
			assertFailure(await analyzeAPIs(configuration, root));
			writeFileSync(unusedFile, unusedText);
			cpSync(
				path.join(repository.directory, "variants/core-updated.ts"),
				path.join(getPackageRoot(repository, "core"), "src/index.ts"),
			);
			compilePackage(repository, "core");
			assertFailure(await analyzeAPIs(configuration, root));
			const core = await analyzeRepositoryPackage(repository, "core");
			const inputs = artifacts.map((artifact) => ({
				packageName: artifact.model.packageName,
				text: artifact.name === "core" ? core.text : artifact.text,
			}));
			assertFailure(decodeDependencyModels(inputs));
			assertFailure(await analyzeAPIs(configuration, root));
			const fresh = await analyzeRepository(repository);
			const service = fresh.find((artifact) => artifact.name === "service");
			assert(
				service?.model.apis
					.find((api) => api.name === "operation")
					?.documentation.documentation?.includes("Updated core documentation") === true,
			);
			verifyDetachedOutputs(repository, fresh);
			assert.match(readRepositoryIndex(fresh), /Updated core documentation/);
		} finally {
			rmSync(repository.directory, { recursive: true, force: true });
		}
	});

	it("validates APIs that a public-only report would exclude", async () => {
		const repository = createRepository("typescript", "dual");
		try {
			const root = getPackageRoot(repository, "core");
			cpSync(
				path.join(repository.directory, "variants/core-invalid-link.ts"),
				path.join(root, "src/index.ts"),
			);
			compilePackage(repository, "core");
			assertFailure(
				await analyzeAPIs(getRepositoryConfiguration(repository, "core"), root),
				DiagnosticCode.DocumentationLinkPolicy,
			);
		} finally {
			rmSync(repository.directory, { recursive: true, force: true });
		}
	});
});

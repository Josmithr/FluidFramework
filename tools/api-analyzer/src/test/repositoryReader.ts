/*
 * Source-free child process for repository tests.
 * Receives model text on stdin, rejects compiler/analysis imports, and prints a documentation index.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { z } from "zod";

registerHooks({
	resolve(specifier, context, next) {
		assert(
			!specifier.startsWith("typescript") && !specifier.includes("/analysis/"),
			specifier,
		);
		return next(specifier, context);
	},
});
const { decodeDependencyModels } = await import("../model.js");
const inputs = z
	.array(z.object({ packageName: z.string(), text: z.string() }))
	.parse(JSON.parse(readFileSync(0, "utf8")));
const result = decodeDependencyModels(inputs);
assert(result.ok, JSON.stringify(result));
assert.deepEqual(decodeDependencyModels([...inputs].reverse()), result);
const apis = new Map(
	result.value.flatMap((model) => model.apis.map((api) => [api.id, api] as const)),
);
const owners = new Map(
	result.value.flatMap((model) =>
		model.apis.map((api) => [api.id, model.packageName] as const),
	),
);
const index = result.value.map((model) => ({
	packageName: model.packageName,
	packageDocumentation: model.packageDocumentation?.documentation,
	surfaces: model.graph.surfaces.map((surface) => ({
		name: surface.name,
		exports: surface.exports.map((entry) => entry.name),
	})),
	exports: model.exports.map((entry) => ({
		entrypoint: entry.entrypoint,
		path: entry.path,
		typeOnly: entry.typeOnly,
		items: entry.items.map((id) => {
			const api = apis.get(id);
			assert(api !== undefined, id);
			return {
				name: api.name,
				owner: owners.get(api.id),
				sourcePackage: api.origin.packageName,
				documentation: api.documentation.documentation,
				sections: api.documentation.sections,
				links: api.documentation.links.map((link) => {
					const target = apis.get(link.targetSignature);
					assert(target !== undefined, link.targetSignature);
					assert.equal(target.declarationId, link.target);
					return { name: target.name, owner: owners.get(target.id) };
				}),
			};
		}),
	})),
}));
process.stdout.write(`${JSON.stringify(index, undefined, 2)}\n`);

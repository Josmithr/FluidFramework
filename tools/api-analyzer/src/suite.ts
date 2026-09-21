import { existsSync, readFileSync, realpathSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import type { EffectiveConfiguration } from "./analysis-types/configuration.js";
import type { DependencyModel } from "./analysis-types/dependencyModel.js";
import { DiagnosticCode, reportFailure, type Result } from "./analysis-types/result.js";
import { decodeDependencyModel } from "./model-generation/dependencyModel.js";
import { validateDependencyModels } from "./model-generation/modelSet.js";
import { freezeData } from "./utilities/freezeData.js";

const manifestSchema = z.object({
	name: z.string().min(1),
	version: z.string().optional(),
	dependencies: z.record(z.string(), z.string()).optional(),
	peerDependencies: z.record(z.string(), z.string()).optional(),
});

/**
 * Schema-validated package metadata needed for dependency discovery.
 */
type DependencyManifest = z.infer<typeof manifestSchema>;

/**
 * A selected model and the canonical installation that owns it.
 */
interface SelectedDependency {
	/**
	 * Canonical package directory used to detect multiple installations with the same name.
	 */
	readonly root: string;

	/**
	 * Decoded model whose recorded inputs match the installed files.
	 */
	readonly model: DependencyModel;
}

/**
 * Discovers installed dependencies and reads every selected model at the root I/O boundary.
 *
 * @param configuration - Effective package and suite settings.
 * @returns Validated dependency models or availability, identity, and compatibility diagnostics.
 * @throws On unexpected filesystem failures, including permission errors.
 */
export function loadDependencyModels(
	configuration: EffectiveConfiguration,
): Result<readonly DependencyModel[]> {
	const suite = configuration.suite;
	if (suite === undefined) {
		// Analysis without a suite must not read dependency manifests or model files.
		return { ok: true, value: [] };
	}

	// Start from the analyzed package to discover dependencies, but do not load its own model.
	const pending = [configuration.packageRoot];
	const visited = new Set<string>();
	const selected = new Map<string, SelectedDependency>();
	const matched = new Set<string>();
	while (pending.length > 0) {
		const root = pending.pop();
		if (root === undefined) {
			break;
		}

		// Different symlink paths can reach the same installation. Canonical paths also stop cycles.
		const canonical = realpathSync(root);
		if (visited.has(canonical)) {
			continue;
		}
		visited.add(canonical);
		const manifest = readDependencyManifest(root);
		if (!manifest.ok) {
			return manifest;
		}
		const name = manifest.value.name;
		if (
			root !== configuration.packageRoot &&
			suite.packages.some((pattern) => path.posix.matchesGlob(name, pattern))
		) {
			// One package can satisfy multiple selectors. Record each match for the final coverage check.
			for (const pattern of suite.packages) {
				if (path.posix.matchesGlob(name, pattern)) {
					matched.add(pattern);
				}
			}

			// Model references use package names, so two selected installations would be ambiguous.
			const previous = selected.get(name);
			if (previous && previous.root !== canonical) {
				return reportFailure(
					DiagnosticCode.DependencyModel,
					`Dependency ${name}: multiple installed package roots match the suite. Use one unambiguous dependency version before analysis.`,
				);
			}

			// Validate every selected model, even when no analyzed API references the package.
			const decoded = loadSelectedModel(root, name, suite.modelFile);
			if (!decoded.ok) {
				return decoded;
			}
			selected.set(name, { root: canonical, model: decoded.value });
		}

		// Unselected packages can lead to selected transitive dependencies, so continue through them.
		// Reverse the sorted names because the stack pops the last entry; this makes discovery deterministic.
		for (const dependency of Object.keys({
			...manifest.value.dependencies,
			...manifest.value.peerDependencies,
		})
			.sort()
			.reverse()) {
			// Reject path components that could make installation lookup escape the package-name boundary.
			if (
				!/^(?:@[\w.-]+\/)?[\w.-]+$/.test(dependency) ||
				dependency === "." ||
				dependency === ".."
			) {
				return reportFailure(
					DiagnosticCode.DependencyModel,
					`Package ${name}: invalid dependency package name ${dependency}.`,
				);
			}
			const dependencyRoot = findDependencyRoot(root, dependency);
			if (dependencyRoot !== undefined) {
				pending.push(dependencyRoot);
			} else if (
				suite.packages.some((pattern) => path.posix.matchesGlob(dependency, pattern))
			) {
				// Missing unselected packages do not block discovery, but selected packages are required inputs.
				return reportFailure(
					DiagnosticCode.DependencyModel,
					`Dependency ${dependency}: selected package is not installed. Install and build it before analysis.`,
				);
			}
		}
	}

	// Reject unmatched selectors instead of silently analyzing a smaller suite than requested.
	const unmatched = suite.packages.find((pattern) => !matched.has(pattern));
	if (unmatched !== undefined) {
		return reportFailure(
			DiagnosticCode.DependencyModel,
			`Suite selector ${unmatched} matches no installed direct, transitive, or peer dependency.`,
		);
	}

	// Cross-model checks need the complete selection and must not depend on discovery order.
	// Current source files alone do not prove freshness: inherited documentation can come from stale model inputs.
	const models = [...selected.values()].map((entry) => entry.model);
	const fresh = validateDependencyModels(models);
	if (!fresh.ok) {
		return fresh;
	}

	// Keep the result immutable and its order independent of the installed dependency graph.
	return freezeData({
		ok: true,
		value: models.sort((left, right) =>
			left.packageName < right.packageName ? -1 : left.packageName > right.packageName ? 1 : 0,
		),
	});
}

/**
 * Reads only the package metadata needed for dependency traversal.
 * @param root - Installed package root.
 * @returns Parsed dependency metadata or a missing, malformed, or invalid manifest diagnostic.
 * @throws On filesystem errors other than a missing manifest.
 */
function readDependencyManifest(root: string): Result<DependencyManifest> {
	let input: unknown;
	try {
		input = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
	} catch (error) {
		if (
			error instanceof SyntaxError ||
			(error instanceof Error && "code" in error && error.code === "ENOENT")
		) {
			return reportFailure(
				DiagnosticCode.DependencyModel,
				`Package ${root}: a valid package.json is required to discover the configured suite.`,
			);
		}
		throw error;
	}
	const manifest = manifestSchema.safeParse(input);
	return manifest.success
		? { ok: true, value: manifest.data }
		: reportFailure(
				DiagnosticCode.DependencyModel,
				`Package ${root}: invalid dependency manifest: ${manifest.error.message}`,
			);
}

/**
 * Loads and validates an artifact before checking its installed source inputs.
 * @param root - Selected package installation.
 * @param name - Expected package identity.
 * @param modelFile - Configured package-relative artifact path.
 * @returns A compatible model or the first artifact or freshness diagnostic.
 * @throws On unexpected filesystem errors; permission failures are not reported as missing files.
 */
function loadSelectedModel(
	root: string,
	name: string,
	modelFile: string,
): Result<DependencyModel> {
	let text: string;
	const file = path.join(root, modelFile);
	try {
		text = readFileSync(file, "utf8");
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			return reportFailure(
				DiagnosticCode.DependencyModel,
				`Dependency ${name}: model is missing at ${file}. Build the dependency and generate its model before analysis, even when unused.`,
			);
		}
		throw error;
	}
	const decoded = decodeDependencyModel(text, name);
	if (!decoded.ok) {
		return decoded;
	}
	const fresh = validateInstalledInputs(root, decoded.value);
	return fresh.ok ? decoded : fresh;
}

/**
 * Checks that each recorded model input still matches the installed file text.
 * @param root - Selected package installation.
 * @param model - Decoded model with validated package-relative input paths.
 * @returns Success or the first missing or changed input diagnostic.
 * @throws On unexpected filesystem failures.
 */
function validateInstalledInputs(root: string, model: DependencyModel): Result {
	for (const fingerprint of model.inputFiles) {
		let declaration: string;
		try {
			declaration = readFileSync(path.join(root, fingerprint.file), "utf8");
		} catch (error) {
			if (error instanceof Error && "code" in error && error.code === "ENOENT") {
				return reportFailure(
					DiagnosticCode.DependencyModel,
					`Dependency ${model.packageName}: analyzed input ${fingerprint.file} is missing. Rebuild and regenerate its model.`,
				);
			}
			throw error;
		}

		// Hash the same UTF-8 text as extraction. This checks staleness, not semantic equivalence or authenticity.
		if (createHash("sha256").update(declaration).digest("hex") !== fingerprint.sha256) {
			return reportFailure(
				DiagnosticCode.DependencyModel,
				`Dependency ${model.packageName}: model is stale for ${fingerprint.file}. Regenerate it from the installed declarations before analysis.`,
			);
		}
	}
	return { ok: true };
}

/**
 * Resolves a dependency installation without relying on package.json subpath exports.
 *
 * @param from - Package directory that declares the dependency.
 * @param name - Validated npm package name.
 * @returns Installed package directory, or undefined when unavailable.
 */
function findDependencyRoot(from: string, name: string): string | undefined {
	let current = from;
	while (true) {
		const candidate = path.join(current, "node_modules", name);
		if (existsSync(path.join(candidate, "package.json"))) {
			return candidate;
		}
		const parent = path.dirname(current);
		if (parent === current) {
			return undefined;
		}
		current = parent;
	}
}

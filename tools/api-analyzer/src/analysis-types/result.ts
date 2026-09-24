/**
 * Supported diagnostic codes and their corrective actions.
 *
 * @remarks
 * String values identify diagnostic categories in serialized results.
 * Failure codes describe invalid user inputs, configuration, or caller actions.
 * Internal assertions and unexpected operational errors propagate as exceptions.
 * {@link DiagnosticCode.MemberExpansionIncomplete}
 * describes a limitation in otherwise successful analysis facts.
 * Diagnostic messages provide details specific to the affected input.
 * @public
 */
// TODO: split this into separate types for separate conceptual operations:
// - Configuration validation
// - Documentation parsing (including reference validation)
// - Model generation
// - Report generation
// - Roll-up generation
export enum DiagnosticCode {
	/**
	 * Package documentation is duplicated, misplaced, or contains an invalid package-level tag combination.
	 *
	 * @remarks
	 * Keep one leading package documentation comment in the analyzed package, separate from API-item metadata.
	 */
	PackageDocumentationInvalid = "package-documentation-invalid",

	/**
	 * The configured package-documentation requirement is enabled but no package comment was found.
	 *
	 * @remarks
	 * Add one leading package documentation comment to a package-owned compiler input or disable the requirement.
	 */
	PackageDocumentationMissing = "package-documentation-missing",

	/**
	 * A member or namespace export has a different release level from its declaring container.
	 *
	 * @remarks
	 * Use the container's release tag, omit the member tag to inherit it, or move the API outside the container.
	 * Container consistency cannot be disabled in V1.
	 */
	ClassificationContainerMismatch = "classification-container-mismatch",

	/**
	 * A selected dependency model is missing, incompatible, or structurally invalid.
	 */
	DependencyModel = "dependency-model",

	/**
	 * A configured declaration or documentation reference policy rejected an API relationship.
	 */
	ReferencePolicy = "reference-policy",

	/**
	 * Required release tags are absent, or custom modifier definitions are invalid.
	 *
	 * @remarks
	 * Custom modifier names must use valid TSDoc syntax and must not redefine standard or configured tags.
	 * Add release tags to untagged API link sources, targets, and receiving declarations.
	 * Missing internal classification records are assertion failures, not configuration diagnostics.
	 */
	DocumentationConfiguration = "documentation-configuration",

	/**
	 * A documentation comment failed TSDoc parsing.
	 *
	 * @remarks
	 * Correct the syntax or unsupported tags identified in the diagnostic message.
	 * Register custom modifier tags with the same options used for classification, binding, and resolution.
	 */
	DocumentationTsdoc = "documentation-tsdoc",

	/**
	 * A documentation inheritance reference or API link target failed validation.
	 *
	 * @remarks
	 * The target can be missing, or an overload selector can be absent or out of range.
	 * Parameter incompatibility also produces this diagnostic.
	 * Correct the reference, specify a numeric overload selector, or provide local documentation.
	 * Missing or inconsistent internal lookup facts and bindings are assertion failures.
	 */
	DocumentationReference = "documentation-reference",

	/**
	 * A non-internal API links to an internal API.
	 *
	 * @remarks
	 * Remove the link or correct the original release tags.
	 * Report selection does not change this policy. Public-to-beta links are permitted.
	 * Inherited links are checked against each receiving API's original release level.
	 */
	DocumentationLinkPolicy = "documentation-link-policy",

	/**
	 * A comment requests a documentation feature that is not supported.
	 *
	 * @remarks
	 * Use supported local declaration paths or package-qualified paths into selected dependency models.
	 * Disambiguate callable overloads with numeric selectors and class member collisions with static or instance selectors.
	 * See the diagnostic message for the specific limitation.
	 */
	DocumentationUnsupported = "documentation-unsupported",

	/**
	 * Explicit documentation inheritance contains a cycle.
	 *
	 * @remarks
	 * Remove a cyclic request or replace it with local descriptive documentation.
	 */
	DocumentationCycle = "documentation-cycle",

	/**
	 * A report request has an unknown entrypoint.
	 *
	 * @remarks
	 * Request an entrypoint listed in the analysis configuration.
	 * Invalid internal selections are assertion failures.
	 */
	ReportConfiguration = "report-configuration",

	/**
	 * Required analysis settings are missing or blank.
	 *
	 * @remarks
	 * Supply a non-blank package name and project path, and at least one entrypoint.
	 */
	ConfigurationRequired = "configuration-required",

	/**
	 * An entrypoint name or path is blank.
	 *
	 * @remarks
	 * Supply a non-blank name and path for each entrypoint.
	 */
	ConfigurationEntrypoint = "configuration-entrypoint",

	/**
	 * More than one configured entrypoint has the same name.
	 *
	 * @remarks
	 * Give each entrypoint a distinct name or remove duplicate entries.
	 */
	DuplicateEntrypoint = "duplicate-entrypoint",

	/**
	 * The working directory is not an absolute path.
	 *
	 * @remarks
	 * Pass an absolute working directory when resolving configuration.
	 */
	ConfigurationDirectory = "configuration-directory",

	/**
	 * Configuration inheritance contains a cycle.
	 *
	 * @remarks
	 * Remove the cyclic inheritance reference from the configuration's `extends` values.
	 */
	ConfigurationCycle = "configuration-cycle",

	/**
	 * A configuration property has an invalid value type.
	 *
	 * @remarks
	 * Use the diagnostic message to correct invalid settings or inherited configuration.
	 */
	ConfigurationInvalid = "configuration-invalid",

	/**
	 * The project configuration does not exist or the compiler cannot open the project.
	 *
	 * @remarks
	 * Check the configured project path and make sure the project configuration is available.
	 */
	ProjectMissing = "project-missing",

	/**
	 * The compiler reported diagnostics before fact extraction.
	 *
	 * @remarks
	 * Correct the compiler diagnostics included in the message, then analyze the project again.
	 */
	CompilerDiagnostics = "compiler-diagnostics",

	/**
	 * A configured entrypoint is not a source file in the compiler project.
	 *
	 * @remarks
	 * Check the entrypoint path and the project's file inclusion settings.
	 * Build the declaration inputs first if the project requires them.
	 */
	EntrypointMissing = "entrypoint-missing",

	/**
	 * The compiler cannot identify a module symbol for an entrypoint.
	 *
	 * @remarks
	 * Use an entrypoint that the compiler recognizes as a module, with imports or exports.
	 */
	EntrypointModule = "entrypoint-module",

	/**
	 * A declaration's effective member list is incomplete.
	 *
	 * @remarks
	 * This limitation does not fail analysis. Retain the original declaration.
	 * Do not present the extracted member list as complete.
	 */
	MemberExpansionIncomplete = "member-expansion-incomplete",

	/**
	 * Members owned outside the selected suite remain represented by their original type references.
	 */
	MemberExpansionOutsideSuite = "member-expansion-outside-suite",

	/**
	 * A custom modifier tag definition is invalid or duplicates an existing definition.
	 *
	 * @remarks
	 * Use valid TSDoc tag names, including the leading `@`.
	 * Do not redefine standard tags or repeat custom tag names.
	 */
	ClassificationConfiguration = "classification-configuration",

	/**
	 * The TSDoc parser reported a diagnostic for an input comment.
	 *
	 * @remarks
	 * Correct the comment using the parser details in the message, or configure a missing custom modifier tag.
	 * Set `rules.validateTsdocSyntax` to `false` only when parser diagnostics can be ignored.
	 * This setting does not suppress release-level checks.
	 */
	ClassificationTsdoc = "classification-tsdoc",

	/**
	 * A documentation input, merged API, or ordinary re-export declares conflicting release levels.
	 *
	 * @remarks
	 * Keep exactly one release tag per input and make explicit tags on merged parts agree.
	 * Ordinary re-export tags must match the source API's effective release level.
	 * Callable overloads may have independent release levels. This conflict check cannot be disabled.
	 */
	ClassificationReleaseConflict = "classification-release-conflict",

	/**
	 * A documentation input has no release level and the classification policy requires one.
	 *
	 * @remarks
	 * Add a release tag or set `rules.requireReleaseLevel` to `false` to permit untagged inputs.
	 * Module namespace export statements always require their own release tag.
	 */
	ClassificationReleaseMissing = "classification-release-missing",

	/**
	 * A selection has a blank name, an unsupported release level, or an unknown modifier filter.
	 *
	 * @remarks
	 * Supply a non-blank name, supported release levels, and modifier names from the classification's vocabulary.
	 */
	SelectionConfiguration = "selection-configuration",

	/**
	 * No accepted review baseline exists.
	 *
	 * @remarks
	 * Review the generated API and explicitly create the baseline after required checks pass.
	 * Checking alone never accepts generated text.
	 */
	BaselineMissing = "baseline-missing",

	/**
	 * Generated review text differs from the expected baseline.
	 *
	 * @remarks
	 * Review the differences. Correct unintended API changes or explicitly update the accepted baseline.
	 * For surface parity checks, correct the difference between surfaces rather than accepting it through a file update.
	 */
	BaselineStale = "baseline-stale",
}

/**
 * A diagnostic for a user-caused failure or an analysis capability limitation.
 *
 * @remarks
 * Can describe an operation failure or a limitation in otherwise successful analysis facts.
 * @sealed
 * @public
 */
export interface AnalyzerDiagnostic {
	/**
	 * The diagnostic category used for programmatic checks. See {@link DiagnosticCode} for corrective actions.
	 */
	readonly code: DiagnosticCode;

	/**
	 * A human-readable description of the problem and, when available, a corrective action.
	 */
	readonly message: string;
}

/**
 * The success discriminator shared by results with and without payloads.
 * @public
 */
interface SuccessStatus {
	/**
	 * Indicates that the operation succeeded.
	 */
	readonly ok: true;
}

/**
 * A successful operation with a required payload.
 *
 * @typeParam TValue - The produced value, including undefined when explicitly permitted.
 * @public
 */
export interface SuccessfulResult<TValue> extends SuccessStatus {
	/**
	 * The successful operation's value. The property remains present even when the value is undefined.
	 */
	readonly value: TValue;
}

/**
 * Failure diagnostics without a partial success value.
 * @public
 */
export interface FailedResult {
	/**
	 * Indicates that the operation failed.
	 */
	readonly ok: false;

	/**
	 * Diagnostics that explain the operation's failure.
	 */
	readonly diagnostics: readonly AnalyzerDiagnostic[];
}

/**
 * An operation's success or failure diagnostics.
 *
 * @remarks
 * Check `ok` before reading a payload or diagnostics. Failure results contain no partial value.
 * Omitting the type argument produces a success with no `value` property.
 * An explicit payload type, including undefined or a union, requires the `value` property.
 * The default `never` type represents no payload. Payload unions remain a single success branch.
 * Failure diagnostics describe user-caused issues, not internal assertions or unexpected operational errors.
 * This type alone does not guarantee that the value or result is frozen.
 *
 * @typeParam TValue - The value produced on success. Omit, or use `never`, for a value-less result.
 *
 * @example Validation and optional payloads
 * These declarations describe results returned by library operations.
 * Validation success has no payload. An explicitly optional payload retains its property.
 *
 * ```typescript
 * declare const validated: Result;
 * declare const found: Result<string | undefined>;
 * ```
 * @sealed
 * @public
 */
export type Result<TValue = never> =
	| FailedResult
	| ([TValue] extends [never] ? SuccessStatus : SuccessfulResult<TValue>);

/**
 * Constructs a frozen failure result with one diagnostic.
 *
 * @param code - The diagnostic category used for programmatic checks.
 * @param message - A description of the failure and any corrective action.
 * @returns A failure result with a frozen diagnostic and diagnostic array.
 * This branch can be returned from both value-bearing and value-less operations.
 */
export function reportFailure(code: DiagnosticCode, message: string): FailedResult {
	return Object.freeze({
		ok: false,
		diagnostics: Object.freeze([Object.freeze({ code, message })]),
	});
}

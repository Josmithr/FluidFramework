# TODOs

Stage 2 is accepted on 2026-09-20.
These investigations and the [follow-up tracker](docs/api-extractor-replacement-follow-ups.md) are scheduled after the remaining library implementation.
Required Stage 3 portable models and Stage 4 declaration rollups remain in the [implementation plan](docs/api-extractor-replacement-implementation-plan.md).

## Audit diagnostic messages

We should audit our diagnostic messages and ensure they are:
- Clear and succinct
- Are expressed in terms of user-facing API details, rather than internal implementation details
- Include necessary details to make feedback actionable to the user

## Merged declarations

I think it could potentially be powerful to support declarations that would otherwise merge with different release levels, if possible.
E.g.

```typescript
/**
 * @public
 */
export interface Foo {
	publicApi: number;
}

/**
 * @beta
 */
export interface Foo {
	betaApi: string;
}

/**
 * @alpha
 */
export interface Foo {
	alphaApi: boolean;
}
```

If trimmed exports omitted components by release level, then we would effectively get something like:

```typescript
// Foo exported from the public API (tagged `@public`):
interface Foo {
	publicApi: number;
}

// Foo exported from the beta API (tagged `@beta`):
interface Foo {
	publicApi: number;
	betaApi: string;
}

// Foo exported from the alpha API (tagged `@alpha`):
interface Foo {
	publicApi: number;
	betaApi: string;
	alphaApi: boolean;
}
```

This would conceptually preserve the expected invariant that APIs can be used with other APIs of the same or more-public release levels.

But does this actually work? Do we get sufficient information from the `.d.ts` files to properly do this splitting?

And what would the end-user implications of this be?

The same question applies to a function merged with a namespace.
For example, a public callable and public namespace could also have a beta overload:

```typescript
/**
 * Converts text.
 * @public
 */
export declare function convert(value: string): string;

/**
 * Converts a preview numeric input.
 * @beta
 */
export declare function convert(value: number): number;

/**
 * Conversion utilities.
 * @public
 */
export declare namespace convert {
	/**
	 * Utility version.
	 */
	export const version: "v1";
}
```

The current analyzer rejects this example because explicit release tags on merged declarations must agree.
This is the approved V1 behavior; standalone overloads without the namespace remain independently selectable.
Future support would require trimming the merged declarations by release level.
Investigate a public output containing the string overload and namespace, and a beta output also containing the number overload.
Check `typeof convert`, overload ordering, namespace member references, and type-only re-exports in both outputs.
This is part of the [future container-selection investigation](docs/api-extractor-replacement-follow-ups.md#flexible-container-member-selection), not an exception to the current atomic-container rule.

## (Future stage) Copy comments to generated rollup files

TSDoc comments should be preserved in the generated rollup files.
Eventually, we will want to add the ability to transform the docs that end up here and in other derived artifacts (see [](#long-term-doc-transformations)).

For v1, we should copy as-is, but we should strip `@privateRemarks` blocks out. These comments are meant for local developers only.

## TSDoc reference conformance

TSDoc has an experimental tag definition that allows users to annotate their APIs with unique labels that can be used to more easily disambiguate references.
See [TSDoc's documentation](https://tsdoc.org/pages/tags/label/) for more details.

The 2026-09-20 decision requires support for TSDoc reference syntax, including labels; this is no longer a deferred feature.
Named label selectors, explicit constructors, quoted names, enum members, and unique-symbol members are implemented locally and through selected dependency models.
The official parser currently rejects the documented unnamed `Interface.(:LABEL)` form.
Track the parser mismatch in the [Stage 2 conformance notes](docs/api-extractor-replacement-implementation-plan.md#remaining-stage-2-decisions).
The later 2026-09-20 decision forbids module-based references for now; possible support belongs to the [module-reference investigation](docs/api-extractor-replacement-follow-ups.md#consider-module-based-documentation-references), not Stage 2 implementation.

If there are any cases where TSDoc's reference syntax can't disambiguate between declarations correctly, we can document this as the mechanism to make docs linkable.

## (Long-term) End-to-end test configurations

Once we have most of the code working, we should add some comprehensive end-to-end test suites that cover sample repo configurations.
Here are some ideas that would be interesting to validate.

### `@private`

Adds support for a custom `@private` tag.
This semantically behaves as a special release tag that means "private to the package", i.e. must not be package-exported.

Our APIs should ensure that the user can configure analysis behavior to reject any exported APIs with the `@private` tag with a user-defined error message.

### `@output` and `@input`

Adds support for 2 custom tags:

- `@output`: Same semantics as [Fluid Framework's `@sealed`](../../docs/content/Guidelines/Documentation-Guidelines/Documenting-TypeScript/TSDoc-Guidelines.md#sealed).
- `@input`: Same semantics as [Fluid Framework's `@input`](../../docs/content/Guidelines/Documentation-Guidelines/Documenting-TypeScript/TSDoc-Guidelines.md#input).

User-defined analysis rules:
- An API must not be both `@output` and `@input`
- An API `extending` or `implementing` another API with either of these tags inherits them by default.

## (Long-term) Doc transformations

It would be useful to provide consumers with hooks or patterns for performing custom TSDoc transformations post-analysis.
The resulting docs are what would be used by subsequent steps in the "pipeline" (rollup generation, API model generation, etc.).

Example scenario: automatic expansion of custom "transient" tags.
A user's configuration could support custom inline / modifier tags that get automatically replaced or augmented.
A sample idea would be automatically converting a `@legacy` modifier tag to a block tag that contains a description of what "@legacy" should mean for end-users.

Original comment:

```typescript
/**
 * Foo
 * @legacy
 */
```

Post-transform comment:

```typescript
/**
 * Foo
 * @legacy
 * This API is not recommended for new adoption.
 * For more details on Fluid Framework legacy APIs see {@link www.fluidframework.com}.
 */
```

## (Long-term) eslint plugin for invariants

It would be helpful for developers to give them feedback ahead-of-time for issues that will confidently be a problem when they analyze their code with this library.
E.g.
- conflicting release tags on members
- TODO: what else?

An eslint plugin exported by this library that users could add to their configs would be nice.

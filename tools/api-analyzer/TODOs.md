# TODOs

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

## (Future stage) Copy comments to generated rollup files

TSDoc comments should be preserved in the generated rollup files.
Eventually, we will want to add the ability to transform the docs that end up here and in other derived artifacts (see [](#long-term-doc-transformations)).

For v1, we should copy as-is, but we should strip `@privateRemarks` blocks out. These comments are meant for local developers only.

## (Long-term) Add support for `{@label}`

TSDoc has an experimental tag definition that allows users to annotate their APIs with unique labels that can be used to more easily disambiguate references.
See [TSDoc's documentation](https://tsdoc.org/pages/tags/label/) for more details.

While the design hasn't been finalized, I think it would be reasonable to add support for it here and allow references to be expressed in terms of labels.

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

# TODOs

## Enhance `Result` type

We should make the type a bit smarter so users can leverage it without a `Value` type.
When no `Value` type is provided, there should be no `value` property.

## Rename functions to follow our coding guidelines

Our [coding guidelines](../../docs/content/Guidelines/Coding-Guidelines.md) call for functions to be named using verb phrases.
E.g. `createFoo` instead of `foo`.
We should audit the code and update functions to adhere to these guidelines.

## Member compatibility

Something we haven't considered at in depth: what does it mean for type members to have release levels that are more restrictive than their container?

API-Extractor has some limited support for this, but I think it is ill-defined.

In our repo, we explicitly forbid this scenario (via a linter rule).
A member of some outer class/interface/namespace/etc. must always have the same release level as its container.

If we created entrypoints that export the same named types with different contents (by trimming members based on release tags), then users might encounter issues when they try to use those types with our other APIs, unless they are very careful not to mix entrypoints.

For this reason, I would suggest that our V1 not support tagging of members.
We can consider support for this as a future possibility.

For now, I would suggest reporting a failure if a member is tagged with a different release level than its container.

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

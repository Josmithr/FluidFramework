# TODOs

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

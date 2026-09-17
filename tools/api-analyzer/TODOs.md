# TODOs

## Inline comment / TSDoc comment ordering consistency

In the test fixture code modules, we test library behaviors via TSDoc comments on the declared APIs.
We then using inline comment syntax to explain what is being validated by the APIs within.

We seem to be using inconsistent ordering across the tests.
Some put their TSDoc comment first, then the inline comment.
Others use the opposite order.

I don't have a strong preference in terms of which ordering we use, but I would like for us to be consistent.

## Exempt test fixtures from linting / formatting

We should probably exempt the sample code under `test/fixtures` from both linting and formatting.
We may need to test code that uses formatting / syntax that don't comply with our repo's preferences, and we shouldn't be prevented from doing that.

## Avoid using `assert.ok` except when specifically checking for truthiness

For example, given a variable `foo: T | undefined`, it is preferred to use `assert(foo !== undefined)` rather than `assert.ok(foo)`.
We also have our `assertDefined` helper we can use.

## New eslint rules

Let's find and add eslint rules for the following:

- Always use curly braces for scoped blocks (if statements, for-loops, etc.)
- Line breaks before comment-only lines (TSDoc comments, inline comments that are not on the same line as code)

We should avoid creating any new rules, and just leverage existing ones from reputable plugins.
Check in with me if you can't find rules that cover any of the above.
A subset of coverage is better than none.

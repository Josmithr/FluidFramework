# Policy Check

This tool enforces polices across the code base via a series of handlers.

## Assert Short Code

Replaces assert messages with hexadecimal numbers, or shortcodes. These reduce the bundle size and memory foot print of
our code base. You should continue to provide string based assert messages, which will be replaced with shortcodes before
release, and the message will be moved to a comment. Use literal strings; interpolated strings will
be rejected since interpolation won't happen once they're moved to a comment. This handler also creates/updates a `.ts`
file that exports the mapping of (formatted) short codes to the original error messages, which can be leveraged through
the `validateAssertionError` function exposed in `test-runtime-utils`. This enables scenarios like tests checking for
specific assertions failing and working whether they see the original message or the formatted short code.

## Copyright Headers

Ensures all files have the appropriate copyright header.

## Fluid Casing

Ensures all references to Fluid are written with an upper case 'F'.

## Npm Package

Ensure all package dependencies in npm package files are sorted.

## API Report Coverage

The `npm-package-api-reports-match-entrypoints` handler ensures every package not marked
`private: true` has API report tasks and that its published declaration rollups match its API
Extractor report coverage.

Required current and legacy release levels are discovered from declaration files referenced by
`package.json`:

- When `exports` is present, nested `types` conditions are authoritative. Top-level `types` is
	ignored because many packages retain it only for compatibility.
- Without `exports`, top-level `types` or `typings` identifies a current public entrypoint.
- Declaration filenames ending in `public`, `beta`, `alpha`, or their legacy equivalents determine
	the report level. When no explicit level is present, only the root export is treated as public.

The policy checks both directions. Every declaration channel must have a configured, checked-in
report, and configured variants or recognized report files without a declaration rollup are flagged
as extraneous. Channel-specific configs may intentionally converge on one report file; identical
paths are deduplicated.

`policy-check --fix` can add a missing variant to an existing package-owned leaf config. It does not
create report task families, modify shared configs, remove extraneous reports, build declarations, or
accept generated API report content. After a config fix, run the package's `build:api-reports` task
and review the generated Markdown.

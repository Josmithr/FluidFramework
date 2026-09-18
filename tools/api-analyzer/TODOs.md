# TODOs

## Member compatibility

Something we haven't considered at in depth: what does it mean for type members to have release levels that are more restrictive than their container?

API-Extractor has some limited support for this, but I think it is ill-defined.

In our repo, we explicitly forbid this scenario (via a linter rule).
A member of some outer class/interface/namespace/etc. must always have the same release level as its container.

If we created entrypoints that export the same named types with different contents (by trimming members based on release tags), then users might encounter issues when they try to use those types with our other APIs, unless they are very careful not to mix entrypoints.

For this reason, I would suggest that our V1 not support tagging of members.
We can consider support for this as a future possibility.

For now, I would suggest reporting a failure if a member is tagged with a different release level than its container.

## Enhance `Result` type

We should make the type a bit smarter so users can leverage it without a `Value` type.
When no `Value` type is provided, there should be no `value` property.

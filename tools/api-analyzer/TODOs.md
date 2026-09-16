# TODOs to consider

## Errors instead of diagnostics

We currently route diagnostic failures through a `failure` helper function, rather than throwing an error and terminating the process.
This pattern is used throughout the code.
I think we can simplify this.

Since our API surface will ultimately be quite narrow, we can update the vast majority of the code to just throw a custom Error type(s) to represent user-facing error modes.
The top-level, user-facing methods (e.g. those on `AnalysisSession`) can wrap its inner operations in try-catches and filter for our custom error types.
They can then forward such errors to diagnostics as needed.

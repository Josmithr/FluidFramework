# `api-analyzer` API Proposal

The following is my rough proposal for the API shape for this library.
I want the API to be as narrow as reasonably possible to start.
It is okay to also export supporting *types*, but the functional API should be small.

## Proposed flow

The user starts by creating an analysis session.
The function to create this takes in the configuration used for analysis, and performs the analysis immediately.

- This deviates from the current `createAnalysisSession` API, in that it eagerly does analysis work, and doesn't return until there is a result.

```typescript
// Performs the analysis on the package's APIs.
// The configuration includes information about the "suite" of other packages that should be included.
// The code can assume that API analysis has already been done on those packages, and that API model artifacts have been generated, which this process can load and consider in its own analysis.
const analysis = await analyzeAPIs(configuration);
```

The object returned by the above API returns an analysis session object (similar to what we currently have with `AnalysisSession`, but without an `analyze` method, since analysis is already done).
This object is the focal point of `api-analyzer`'s API.

It should offer the following capabilities:

- Generation of API model artifacts (used for other packages' API analysis and for API documentation generation)
- Generation of API reports
- Surfacing of stats about the API

The current `AnalysisSession` type assumes that we need to handle invalidation of sources so that we can recompute our "facts" in response to code changes that occur while the analysis object is still alive.
I don't think we need this, at least for now.
The expected workflow is that each package will run the tool after running `tsc` to generate API model artifacts, API reports, etc.
There is no current need for something equivalent to a `watch` service.

The only incrementality requirement I would like for us to handle is the ability to detect when sources have/haven't changed so we can avoid re-running analysis when nothing has changed since the previous build.
This is something we could handle by hashing the relevant inputs (compilation output in the form of the `.d.ts` files that get analyzed, configurations, etc.) and loading the session directly from the API model artifact, rather than analyzing the source code.
That said, I think we should save this for a future follow-up task.
Re-running analysis even when nothing has changed is fine for the initial version.

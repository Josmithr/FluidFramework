# `api-analyzer` Architecture Proposal

As we continue to fill out the functionality of this library, I want to make sure we are maintaining an architectural and organizational scheme that will ensure the code remains intelligible for future maintainers.

Per our [API Proposal](./API-Proposal.md), we have a narrow API flow that we expose to users.

1. The user runs analysis on their package and gets back the results as an object with a few methods on it.
2. The user runs one or more of the methods on the analysis results object.
   1. Roll-up generation
   2. API model artifact generation
   3. API report generation

Internally, I think this can reasonably be modeled with the following distinct operations:

**Analysis**: analyzes the types output by `tsc` (the `.d.ts`) files to create a "facts" graph that describes the API

**Roll-up generation**: reads the "facts" graph and generates 1 or more trimmed roll-up files based on the provided configuration

**API model artifact generation**: serializes the "facts" graph to JSON. The resulting artifact can be used by other tools to generate API documentation, and can be used by this tool to "rehydrate" a "facts" graph without performing analysis (which will likely be used for incremental build support in the future).

**API report generation**: Reads the "facts" graph and produces an easy-to-review overview of the API surface as a Markdown document.

Each of these can be viewed as a functional transformation on input data, and are therefore nicely suited for being organized as separate layers / directories in the package.

Therefore, I propose that we organize the source code in this package as follows:

- utilities: contains basic utilities shared by all layers
- analysis-types: contains "facts" graph types used by all layers (may depend on `utilities`)
- analysis: contains the code responsible for performing analysis (depends on `analysis-types` and `utilities`)
- rollup-generation: contains the code responsible for rollup generation (depends on `analysis-types` and `utilities`)
- model-generation: contains the code responsible for model generation (depends on `analysis-types` and `utilities`)
- report-generation: contains the code responsible for API report generation (depends on `analysis-types` and `utilities`)

The package root can contain the user-facing analysis API, which composes the layers.

This organization will promote semantic isolation and a pure-functional architecture.
Each layer will have its own comprehensive test suite validating its behaviors in isolation, and we can have a top-level / end-to-end test suite that validates the composition.

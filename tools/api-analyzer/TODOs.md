# TODOs to consider

## Simpler mocha testing pattern

Rather than specifying all of the test suites in the package.json test script, let's use a glob pattern to match on all test files.
That way we don't have to update the script each time we add/remove a test module.
It is preferred to put configuration options in the config file rather than in the package.json script(s) whenever possible.

# Analysis session inputs

[session.test.ts](../../session.test.ts) analyzes copied source files directly with TypeScript 7.
Each test gets a separate temporary project and session.
The setup copies the shared inputs and the `base` directory into the same temporary `src` directory.
Other inputs are copied only by the tests that need them.

| Input | Purpose |
| --- | --- |
| [base/extra.ts](base/extra.ts) and [base/chain.ts](base/chain.ts) | Transitive type-only exports, merged declarations, and deferred conditional types. |
| [comments.ts](comments.ts) | Absent, empty, ordinary, and attached TSDoc comments without declaration text. |
| [updated/api.ts](updated/api.ts) and [updated/index.ts](updated/index.ts) | Replacement source for invalidation; `Derived.value` changes from `string` to `number`. |
| [environment.ts](environment.ts) | Re-export a dependency type without changing its package origin. |
| [dependency/browser.d.ts](dependency/browser.d.ts) and [dependency/node.d.ts](dependency/node.d.ts) | Distinct targets for browser and default package export conditions. |
| [browser-updated.d.ts](browser-updated.d.ts) | Replacement browser declaration for dependency invalidation. |

The conditional-resolution test copies the dependency declarations into temporary `node_modules/dependency` and writes its package export map.
It then replaces only `browser.d.ts`, invalidates the session, and verifies the updated type.
Replacement inputs must not enter the temporary project before the test performs the corresponding change.

The relocation test copies the temporary project to a different checkout path.
The overload-reordering test transforms the copied shared API source while keeping each overload's comment attached.
Both operations remain in the test because the change itself is the behavior under test.

Run `pnpm build` and `pnpm exec mocha lib/test/session.test.js --timeout 20000` from the package directory.

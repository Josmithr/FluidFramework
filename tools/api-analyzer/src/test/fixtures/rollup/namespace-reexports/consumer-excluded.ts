/* Checks public and empty selections after the suite's beta namespace is excluded. */

import * as API from "namespace-package";

// @ts-expect-error The excluded namespace has no value export.
API.Namespace;
// @ts-expect-error The excluded namespace has no type export.
type Hidden = API.Namespace.Value;

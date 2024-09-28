/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { LineBreakNode } from "../../documentation-domain/index.js";
import { assertTransformation } from "./Utilities.js";

it("LineBreak HTML rendering test", () => {
	assertTransformation(LineBreakNode.Singleton, { type: "break" });
});

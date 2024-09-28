/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { HorizontalRuleNode } from "../../documentation-domain/index.js";
import { assertTransformation } from "./Utilities.js";

it("HorizontalRule HTML rendering test", () => {
	assertTransformation(HorizontalRuleNode.Singleton, { type: "thematicBreak" });
});

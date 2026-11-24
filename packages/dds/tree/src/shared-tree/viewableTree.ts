/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	ImplicitFieldSchema,
	SimpleTreeSchema,
	TreeView,
	TreeViewAlpha,
	TreeViewConfiguration,
	ViewableTreeAlpha,
	VerboseTree,
} from "../simple-tree/index.js";

import { forkAsBranchCheckout, type TreeBranchHandleAlpha } from "./branchCheckout.js";
import type { CheckoutBase } from "./treeCheckout.js";

/**
 * Creates the common viewable-tree API backed by a checkout.
 */
export function createViewableTreeAlpha(
	checkout: CheckoutBase,
	exportSimpleSchema: () => SimpleTreeSchema,
): ViewableTreeAlpha {
	return {
		get storedSchemaVersion() {
			return checkout.storedSchema.schemaVersion;
		},
		forkBranch(): TreeBranchHandleAlpha {
			return forkAsBranchCheckout(checkout);
		},
		viewWith<TRoot extends ImplicitFieldSchema>(
			config: TreeViewConfiguration<TRoot>,
		): TreeView<TRoot> {
			// The tree owns the checkout. Closing a view must not dispose the Guest's synchronization branch.
			const view: TreeViewAlpha<TRoot> = checkout.viewWithInternal(config, false);
			return view as TreeView<TRoot>;
		},
		exportVerbose(): VerboseTree | undefined {
			return checkout.exportVerbose();
		},
		exportSimpleSchema,
	};
}

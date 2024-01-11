/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { sequenceConfig } from "./config.js";
import { isVestigialEndpoint } from "./helperTypes.js";
import { Mark, MarkList } from "./types.js";
import { isNoopMark, isTombstone, tryMergeMarks as tryMergeMarks } from "./utils.js";

/**
 * Helper class for constructing an offset list of marks that...
 * - Does not insert offsets if there is no content after them
 * - Does not insert 0-sized offsets
 * - Merges runs of offsets together
 * - Merges marks together
 */
export class MarkListFactory<TNodeChange> {
	private offset = 0;
	public readonly list: MarkList<TNodeChange> = [];

	public constructor() {}

	public push(...marks: Mark<TNodeChange>[]): void {
		for (const item of marks) {
			this.pushContent(item);
		}
	}

	public pushOffset(offset: number): void {
		this.offset += offset;
	}

	public pushContent(mark: Mark<TNodeChange>): void {
		if (isTombstone(mark) && sequenceConfig.cellOrdering !== "Tombstone") {
			return;
		}
		if (
			isNoopMark(mark) &&
			mark.changes === undefined &&
			!isVestigialEndpoint(mark) &&
			!isTombstone(mark)
		) {
			this.pushOffset(mark.count);
			return;
		}
		if (this.offset > 0) {
			this.list.push({ count: this.offset });
			this.offset = 0;
		}
		const prev = this.list[this.list.length - 1];
		if (prev !== undefined && prev.type === mark.type) {
			const merged = tryMergeMarks(prev, mark);
			if (merged !== undefined) {
				this.list.splice(this.list.length - 1, 1, merged);
				return;
			}
		}
		this.list.push(mark);
	}
}

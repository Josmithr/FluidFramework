/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

/**
 * Mocha loads this module after jsdom creates the browser environment. This module supplies
 * browser APIs that jsdom does not implement and removes rendered components after each test.
 */

const { cleanup } = require("@testing-library/react");

/**
 * jsdom does not implement canvas rendering. The tests do not inspect canvas output, so they
 * use a null rendering context.
 */
HTMLCanvasElement.prototype.getContext = () => null;

/**
 * Components use ResizeObserver to calculate their layout. This test implementation reports a
 * fixed size when observation starts. The synchronous callback makes each layout deterministic.
 */
class ResizeObserver {
	constructor(callback) {
		this.callback = callback;
	}

	observe(target) {
		this.callback(
			[
				{
					target,
					contentRect: {
						x: 0,
						y: 0,
						width: 800,
						height: 600,
						top: 0,
						right: 800,
						bottom: 600,
						left: 0,
						toJSON: () => ({}),
					},
				},
			],
			this,
		);
	}
	unobserve() {}
	disconnect() {}
}

// Application code can get ResizeObserver from either global object.
globalThis.ResizeObserver = ResizeObserver;
window.ResizeObserver = ResizeObserver;

exports.mochaHooks = {
	afterEach() {
		// Remove components and event handlers that the test rendered in the document.
		cleanup();
	},
};

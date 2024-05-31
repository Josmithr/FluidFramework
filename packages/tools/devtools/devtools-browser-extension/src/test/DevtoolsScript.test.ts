/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";
import rewire from "rewire";
import { createSandbox } from "sinon";

import { type Globals } from "../Globals.js";

import { stubGlobals } from "./Utilities.js";

const devtoolsScriptPath = "../devtools/DevtoolsScript"; // Relative to this file

/**
 * Require the background script using the provided `browser` APIs.
 */
const loadDevtoolsScript = (globals: Globals): void => {
	rewire(devtoolsScriptPath).__with__(globals);
};

describe("Devtools Script unit tests", () => {
	const sandbox = createSandbox();

	let globals: Globals = stubGlobals();

	afterEach(() => {
		sandbox.reset();
		globals = stubGlobals(); // Reset globals to ensure test-local modifications are cleared
	});

	it("Creates the view on load", async () => {
		const { browser } = globals;

		const createSpy = sandbox.spy(browser.devtools.panels, "create");

		loadDevtoolsScript(globals);

		expect(createSpy.called).to.be.true;
	});
});

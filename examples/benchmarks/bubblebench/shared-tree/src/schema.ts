/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IBubble, IClient } from "@fluid-example/bubblebench-common";
// eslint-disable-next-line import/no-deprecated
import { SchemaFactory, TreeConfiguration } from "@fluidframework/tree";

const sf = new SchemaFactory("bubble-bench-simple-tree");

export class Bubble
	extends sf.object("Bubble", {
		x: sf.number,
		y: sf.number,
		r: sf.number,
		vx: sf.number,
		vy: sf.number,
	})
	implements IBubble {}

export class Client
	extends sf.object("Client", {
		clientId: sf.string,
		color: sf.string,
		bubbles: sf.array("Bubbles", Bubble),
	})
	implements IClient {}

// Root type
export class App extends sf.object("App", {
	clients: sf.array("Clients", Client),
}) {}

// eslint-disable-next-line import/no-deprecated
export const appTreeConfiguration = new TreeConfiguration(App, () => ({
	clients: [],
}));

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-deprecated
import { SchemaFactory, TreeConfiguration } from "fluid-framework";

const sb = new SchemaFactory("fc1db2e8-0a00-11ee-be56-0242ac120002");

export class Position extends sb.object("Position", {
	x: sb.number,
	y: sb.number,
}) {}

export class Letter extends sb.object("Letter", {
	position: Position,
	character: sb.string,
	id: sb.string,
}) {}

export class App extends sb.object("App", {
	letters: sb.array(Letter),
	word: sb.array(Letter),
}) {}

// eslint-disable-next-line import/no-deprecated
export const treeConfiguration = new TreeConfiguration(App, () => ({
	letters: [],
	word: [],
}));

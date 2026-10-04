/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* Checks that the compiler-backed smoke test produces a usable selected entrypoint. */
import { read } from "./types/index.js";

const text: string = read("value");
// @ts-expect-error The generated API must retain its string parameter.
read(42);

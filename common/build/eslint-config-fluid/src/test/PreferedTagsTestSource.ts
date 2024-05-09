/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Valid
 *
 * @return Foo
 * @arg - Arg
 * @argument - Argument
 * {@inheritdoc foo}
 */
export const foo = "foo";

/**
 * Invalid
 *
 * @returns Foo
 * @param - Arg
 * {@inheritDoc foo}
 */
export const bar = "bar";

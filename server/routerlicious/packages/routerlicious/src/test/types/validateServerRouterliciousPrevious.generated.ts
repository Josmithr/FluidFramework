/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/*
 * THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY.
 * Generated by fluid-type-test-generator in @fluidframework/build-tools.
 */
import type * as old from "@fluidframework/server-routerlicious-previous";
import type * as current from "../../index";


// See 'build-tools/src/type-test-generator/compatibility.ts' for more information.
type TypeOnly<T> = T extends number
	? number
	: T extends string
	? string
	: T extends boolean | bigint | symbol
	? T
	: {
			[P in keyof T]: TypeOnly<T[P]>;
	  };

/*
* Validate forward compat by using old type in place of current type
* If breaking change required, add in package.json under typeValidation.broken:
* "FunctionDeclaration_create": {"forwardCompat": false}
*/
declare function get_old_FunctionDeclaration_create():
    TypeOnly<typeof old.create>;
declare function use_current_FunctionDeclaration_create(
    use: TypeOnly<typeof current.create>): void;
use_current_FunctionDeclaration_create(
    get_old_FunctionDeclaration_create());

/*
* Validate back compat by using current type in place of old type
* If breaking change required, add in package.json under typeValidation.broken:
* "FunctionDeclaration_create": {"backCompat": false}
*/
declare function get_current_FunctionDeclaration_create():
    TypeOnly<typeof current.create>;
declare function use_old_FunctionDeclaration_create(
    use: TypeOnly<typeof old.create>): void;
use_old_FunctionDeclaration_create(
    get_current_FunctionDeclaration_create());

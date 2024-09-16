/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY.
 * Generated by flub generate:typetests in @fluid-tools/build-cli.
 */

import type * as old from "@fluidframework/aqueduct-previous/internal";
import type { TypeOnly, MinimalType, FullType, requireAssignableTo } from "@fluidframework/build-tools";

import type * as current from "../../index.js";

declare type MakeUnusedImportErrorsGoAway<T> = TypeOnly<T> | MinimalType<T> | FullType<T> | typeof old | typeof current | requireAssignableTo<true, true>;

/*
 * Validate forward compatibility by using the old type in place of the current type.
 * If this test starts failing, it indicates a change that is not forward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "Class_BaseContainerRuntimeFactory": {"forwardCompat": false}
 */
declare type old_as_current_for_Class_BaseContainerRuntimeFactory = requireAssignableTo<TypeOnly<old.BaseContainerRuntimeFactory>, TypeOnly<current.BaseContainerRuntimeFactory>>

/*
 * Validate backward compatibility by using the current type in place of the old type.
 * If this test starts failing, it indicates a change that is not backward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "Class_BaseContainerRuntimeFactory": {"backCompat": false}
 */
declare type current_as_old_for_Class_BaseContainerRuntimeFactory = requireAssignableTo<TypeOnly<current.BaseContainerRuntimeFactory>, TypeOnly<old.BaseContainerRuntimeFactory>>

/*
 * Validate forward compatibility by using the old type in place of the current type.
 * If this test starts failing, it indicates a change that is not forward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "Class_ContainerRuntimeFactoryWithDefaultDataStore": {"forwardCompat": false}
 */
declare type old_as_current_for_Class_ContainerRuntimeFactoryWithDefaultDataStore = requireAssignableTo<TypeOnly<old.ContainerRuntimeFactoryWithDefaultDataStore>, TypeOnly<current.ContainerRuntimeFactoryWithDefaultDataStore>>

/*
 * Validate backward compatibility by using the current type in place of the old type.
 * If this test starts failing, it indicates a change that is not backward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "Class_ContainerRuntimeFactoryWithDefaultDataStore": {"backCompat": false}
 */
declare type current_as_old_for_Class_ContainerRuntimeFactoryWithDefaultDataStore = requireAssignableTo<TypeOnly<current.ContainerRuntimeFactoryWithDefaultDataStore>, TypeOnly<old.ContainerRuntimeFactoryWithDefaultDataStore>>

/*
 * Validate forward compatibility by using the old type in place of the current type.
 * If this test starts failing, it indicates a change that is not forward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "Class_DataObject": {"forwardCompat": false}
 */
declare type old_as_current_for_Class_DataObject = requireAssignableTo<TypeOnly<old.DataObject>, TypeOnly<current.DataObject>>

/*
 * Validate backward compatibility by using the current type in place of the old type.
 * If this test starts failing, it indicates a change that is not backward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "Class_DataObject": {"backCompat": false}
 */
declare type current_as_old_for_Class_DataObject = requireAssignableTo<TypeOnly<current.DataObject>, TypeOnly<old.DataObject>>

/*
 * Validate forward compatibility by using the old type in place of the current type.
 * If this test starts failing, it indicates a change that is not forward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "Class_DataObjectFactory": {"forwardCompat": false}
 */
declare type old_as_current_for_Class_DataObjectFactory = requireAssignableTo<TypeOnly<old.DataObjectFactory<any>>, TypeOnly<current.DataObjectFactory<any>>>

/*
 * Validate backward compatibility by using the current type in place of the old type.
 * If this test starts failing, it indicates a change that is not backward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "Class_DataObjectFactory": {"backCompat": false}
 */
declare type current_as_old_for_Class_DataObjectFactory = requireAssignableTo<TypeOnly<current.DataObjectFactory<any>>, TypeOnly<old.DataObjectFactory<any>>>

/*
 * Validate forward compatibility by using the old type in place of the current type.
 * If this test starts failing, it indicates a change that is not forward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "Class_PureDataObject": {"forwardCompat": false}
 */
declare type old_as_current_for_Class_PureDataObject = requireAssignableTo<TypeOnly<old.PureDataObject>, TypeOnly<current.PureDataObject>>

/*
 * Validate backward compatibility by using the current type in place of the old type.
 * If this test starts failing, it indicates a change that is not backward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "Class_PureDataObject": {"backCompat": false}
 */
declare type current_as_old_for_Class_PureDataObject = requireAssignableTo<TypeOnly<current.PureDataObject>, TypeOnly<old.PureDataObject>>

/*
 * Validate forward compatibility by using the old type in place of the current type.
 * If this test starts failing, it indicates a change that is not forward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "Class_PureDataObjectFactory": {"forwardCompat": false}
 */
declare type old_as_current_for_Class_PureDataObjectFactory = requireAssignableTo<TypeOnly<old.PureDataObjectFactory<any>>, TypeOnly<current.PureDataObjectFactory<any>>>

/*
 * Validate backward compatibility by using the current type in place of the old type.
 * If this test starts failing, it indicates a change that is not backward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "Class_PureDataObjectFactory": {"backCompat": false}
 */
declare type current_as_old_for_Class_PureDataObjectFactory = requireAssignableTo<TypeOnly<current.PureDataObjectFactory<any>>, TypeOnly<old.PureDataObjectFactory<any>>>

/*
 * Validate backward compatibility by using the current type in place of the old type.
 * If this test starts failing, it indicates a change that is not backward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "ClassStatics_BaseContainerRuntimeFactory": {"backCompat": false}
 */
declare type current_as_old_for_ClassStatics_BaseContainerRuntimeFactory = requireAssignableTo<TypeOnly<typeof current.BaseContainerRuntimeFactory>, TypeOnly<typeof old.BaseContainerRuntimeFactory>>

/*
 * Validate backward compatibility by using the current type in place of the old type.
 * If this test starts failing, it indicates a change that is not backward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "ClassStatics_ContainerRuntimeFactoryWithDefaultDataStore": {"backCompat": false}
 */
declare type current_as_old_for_ClassStatics_ContainerRuntimeFactoryWithDefaultDataStore = requireAssignableTo<TypeOnly<typeof current.ContainerRuntimeFactoryWithDefaultDataStore>, TypeOnly<typeof old.ContainerRuntimeFactoryWithDefaultDataStore>>

/*
 * Validate backward compatibility by using the current type in place of the old type.
 * If this test starts failing, it indicates a change that is not backward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "ClassStatics_DataObject": {"backCompat": false}
 */
declare type current_as_old_for_ClassStatics_DataObject = requireAssignableTo<TypeOnly<typeof current.DataObject>, TypeOnly<typeof old.DataObject>>

/*
 * Validate backward compatibility by using the current type in place of the old type.
 * If this test starts failing, it indicates a change that is not backward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "ClassStatics_DataObjectFactory": {"backCompat": false}
 */
declare type current_as_old_for_ClassStatics_DataObjectFactory = requireAssignableTo<TypeOnly<typeof current.DataObjectFactory>, TypeOnly<typeof old.DataObjectFactory>>

/*
 * Validate backward compatibility by using the current type in place of the old type.
 * If this test starts failing, it indicates a change that is not backward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "ClassStatics_PureDataObject": {"backCompat": false}
 */
declare type current_as_old_for_ClassStatics_PureDataObject = requireAssignableTo<TypeOnly<typeof current.PureDataObject>, TypeOnly<typeof old.PureDataObject>>

/*
 * Validate backward compatibility by using the current type in place of the old type.
 * If this test starts failing, it indicates a change that is not backward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "ClassStatics_PureDataObjectFactory": {"backCompat": false}
 */
declare type current_as_old_for_ClassStatics_PureDataObjectFactory = requireAssignableTo<TypeOnly<typeof current.PureDataObjectFactory>, TypeOnly<typeof old.PureDataObjectFactory>>

/*
 * Validate backward compatibility by using the current type in place of the old type.
 * If this test starts failing, it indicates a change that is not backward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "Function_createDataObjectKind": {"backCompat": false}
 */
declare type current_as_old_for_Function_createDataObjectKind = requireAssignableTo<TypeOnly<typeof current.createDataObjectKind>, TypeOnly<typeof old.createDataObjectKind>>

/*
 * Validate forward compatibility by using the old type in place of the current type.
 * If this test starts failing, it indicates a change that is not forward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "Interface_BaseContainerRuntimeFactoryProps": {"forwardCompat": false}
 */
declare type old_as_current_for_Interface_BaseContainerRuntimeFactoryProps = requireAssignableTo<TypeOnly<old.BaseContainerRuntimeFactoryProps>, TypeOnly<current.BaseContainerRuntimeFactoryProps>>

/*
 * Validate backward compatibility by using the current type in place of the old type.
 * If this test starts failing, it indicates a change that is not backward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "Interface_BaseContainerRuntimeFactoryProps": {"backCompat": false}
 */
declare type current_as_old_for_Interface_BaseContainerRuntimeFactoryProps = requireAssignableTo<TypeOnly<current.BaseContainerRuntimeFactoryProps>, TypeOnly<old.BaseContainerRuntimeFactoryProps>>

/*
 * Validate forward compatibility by using the old type in place of the current type.
 * If this test starts failing, it indicates a change that is not forward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "Interface_ContainerRuntimeFactoryWithDefaultDataStoreProps": {"forwardCompat": false}
 */
declare type old_as_current_for_Interface_ContainerRuntimeFactoryWithDefaultDataStoreProps = requireAssignableTo<TypeOnly<old.ContainerRuntimeFactoryWithDefaultDataStoreProps>, TypeOnly<current.ContainerRuntimeFactoryWithDefaultDataStoreProps>>

/*
 * Validate backward compatibility by using the current type in place of the old type.
 * If this test starts failing, it indicates a change that is not backward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "Interface_ContainerRuntimeFactoryWithDefaultDataStoreProps": {"backCompat": false}
 */
declare type current_as_old_for_Interface_ContainerRuntimeFactoryWithDefaultDataStoreProps = requireAssignableTo<TypeOnly<current.ContainerRuntimeFactoryWithDefaultDataStoreProps>, TypeOnly<old.ContainerRuntimeFactoryWithDefaultDataStoreProps>>

/*
 * Validate forward compatibility by using the old type in place of the current type.
 * If this test starts failing, it indicates a change that is not forward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "Interface_DataObjectTypes": {"forwardCompat": false}
 */
declare type old_as_current_for_Interface_DataObjectTypes = requireAssignableTo<TypeOnly<old.DataObjectTypes>, TypeOnly<current.DataObjectTypes>>

/*
 * Validate backward compatibility by using the current type in place of the old type.
 * If this test starts failing, it indicates a change that is not backward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "Interface_DataObjectTypes": {"backCompat": false}
 */
declare type current_as_old_for_Interface_DataObjectTypes = requireAssignableTo<TypeOnly<current.DataObjectTypes>, TypeOnly<old.DataObjectTypes>>

/*
 * Validate forward compatibility by using the old type in place of the current type.
 * If this test starts failing, it indicates a change that is not forward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "Interface_IDataObjectProps": {"forwardCompat": false}
 */
// @ts-expect-error compatibility expected to be broken
declare type old_as_current_for_Interface_IDataObjectProps = requireAssignableTo<TypeOnly<old.IDataObjectProps>, TypeOnly<current.IDataObjectProps>>

/*
 * Validate backward compatibility by using the current type in place of the old type.
 * If this test starts failing, it indicates a change that is not backward compatible.
 * To acknowledge the breaking change, add the following to package.json under
 * typeValidation.broken:
 * "Interface_IDataObjectProps": {"backCompat": false}
 */
// @ts-expect-error compatibility expected to be broken
declare type current_as_old_for_Interface_IDataObjectProps = requireAssignableTo<TypeOnly<current.IDataObjectProps>, TypeOnly<old.IDataObjectProps>>

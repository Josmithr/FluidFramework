/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocNode, DocSection, TSDocConfiguration } from "@microsoft/tsdoc";

export function mergeSections(
    sections: DocSection[],
    tsdocConfiguration: TSDocConfiguration,
): DocSection {
    const childNodes: DocNode[] = [];

    for (const section of sections) {
        childNodes.push(...section.nodes);
    }

    return new DocSection({ configuration: tsdocConfiguration }, childNodes);
}

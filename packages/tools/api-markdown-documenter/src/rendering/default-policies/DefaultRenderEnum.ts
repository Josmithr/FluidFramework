import { ApiEnum, ApiEnumMember, ApiItem, ApiItemKind } from "@microsoft/api-extractor-model";
import { DocSection } from "@microsoft/tsdoc";

import { MarkdownDocumenterConfiguration } from "../../MarkdownDocumenterConfiguration";
import { filterByKind, mergeSections } from "../../utilities";
import { renderChildrenUnderHeading, renderMemberTables } from "../helpers";

export function renderEnumSection(
    apiEnum: ApiEnum,
    config: Required<MarkdownDocumenterConfiguration>,
    renderChild: (apiItem: ApiItem) => DocSection,
): DocSection {
    const docSections: DocSection[] = [];

    const hasAnyChildren = apiEnum.members.length !== 0;

    if (hasAnyChildren) {
        // Accumulate child items
        const flags = filterByKind(apiEnum.members, [ApiItemKind.EnumMember]).map(
            (apiItem) => apiItem as ApiEnumMember,
        );

        // Render summary tables
        const renderedMemberTables = renderMemberTables(
            [
                {
                    headingTitle: "Flags",
                    itemKind: ApiItemKind.EnumMember,
                    items: flags,
                },
            ],
            config,
        );
        if (renderedMemberTables !== undefined) {
            docSections.push(renderedMemberTables);
        }

        // Render individual flag details
        const renderedDetailsSection = renderChildrenUnderHeading(
            flags,
            "FlagDetails",
            config,
            renderChild,
        );
        if (renderedDetailsSection !== undefined) {
            docSections.push(renderedDetailsSection);
        }
    }

    // Merge sections to reduce and simplify hierarchy
    const innerSectionBody = mergeSections(docSections, config.tsdocConfiguration);
    return config.renderSectionBlock(apiEnum, innerSectionBody, config);
}

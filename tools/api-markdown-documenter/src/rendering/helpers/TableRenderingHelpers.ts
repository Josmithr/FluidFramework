/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocTableRow } from "@microsoft/api-documenter/lib/nodes/DocTableRow";
import {
    ApiDocumentedItem,
    ApiItem,
    ApiItemKind,
    ApiPackage,
    ApiPropertyItem,
    ApiReleaseTagMixin,
    ApiReturnTypeMixin,
    Excerpt,
    Parameter,
    ReleaseTag,
} from "@microsoft/api-extractor-model";
import { DocNode, DocParagraph, DocPlainText, DocSection } from "@microsoft/tsdoc";

import { MarkdownDocumenterConfiguration } from "../../MarkdownDocumenterConfiguration";
import { DocEmphasisSpan, DocTable, DocTableCell } from "../../doc-nodes";
import {
    ApiFunctionLike,
    getDefaultValueBlock,
    getLinkForApiItem,
    getModifiers,
    mergeSections,
} from "../../utilities";
import { renderExcerptWithHyperlinks, renderHeading, renderLink } from "./RenderingHelpers";

/**
 * Input properties for rendering a table of API members
 */
export interface MemberTableProperties {
    /**
     * Heading text to display above the table contents.
     */
    headingTitle: string;

    /**
     * The kind of API item.
     */
    itemKind: ApiItemKind;

    /**
     * The items to be rendered as rows in the table.
     */
    items: readonly ApiItem[];
}

/**
 * Renders a simple section containing a series of headings and tables, representing the API members of some parent
 * item, organized by kind.
 *
 * @param memberTableProperties - List of table configurations.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 */
export function renderMemberTables(
    memberTableProperties: readonly MemberTableProperties[],
    config: Required<MarkdownDocumenterConfiguration>,
): DocSection | undefined {
    const docSections: DocSection[] = [];

    for (const member of memberTableProperties) {
        const renderedTable = renderTableWithHeading(member, config);
        if (renderedTable !== undefined) {
            docSections.push(renderedTable);
        }
    }

    return docSections.length === 0
        ? undefined
        : mergeSections(docSections, config.tsdocConfiguration);
}

/**
 * Renders a simple section containing a heading and a table, based on the provided properties.
 *
 * @param memberTableProperties - The table configuration.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 */
export function renderTableWithHeading(
    memberTableProperties: MemberTableProperties,
    config: Required<MarkdownDocumenterConfiguration>,
): DocSection | undefined {
    const renderedTable = renderSummaryTable(
        memberTableProperties.items,
        memberTableProperties.itemKind,
        config,
    );

    return renderedTable === undefined
        ? undefined
        : new DocSection({ configuration: config.tsdocConfiguration }, [
              renderHeading({ title: memberTableProperties.headingTitle }, config),
              renderedTable,
          ]);
}

/**
 * Renders a simple summary table for API items of the specified kind.
 * This is intended to represent a simple overview of the items.
 *
 * @remarks General use-case is to render a summary of child items of a given kind for some parent API item.
 *
 * @param apiItems - The items to be rendered. All of these items must be of the kind specified via `itemKind`.
 * @param itemKind - The kind of items being rendered in the table. Used to determine the semantic shape of the table.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 */
export function renderSummaryTable(
    apiItems: readonly ApiItem[],
    itemKind: ApiItemKind,
    config: Required<MarkdownDocumenterConfiguration>,
): DocTable | undefined {
    if (itemKind === ApiItemKind.Model || itemKind === ApiItemKind.EntryPoint) {
        throw new Error(`Table rendering does not support provided API item kind: "${itemKind}".`);
    }

    if (apiItems.length === 0) {
        return undefined;
    }

    switch (itemKind) {
        case ApiItemKind.ConstructSignature:
        case ApiItemKind.Constructor:
        case ApiItemKind.Function:
        case ApiItemKind.Method:
        case ApiItemKind.MethodSignature:
            return renderFunctionLikeSummaryTable(
                apiItems.map((apiItem) => apiItem as ApiFunctionLike),
                itemKind,
                config,
            );

        case ApiItemKind.Property:
        case ApiItemKind.PropertySignature:
            return renderPropertiesTable(
                apiItems.map((apiItem) => apiItem as ApiPropertyItem),
                config,
            );

        case ApiItemKind.Package:
            return renderPackagesTable(
                apiItems.map((apiItem) => apiItem as ApiPackage),
                config,
            );

        default:
            return renderDefaultSummaryTable(apiItems, itemKind, config);
    }
}

/**
 * Default summary table rendering. Displays each item's name, modifiers, and description (summary) comment.
 *
 * @param apiItems - The items to be rendered. All of these items must be of the kind specified via `itemKind`.
 * @param itemKind - The kind of items being rendered in the table. Used to determine the semantic shape of the table.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 */
export function renderDefaultSummaryTable(
    apiItems: readonly ApiItem[],
    itemKind: ApiItemKind,
    config: Required<MarkdownDocumenterConfiguration>,
): DocTable | undefined {
    if (apiItems.length === 0) {
        return undefined;
    }

    // Only display "Modifiers" column if there are any modifiers to display.
    const hasModifiers = apiItems.some((apiItem) => getModifiers(apiItem).length !== 0);

    const headerTitles: string[] = [getTableHeadingTitleForApiKind(itemKind)];
    if (hasModifiers) {
        headerTitles.push("Modifiers");
    }
    headerTitles.push("Description");

    const tableRows: DocTableRow[] = [];
    for (const apiItem of apiItems) {
        const rowCells: DocTableCell[] = [renderApiTitleCell(apiItem, config)];
        if (hasModifiers) {
            rowCells.push(renderModifiersCell(apiItem, config));
        }
        rowCells.push(renderApiSummaryCell(apiItem, config));

        tableRows.push(new DocTableRow({ configuration: config.tsdocConfiguration }, rowCells));
    }

    return new DocTable(
        {
            configuration: config.tsdocConfiguration,
            headerTitles,
        },
        tableRows,
    );
}

/**
 * Renders a simple summary table for a series of parameters.
 * Displays each parameter's name, type, and description ({@link https://tsdoc.org/pages/tags/param/ | @param}) comment.
 *
 * @param apiItems - The items to be rendered. All of these items must be of the kind specified via `itemKind`.
 * @param itemKind - The kind of items being rendered in the table. Used to determine the semantic shape of the table.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 */
export function renderParametersSummaryTable(
    apiParameters: readonly Parameter[],
    config: Required<MarkdownDocumenterConfiguration>,
): DocTable {
    // Only display "Modifiers" column if there are any optional parameters present.
    const hasOptionalParameters = apiParameters.some((apiParameter) => apiParameter.isOptional);

    const headerTitles: string[] = ["Parameter"];
    if (hasOptionalParameters) {
        headerTitles.push("Modifiers");
    }
    headerTitles.push("Type");
    headerTitles.push("Description");

    function renderModifierCell(apiParameter: Parameter): DocTableCell {
        return apiParameter.isOptional
            ? new DocTableCell({ configuration: config.tsdocConfiguration }, [
                  new DocParagraph({ configuration: config.tsdocConfiguration }, [
                      new DocPlainText({
                          configuration: config.tsdocConfiguration,
                          text: "optional",
                      }),
                  ]),
              ])
            : renderEmptyTableCell(config);
    }

    const tableRows: DocTableRow[] = [];
    for (const apiParameter of apiParameters) {
        const rowCells: DocTableCell[] = [renderParameterTitleCell(apiParameter, config)];
        if (hasOptionalParameters) {
            rowCells.push(renderModifierCell(apiParameter));
        }
        rowCells.push(renderParameterTypeCell(apiParameter, config));
        rowCells.push(renderParameterSummaryCell(apiParameter, config));

        tableRows.push(new DocTableRow({ configuration: config.tsdocConfiguration }, rowCells));
    }

    return new DocTable(
        {
            configuration: config.tsdocConfiguration,
            headerTitles,
        },
        tableRows,
    );
}

/**
 * Renders a simple summary table for function-like API items (constructors, functions, methods).
 * Displays each item's name, modifiers, return type, and description (summary) comment.
 *
 * @param apiItems - The function-like items to be rendered.
 * @param itemKind - The kind of items being rendered in the table. Used to determine the semantic shape of the table.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 */
export function renderFunctionLikeSummaryTable(
    apiItems: readonly ApiFunctionLike[],
    itemKind: ApiItemKind,
    config: Required<MarkdownDocumenterConfiguration>,
): DocTable | undefined {
    if (apiItems.length === 0) {
        return undefined;
    }

    // Only display "Modifiers" column if there are any modifiers to display.
    const hasModifiers = apiItems.some((apiItem) => getModifiers(apiItem).length !== 0);
    const hasReturnTypes = apiItems.some((apiItem) => ApiReturnTypeMixin.isBaseClassOf(apiItem));

    const headerTitles: string[] = [getTableHeadingTitleForApiKind(itemKind)];
    if (hasModifiers) {
        headerTitles.push("Modifiers");
    }
    if (hasReturnTypes) {
        headerTitles.push("Return Type");
    }
    headerTitles.push("Description");

    const tableRows: DocTableRow[] = [];
    for (const apiItem of apiItems) {
        const rowCells: DocTableCell[] = [renderApiTitleCell(apiItem, config)];
        if (hasModifiers) {
            rowCells.push(renderModifiersCell(apiItem, config));
        }
        if (hasReturnTypes) {
            rowCells.push(renderReturnTypeCell(apiItem, config));
        }
        rowCells.push(renderApiSummaryCell(apiItem, config));

        tableRows.push(new DocTableRow({ configuration: config.tsdocConfiguration }, rowCells));
    }

    return new DocTable(
        {
            configuration: config.tsdocConfiguration,
            headerTitles,
        },
        tableRows,
    );
}

/**
 * Renders a simple summary table for a series of properties.
 * Displays each property's name, modifiers, type, and description (summary) comment.
 *
 * @param apiItems - The items to be rendered. All of these items must be of the kind specified via `itemKind`.
 * @param itemKind - The kind of items being rendered in the table. Used to determine the semantic shape of the table.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 */
export function renderPropertiesTable(
    apiProperties: readonly ApiPropertyItem[],
    config: Required<MarkdownDocumenterConfiguration>,
): DocTable | undefined {
    if (apiProperties.length === 0) {
        return undefined;
    }

    // Only display "Modifiers" column if there are any modifiers to display.
    const hasModifiers = apiProperties.some((apiItem) => getModifiers(apiItem).length !== 0);
    const hasDefaultValues = apiProperties.some(
        (apiItem) => getDefaultValueBlock(apiItem) !== undefined,
    );

    const headerTitles: string[] = ["Property"];
    if (hasModifiers) {
        headerTitles.push("Modifiers");
    }
    if (hasDefaultValues) {
        headerTitles.push("Default Value");
    }
    headerTitles.push("Type");
    headerTitles.push("Description");

    const tableRows: DocTableRow[] = [];
    for (const apiProperty of apiProperties) {
        const rowCells: DocTableCell[] = [renderApiTitleCell(apiProperty, config)];
        if (hasModifiers) {
            rowCells.push(renderModifiersCell(apiProperty, config));
        }
        if (hasDefaultValues) {
            rowCells.push(renderDefaultValueCell(apiProperty, config));
        }
        rowCells.push(renderPropertyTypeCell(apiProperty, config));
        rowCells.push(renderApiSummaryCell(apiProperty, config));

        tableRows.push(new DocTableRow({ configuration: config.tsdocConfiguration }, rowCells));
    }

    return new DocTable(
        {
            configuration: config.tsdocConfiguration,
            headerTitles,
        },
        tableRows,
    );
}

/**
 * Renders a simple summary table for a list of packages.
 * Displays each package's name and description
 * ({@link https://tsdoc.org/pages/tags/packagedocumentation/ | @packageDocumentation}) comment.
 *
 * @param apiItems - The items to be rendered. All of these items must be of the kind specified via `itemKind`.
 * @param itemKind - The kind of items being rendered in the table. Used to determine the semantic shape of the table.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 */
export function renderPackagesTable(
    apiPackages: readonly ApiPackage[],
    config: Required<MarkdownDocumenterConfiguration>,
): DocTable | undefined {
    if (apiPackages.length === 0) {
        return undefined;
    }

    const headerTitles = ["Package", "Description"];
    const tableRows: DocTableRow[] = apiPackages.map(
        (apiPackage) =>
            new DocTableRow({ configuration: config.tsdocConfiguration }, [
                renderApiTitleCell(apiPackage, config),
                renderApiSummaryCell(apiPackage, config),
            ]),
    );

    return new DocTable(
        {
            configuration: config.tsdocConfiguration,
            headerTitles,
        },
        tableRows,
    );
}

/**
 * Renders a table cell containing the description (summary) comment for the provided API item.
 * If the item has an `@beta` release tag, the comment will be annotated as being beta content.
 *
 * @param apiItem - The API item whose comment will be rendered in the cell.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 */
export function renderApiSummaryCell(
    apiItem: ApiItem,
    config: Required<MarkdownDocumenterConfiguration>,
): DocTableCell {
    const docNodes: DocNode[] = [];

    if (ApiReleaseTagMixin.isBaseClassOf(apiItem)) {
        if (apiItem.releaseTag === ReleaseTag.Beta) {
            docNodes.push(
                new DocEmphasisSpan(
                    { configuration: config.tsdocConfiguration, bold: true, italic: true },
                    [
                        new DocPlainText({
                            configuration: config.tsdocConfiguration,
                            text: "(BETA) ",
                        }),
                    ],
                ),
            );
        }
    }

    if (apiItem instanceof ApiDocumentedItem) {
        if (apiItem.tsdocComment !== undefined) {
            docNodes.push(apiItem.tsdocComment.summarySection);
        }
    }

    return new DocTableCell({ configuration: config.tsdocConfiguration }, docNodes);
}

/**
 * Renders a table cell containing the return type information for the provided function-like API item,
 * if it specifies one. If it does not specify a type, an empty table cell will be rendered.
 *
 * @remarks This content will be rendered as links to type signature documentation for other items local to the same
 * API suite (model).
 *
 * @param apiItem - The API item whose return type will be rendered in the cell.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 */
export function renderReturnTypeCell(
    apiItem: ApiFunctionLike,
    config: Required<MarkdownDocumenterConfiguration>,
): DocTableCell {
    return ApiReturnTypeMixin.isBaseClassOf(apiItem)
        ? renderTypeExcerptCell(apiItem.returnTypeExcerpt, config)
        : renderEmptyTableCell(config);
}

/**
 * Renders a table cell containing the name of the provided API item.
 *
 * @remarks This content will be rendered as a link to the section content describing the API item.
 *
 * @param apiItem - The API item whose name will be rendered in the cell, and to whose content the generate link
 * will point.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 */
export function renderApiTitleCell(
    apiItem: ApiItem,
    config: Required<MarkdownDocumenterConfiguration>,
): DocTableCell {
    const itemLink = getLinkForApiItem(apiItem, config);
    return new DocTableCell({ configuration: config.tsdocConfiguration }, [
        new DocParagraph({ configuration: config.tsdocConfiguration }, [
            renderLink(itemLink, config),
        ]),
    ]);
}

/**
 * Renders a table cell containing a list of modifiers that apply.
 *
 * @param apiItem - The API item whose modifiers will be rendered in the cell.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 */
export function renderModifiersCell(
    apiItem: ApiItem,
    config: Required<MarkdownDocumenterConfiguration>,
): DocTableCell {
    const modifiers = getModifiers(apiItem);

    if (modifiers.length === 0) {
        return renderEmptyTableCell(config);
    }

    const modifiersList = modifiers.join(", ");

    return new DocTableCell({ configuration: config.tsdocConfiguration }, [
        new DocParagraph({ configuration: config.tsdocConfiguration }, [
            new DocPlainText({ configuration: config.tsdocConfiguration, text: modifiersList }),
        ]),
    ]);
}

/**
 * Renders a table cell containing the `@defaultValue` comment of the API item if it has one.
 *
 * @param apiItem - The API item whose `@defaultValue` comment will be rendered in the cell.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 */
export function renderDefaultValueCell(
    apiItem: ApiItem,
    config: Required<MarkdownDocumenterConfiguration>,
): DocTableCell {
    const defaultValueSection = getDefaultValueBlock(apiItem);

    if (defaultValueSection === undefined) {
        return renderEmptyTableCell(config);
    }

    return new DocTableCell({ configuration: config.tsdocConfiguration }, [defaultValueSection]);
}

/**
 * Renders a table cell containing the type information about the provided property.
 *
 * @remarks This content will be rendered as links to type signature documentation for other items local to the same
 * API suite (model).
 *
 * @param apiProperty - The property whose type information will be rendered in the cell.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 */
export function renderPropertyTypeCell(
    apiProperty: ApiPropertyItem,
    config: Required<MarkdownDocumenterConfiguration>,
): DocTableCell {
    return renderTypeExcerptCell(apiProperty.propertyTypeExcerpt, config);
}

/**
 * Renders a table cell containing the name of the provided parameter as plain text.
 *
 * @param apiParameter - The parameter whose name will be rendered in the cell
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 */
export function renderParameterTitleCell(
    apiParameter: Parameter,
    config: Required<MarkdownDocumenterConfiguration>,
): DocTableCell {
    return new DocTableCell({ configuration: config.tsdocConfiguration }, [
        new DocParagraph({ configuration: config.tsdocConfiguration }, [
            new DocPlainText({ configuration: config.tsdocConfiguration, text: apiParameter.name }),
        ]),
    ]);
}

/**
 * Renders a table cell containing the type information about the provided parameter.
 *
 * @remarks This content will be rendered as links to type signature documentation for other items local to the same
 * API suite (model).
 *
 * @param apiProperty - The parameter whose type information will be rendered in the cell.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 */
export function renderParameterTypeCell(
    apiParameter: Parameter,
    config: Required<MarkdownDocumenterConfiguration>,
): DocTableCell {
    return renderTypeExcerptCell(apiParameter.parameterTypeExcerpt, config);
}

/**
 * Renders a table cell containing the description ({@link https://tsdoc.org/pages/tags/param/ | @param}) comment
 * of the provided parameter.
 * If the parameter has no documentation, an empty cell will be rendered.
 *
 * @param apiParameter - The parameter whose comment will be rendered in the cell
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 */
export function renderParameterSummaryCell(
    apiParameter: Parameter,
    config: Required<MarkdownDocumenterConfiguration>,
): DocTableCell {
    return apiParameter.tsdocParamBlock === undefined
        ? renderEmptyTableCell(config)
        : new DocTableCell({ configuration: config.tsdocConfiguration }, [
              apiParameter.tsdocParamBlock.content,
          ]);
}

/**
 * Renders a table cell containing type information.
 * @remarks This content will be rendered as links to type signature documentation for other items local to the same
 * API suite (model).
 *
 * @param typeExcerpty - An excerpt describing the type to be rendered.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 */
export function renderTypeExcerptCell(
    typeExcerpt: Excerpt,
    config: Required<MarkdownDocumenterConfiguration>,
): DocTableCell {
    const renderedExcerpt = renderExcerptWithHyperlinks(typeExcerpt, config);

    return renderedExcerpt === undefined
        ? renderEmptyTableCell(config)
        : new DocTableCell({ configuration: config.tsdocConfiguration }, [
              new DocParagraph({ configuration: config.tsdocConfiguration }, [renderedExcerpt]),
          ]);
}

/**
 * Renders and empty table cell.
 *
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 */
export function renderEmptyTableCell(
    config: Required<MarkdownDocumenterConfiguration>,
): DocTableCell {
    return new DocTableCell({ configuration: config.tsdocConfiguration }, []);
}

/**
 * Gets the appropriate heading title for the provided item kind to be used in table entries.
 */
function getTableHeadingTitleForApiKind(itemKind: ApiItemKind): string {
    switch (itemKind) {
        case ApiItemKind.EnumMember:
            return "Flag";
        case ApiItemKind.MethodSignature:
            return ApiItemKind.Method;
        case ApiItemKind.PropertySignature:
            return ApiItemKind.Property;
        default:
            return itemKind;
    }
}

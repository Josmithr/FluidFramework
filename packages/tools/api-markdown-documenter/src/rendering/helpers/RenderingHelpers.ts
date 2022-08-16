/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
    ApiClass,
    ApiDeclaredItem,
    ApiDocumentedItem,
    ApiInterface,
    ApiItem,
    ApiItemKind,
    Excerpt,
    ExcerptTokenKind,
    HeritageType,
    IResolveDeclarationReferenceResult,
    TypeParameter,
} from "@microsoft/api-extractor-model";
import {
    DocBlock,
    DocFencedCode,
    DocLinkTag,
    DocNode,
    DocParagraph,
    DocPlainText,
    DocSection,
    StandardTags,
} from "@microsoft/tsdoc";

import { Heading } from "../../Heading";
import { Link, urlFromLink } from "../../Link";
import { MarkdownDocumenterConfiguration } from "../../MarkdownDocumenterConfiguration";
import { DocEmphasisSpan, DocHeading, DocList, DocNoteBox, ListKind } from "../../doc-nodes";
import {
    ApiFunctionLike,
    doesItemKindRequireOwnDocument,
    doesItemRequireOwnDocument,
    getAncestralHierarchy,
    getHeadingForApiItem,
    getLinkForApiItem,
    getLinkUrlForApiItem,
    getQualifiedApiItemName,
    mergeSections,
} from "../../utilities";
import { renderParametersSummaryTable } from "./TablesRenderingHelpers";

/**
 * Renders a section for an API signature.
 *
 * @remarks Displayed as a heading with a code-block under it.
 *
 * @param apiItem - The API item whose signature will be rendered.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 */
export function renderSignature(
    apiItem: ApiItem,
    config: Required<MarkdownDocumenterConfiguration>,
): DocSection | undefined {
    if (apiItem instanceof ApiDeclaredItem) {
        const signatureExcerpt = apiItem.getExcerptWithModifiers();
        if(signatureExcerpt !== "") {
            const docNodes: DocNode[] = [];
            docNodes.push(
                renderHeading(
                    { title: "Signature", id: `${getQualifiedApiItemName(apiItem)}-signature` },
                    config,
                ),
            );
            docNodes.push(
                new DocFencedCode({
                    configuration: config.tsdocConfiguration,
                    code: apiItem.getExcerptWithModifiers(),
                    language: "typescript",
                }),
            );

            const renderedHeritageTypes = renderHeritageTypes(apiItem, config);
            if (renderedHeritageTypes !== undefined) {
                docNodes.push(renderedHeritageTypes);
            }

            return new DocSection({ configuration: config.tsdocConfiguration }, docNodes);
        }
    }
    return undefined;
}

export function renderHeritageTypes(
    apiItem: ApiItem,
    config: Required<MarkdownDocumenterConfiguration>,
): DocSection | undefined {
    const docNodes: DocNode[] = [];

    if (apiItem instanceof ApiClass) {
        // Render `extends` type if there is one.
        if (apiItem.extendsType) {
            const renderedExtendsTypes = renderHeritageTypeList(
                [apiItem.extendsType],
                "Extends",
                config,
            );
            if (renderedExtendsTypes === undefined) {
                throw new Error(
                    'No content was rendered for non-empty "extends" type list. This should not be possible.',
                );
            }
            docNodes.push(renderedExtendsTypes);
        }

        // Render `implements` types if there are any.
        const renderedImplementsTypes = renderHeritageTypeList(
            apiItem.implementsTypes,
            "Implements",
            config,
        );
        if (renderedImplementsTypes !== undefined) {
            docNodes.push(renderedImplementsTypes);
        }

        // Render type parameters if there are any.
        const renderedTypeParameters = renderTypeParameters(apiItem.typeParameters, config);
        if (renderedTypeParameters !== undefined) {
            docNodes.push(renderedTypeParameters);
        }
    }

    if (apiItem instanceof ApiInterface) {
        // Render `extends` types if there are any.
        const renderedExtendsTypes = renderHeritageTypeList(
            apiItem.extendsTypes,
            "Extends",
            config,
        );
        if (renderedExtendsTypes !== undefined) {
            docNodes.push(renderedExtendsTypes);
        }

        // Render type parameters if there are any.
        const renderedTypeParameters = renderTypeParameters(apiItem.typeParameters, config);
        if (renderedTypeParameters !== undefined) {
            docNodes.push(renderedTypeParameters);
        }
    }

    return new DocSection({ configuration: config.tsdocConfiguration }, docNodes);
}

function renderHeritageTypeList(
    heritageTypes: readonly HeritageType[],
    label: string,
    config: Required<MarkdownDocumenterConfiguration>,
): DocParagraph | undefined {
    if (heritageTypes.length > 0) {
        const docNodes: DocNode[] = [];

        docNodes.push(
            new DocEmphasisSpan({ configuration: config.tsdocConfiguration, bold: true }, [
                new DocPlainText({ configuration: config.tsdocConfiguration, text: `${label}: ` }),
            ]),
        );

        let needsComma: boolean = false;
        for (const heritageType of heritageTypes) {
            if (needsComma) {
                docNodes.push(
                    new DocPlainText({ configuration: config.tsdocConfiguration, text: ", " }),
                );
            }

            docNodes.push(renderExcerptWithHyperlinks(heritageType.excerpt, config));
            needsComma = true;
        }

        return new DocParagraph({ configuration: config.tsdocConfiguration }, docNodes);
    }
    return undefined;
}

export function renderTypeParameters(
    typeParameters: readonly TypeParameter[],
    config: Required<MarkdownDocumenterConfiguration>,
): DocSection | undefined {
    if (typeParameters.length > 0) {
        const listItemNodes: DocNode[] = [];
        for (const typeParameter of typeParameters) {
            const paragraphNodes: DocNode[] = [];

            paragraphNodes.push(
                new DocEmphasisSpan({ configuration: config.tsdocConfiguration, bold: true }, [
                    new DocPlainText({
                        configuration: config.tsdocConfiguration,
                        text: typeParameter.name,
                    }),
                ]),
            );

            if (typeParameter.tsdocTypeParamBlock !== undefined) {
                paragraphNodes.push(
                    new DocPlainText({ configuration: config.tsdocConfiguration, text: ": " }),
                );
                paragraphNodes.push(...typeParameter.tsdocTypeParamBlock.content.nodes);
            }

            listItemNodes.push(
                new DocParagraph({ configuration: config.tsdocConfiguration }, paragraphNodes),
            );
        }

        return new DocSection({ configuration: config.tsdocConfiguration }, [
            new DocParagraph({ configuration: config.tsdocConfiguration }, [
                new DocEmphasisSpan({ configuration: config.tsdocConfiguration, bold: true }, [
                    new DocPlainText({
                        configuration: config.tsdocConfiguration,
                        text: "Type parameters: ",
                    }),
                ]),
            ]),
            new DocList(
                { configuration: config.tsdocConfiguration, listKind: ListKind.Unordered },
                listItemNodes,
            ),
        ]);
    }
    return undefined;
}

export function renderExcerptWithHyperlinks(
    excerpt: Excerpt,
    config: Required<MarkdownDocumenterConfiguration>,
): DocParagraph {
    const docNodes: DocNode[] = [];
    for (const token of excerpt.spannedTokens) {
        // Markdown doesn't provide a standardized syntax for hyperlinks inside code spans, so we will render
        // the type expression as DocPlainText.  Instead of creating multiple DocParagraphs, we can simply
        // discard any newlines and let the renderer do normal word-wrapping.
        const unwrappedTokenText: string = token.text.replace(/[\r\n]+/g, " ");

        let wroteHyperlink = false;

        // If it's hyperlink-able, then append a DocLinkTag
        if (token.kind === ExcerptTokenKind.Reference && token.canonicalReference) {
            const apiItemResult: IResolveDeclarationReferenceResult =
                config.apiModel.resolveDeclarationReference(token.canonicalReference, undefined);

            if (apiItemResult.resolvedApiItem) {
                docNodes.push(
                    new DocLinkTag({
                        configuration: config.tsdocConfiguration,
                        tagName: "@link",
                        linkText: unwrappedTokenText,
                        urlDestination: getLinkUrlForApiItem(apiItemResult.resolvedApiItem, config),
                    }),
                );
                wroteHyperlink = true;
            }
        }

        // If the token was not one from which we generated hyperlink text, write as plain text instead
        if (!wroteHyperlink) {
            docNodes.push(
                new DocPlainText({
                    configuration: config.tsdocConfiguration,
                    text: unwrappedTokenText,
                }),
            );
        }
    }
    return new DocParagraph({ configuration: config.tsdocConfiguration }, docNodes);
}

export function renderBreadcrumb(
    apiItem: ApiItem,
    config: Required<MarkdownDocumenterConfiguration>,
): DocSection {
    // TODO: old system generated link text "Packages" for Model document

    const docNodes: DocNode[] = [];

    // Get ordered ancestry of document items
    const ancestry = getAncestralHierarchy(apiItem, (hierarchyItem) =>
        doesItemRequireOwnDocument(hierarchyItem, config.documentBoundaries),
    ).reverse(); // Reverse from ascending to descending order

    function createLinkTag(link: Link): DocLinkTag {
        const linkUrl = urlFromLink(link);
        return new DocLinkTag({
            configuration: config.tsdocConfiguration,
            tagName: "@link",
            linkText: link.text,
            urlDestination: linkUrl,
        });
    }

    let writtenAnythingYet = false;
    for (const hierarchyItem of ancestry) {
        if (writtenAnythingYet) {
            docNodes.push(
                new DocPlainText({
                    configuration: config.tsdocConfiguration,
                    text: " > ",
                }),
            );
        }

        const link = getLinkForApiItem(hierarchyItem, config);
        docNodes.push(createLinkTag(link));

        writtenAnythingYet = true;
    }

    return new DocSection({ configuration: config.tsdocConfiguration }, [
        new DocParagraph({ configuration: config.tsdocConfiguration }, docNodes),
    ]);
}

export function renderHeadingForApiItem(
    apiItem: ApiItem,
    config: Required<MarkdownDocumenterConfiguration>,
): DocHeading {
    return renderHeading(getHeadingForApiItem(apiItem, config), config);
}

export function renderHeading(
    heading: Heading,
    config: Required<MarkdownDocumenterConfiguration>,
): DocHeading {
    return new DocHeading({
        ...heading,
        configuration: config.tsdocConfiguration,
    });
}

export function renderBetaWarning(config: Required<MarkdownDocumenterConfiguration>): DocNoteBox {
    const betaWarning: string =
        "This API is provided as a preview for developers and may change" +
        " based on feedback that we receive. Do not use this API in a production environment.";

    return new DocNoteBox({ configuration: config.tsdocConfiguration }, [
        new DocParagraph({ configuration: config.tsdocConfiguration }, [
            new DocPlainText({ configuration: config.tsdocConfiguration, text: betaWarning }),
        ]),
    ]);
}

export function renderSummary(apiItem: ApiItem): DocSection | undefined {
    return apiItem instanceof ApiDocumentedItem && apiItem.tsdocComment !== undefined
        ? apiItem.tsdocComment.summarySection
        : undefined;
}

export function renderRemarks(
    apiItem: ApiItem,
    config: Required<MarkdownDocumenterConfiguration>,
): DocSection | undefined {
    if (apiItem instanceof ApiDocumentedItem && apiItem.tsdocComment?.remarksBlock !== undefined) {
        return new DocSection({ configuration: config.tsdocConfiguration }, [
            renderHeading(
                { title: "Remarks", id: `${getQualifiedApiItemName(apiItem)}-remarks` },
                config,
            ),
            apiItem.tsdocComment.remarksBlock.content,
        ]);
    }
    return undefined;
}

export function renderDeprecationNotice(
    apiItem: ApiItem,
    config: Required<MarkdownDocumenterConfiguration>,
): DocSection | undefined {
    if (
        apiItem instanceof ApiDocumentedItem &&
        apiItem.tsdocComment?.deprecatedBlock !== undefined
    ) {
        return new DocSection({ configuration: config.tsdocConfiguration }, [
            new DocNoteBox(
                {
                    configuration: config.tsdocConfiguration,
                },
                [...apiItem.tsdocComment.deprecatedBlock.content.nodes],
            ),
        ]);
    }
    return undefined;
}

export function renderExamples(
    apiItem: ApiItem,
    config: Required<MarkdownDocumenterConfiguration>,
): DocSection | undefined {
    if (apiItem instanceof ApiDocumentedItem && apiItem.tsdocComment?.customBlocks !== undefined) {
        const exampleBlocks: DocBlock[] = apiItem.tsdocComment.customBlocks.filter(
            (x) => x.blockTag.tagNameWithUpperCase === StandardTags.example.tagNameWithUpperCase,
        );

        if (exampleBlocks.length === 0) {
            return undefined;
        }

        // If there is only 1 example, render it with the default (un-numbered) heading
        if (exampleBlocks.length === 1) {
            return renderExample({ apiItem, content: exampleBlocks[0].content }, config);
        }

        const exampleSections: DocSection[] = [];
        for (let i = 0; i < exampleBlocks.length; i++) {
            exampleSections.push(
                renderExample(
                    { apiItem, content: exampleBlocks[i].content, exampleNumber: i + 1 },
                    config,
                ),
            );
        }

        // Merge example sections into a single section to simplify hierarchy
        const mergedSection = mergeSections(exampleSections, config.tsdocConfiguration);

        return new DocSection({ configuration: config.tsdocConfiguration }, [
            renderHeading(
                { title: "Examples", id: `${getQualifiedApiItemName(apiItem)}-examples` },
                config,
            ),
            mergedSection,
        ]);
    }
    return undefined;
}

/**
 * Represents a single `@example` comment block for a given API item.
 */
export interface DocExample {
    /**
     * The API item the example doc content belongs to.
     */
    apiItem: ApiItem;

    /**
     * `@example` comment body.
     */
    content: DocSection;

    /**
     * Example number. Used to disambiguate multiple `@example` comments numerically.
     * If not specified, example heading will not be labeled with a number.
     */
    exampleNumber?: number;
}

export function renderExample(
    example: DocExample,
    config: Required<MarkdownDocumenterConfiguration>,
): DocSection {
    const headingTitle: string =
        example.exampleNumber === undefined ? "Example" : `Example ${example.exampleNumber}`;

    const headingId = `${getQualifiedApiItemName(example.apiItem)}-example${
        example.exampleNumber === undefined ? "" : example.exampleNumber
    }`;

    return new DocSection({ configuration: config.tsdocConfiguration }, [
        renderHeading({ title: headingTitle, id: headingId }, config),
        example.content,
    ]);
}

export function renderParametersSection(
    apiFunctionLike: ApiFunctionLike,
    config: Required<MarkdownDocumenterConfiguration>,
): DocSection | undefined {
    if (apiFunctionLike.parameters.length === 0) {
        return undefined;
    }

    return new DocSection({ configuration: config.tsdocConfiguration }, [
        renderHeading(
            { title: "Parameters", id: `${getQualifiedApiItemName(apiFunctionLike)}-parameters` },
            config,
        ),
        renderParametersSummaryTable(apiFunctionLike.parameters, config),
    ]);
}

export function renderChildrenUnderHeading(
    childItems: readonly ApiItem[],
    headingTitle: string,
    config: Required<MarkdownDocumenterConfiguration>,
    renderChild: (childItem: ApiItem) => DocSection,
): DocSection | undefined {
    if (childItems.length === 0) {
        return undefined;
    }

    const childSections: DocSection[] = childItems.map((childItem) => renderChild(childItem));

    return new DocSection({ configuration: config.tsdocConfiguration }, [
        renderHeading(
            {
                title: headingTitle,
            },
            config,
        ),
        mergeSections(childSections, config.tsdocConfiguration),
    ]);
}

export interface ChildSectionProperties {
    headingTitle: string;
    itemKind: ApiItemKind;
    items: readonly ApiItem[];
}

export function renderChildDetailsSection(
    childSections: readonly ChildSectionProperties[],
    config: Required<MarkdownDocumenterConfiguration>,
    renderChild: (apiItem) => DocSection,
): DocSection | undefined {
    const childNodes: DocSection[] = [];

    for (const childSection of childSections) {
        // Only render contents for a section if the item kind is one that gets rendered to its parent's document
        // (i.e. it does not get rendered to its own document).
        // Also only render the section if it actually has contents to render (to avoid empty headings).
        if (
            !doesItemKindRequireOwnDocument(childSection.itemKind, config.documentBoundaries) &&
            childSection.items.length !== 0
        ) {
            const renderedChildSection = renderChildrenUnderHeading(
                childSection.items,
                childSection.headingTitle,
                config,
                renderChild,
            );
            if (renderedChildSection !== undefined) {
                childNodes.push(renderedChildSection);
            }
        }
    }

    return childNodes.length === 0
        ? undefined
        : mergeSections(childNodes, config.tsdocConfiguration);
}

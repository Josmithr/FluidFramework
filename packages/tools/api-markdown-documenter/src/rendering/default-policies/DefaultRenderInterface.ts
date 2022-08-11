import { ApiInterface, ApiItem } from "@microsoft/api-extractor-model";
import { DocParagraph, DocPlainText, DocSection, TSDocConfiguration } from "@microsoft/tsdoc";

import { MarkdownDocumenterConfiguration } from "../../MarkdownDocumenterConfiguration";

export function renderInterfaceSection(
    apiInterface: ApiInterface,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
    renderChild: (apiItem: ApiItem) => DocSection,
): DocSection {
    const innerSectionBody = new DocSection({ configuration: tsdocConfiguration }, [
        new DocParagraph({ configuration: tsdocConfiguration }, [
            new DocPlainText({
                configuration: tsdocConfiguration,
                text: "TODO: Interface rendering",
            }),
        ]),
    ]);

    return documenterConfiguration.renderSectionBlock(
        apiInterface,
        innerSectionBody,
        documenterConfiguration,
        tsdocConfiguration,
    );
}

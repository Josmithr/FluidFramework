import { ApiModel } from "@microsoft/api-extractor-model";
import { TSDocConfiguration } from "@microsoft/tsdoc";
import { NewlineKind } from "@rushstack/node-core-library";

import { PolicyOptions, defaultPolicyOptions } from "./Policies";
import { CustomDocNodes } from "./doc-nodes";
import { RenderingPolicies, defaultRenderingPolicies } from "./rendering/RenderingPolicy";

// TODOs:
// - Define "document" in terms of stream output, since we aren't necessarily writing files.

/**
 * Configuration options for the Markdown documenter.
 */
export interface MarkdownDocumenterConfiguration extends PolicyOptions, RenderingPolicies {
    /**
     * API Model for which the documentation is being generated.
     *
     * @remarks Beyond being the root entry for rendering, this is used to resolve member links globally, etc.
     */
    apiModel: ApiModel;

    /**
     * Default root uri used when generating content links.
     */
    readonly uriRoot: string;

    /**
     * Specifies what type of newlines API Documenter should use when writing output files.
     * By default, the output files will be written with Windows-style newlines.
     */
    readonly newlineKind?: NewlineKind;

    /**
     * TSDoc Configuration to use when parsing source-code documentation.
     *
     * @defaultValue {@link CustomDocNodes.configuration}
     */
    readonly tsdocConfiguration?: TSDocConfiguration;

    /**
     * Whether or not verbose logging is enabled.
     *
     * @defaultValue false.
     */
    readonly verbose?: boolean;
}

export function markdownDocumenterConfigurationWithDefaults(
    partialConfig: MarkdownDocumenterConfiguration,
): Required<MarkdownDocumenterConfiguration> {
    return {
        newlineKind: NewlineKind.OsDefault,
        tsdocConfiguration: CustomDocNodes.configuration,
        verbose: false,
        ...defaultPolicyOptions,
        ...defaultRenderingPolicies,
        ...partialConfig,
    };
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ApiModel } from "@microsoft/api-extractor-model";
import { TSDocConfiguration } from "@microsoft/tsdoc";
import { NewlineKind } from "@rushstack/node-core-library";

import { PolicyOptions, defaultPolicyOptions } from "./Policies";
import { CustomDocNodes } from "./doc-nodes";
import { RenderingPolicies, defaultRenderingPolicies } from "./rendering";

/**
 * Configuration options for the Markdown documenter.
 */
export interface MarkdownDocumenterConfiguration extends PolicyOptions, RenderingPolicies {
    /**
     * API Model for which the documentation is being generated.
     * This is the output of {@link https://api-extractor.com/ | API-Extractor}.
     *
     * @remarks Beyond being the root entry for rendering, this is used to resolve member links globally, etc.
     *
     * If you need to generate a model from API reports on disk, see {@link readModel}.
     */
    apiModel: ApiModel;

    /**
     * Default root URI used when generating content links.
     */
    readonly uriRoot: string;

    /**
     * Specifies what type of newlines API Documenter should use when writing output files.
     * By default, the output files will be written with Windows-style newlines.
     */
    readonly newlineKind?: NewlineKind;

    /**
     * TSDoc Configuration to use when parsing source-code documentation.
     * If not provided, a default configuration will be used.
     */
    readonly tsdocConfiguration?: TSDocConfiguration;

    /**
     * Whether or not verbose logging is enabled.
     *
     * @defaultValue `false`
     */
    readonly verbose?: boolean;
}

/**
 * Creates a complete system configuration by filling in any optional properties with defaults.
 * @param partialConfig - Configuration with optional properties. Any missing properties will be filled in with
 * default values. Any specified properties will take precedence over defaults.
 */
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

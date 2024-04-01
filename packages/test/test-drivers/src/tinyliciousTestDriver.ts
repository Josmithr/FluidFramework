/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest } from "@fluidframework/core-interfaces";
import { IDocumentServiceFactory, IResolvedUrl } from "@fluidframework/driver-definitions/internal";
import { ITestDriver } from "@fluidframework/test-driver-definitions";
import {
	InsecureTinyliciousTokenProvider,
	InsecureTinyliciousUrlResolver,
	createTinyliciousCreateNewRequest,
	defaultTinyliciousPort,
} from "@fluidframework/tinylicious-driver";

import { RouterliciousDriverApi, RouterliciousDriverApiType } from "./routerliciousDriverApi.js";

/**
 * @internal
 */
export class TinyliciousTestDriver implements ITestDriver {
	public readonly type = "tinylicious";
	public readonly endpointName = "local";
	public get version() {
		return this.api.version;
	}

	constructor(private readonly api: RouterliciousDriverApiType = RouterliciousDriverApi) {}
	createDocumentServiceFactory(): IDocumentServiceFactory {
		return new this.api.RouterliciousDocumentServiceFactory(
			new InsecureTinyliciousTokenProvider(),
		);
	}
	createUrlResolver(): InsecureTinyliciousUrlResolver {
		return new InsecureTinyliciousUrlResolver();
	}
	createCreateNewRequest(testId: string): IRequest {
		return createTinyliciousCreateNewRequest(testId);
	}
	async createContainerUrl(testId: string, containerUrl?: IResolvedUrl): Promise<string> {
		const containerId = containerUrl && "id" in containerUrl ? containerUrl.id : testId;
		return `http://localhost:${defaultTinyliciousPort}/${containerId}`;
	}
}

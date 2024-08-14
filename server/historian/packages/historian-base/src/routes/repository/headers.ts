/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AsyncLocalStorage } from "async_hooks";
import { IHeader } from "@fluidframework/gitresources";
import {
	IStorageNameRetriever,
	IThrottler,
	IRevokedTokenChecker,
	IDocumentManager,
} from "@fluidframework/server-services-core";
import {
	IThrottleMiddlewareOptions,
	throttle,
	getParam,
} from "@fluidframework/server-services-utils";
import { validateRequestParams } from "@fluidframework/server-services-shared";
import { Router } from "express";
import * as nconf from "nconf";
import winston from "winston";
import { ICache, IDenyList, ITenantService } from "../../services";
import * as utils from "../utils";
import { Constants } from "../../utils";

export function create(
	config: nconf.Provider,
	tenantService: ITenantService,
	storageNameRetriever: IStorageNameRetriever,
	restTenantThrottlers: Map<string, IThrottler>,
	restClusterThrottlers: Map<string, IThrottler>,
	documentManager: IDocumentManager,
	cache?: ICache,
	asyncLocalStorage?: AsyncLocalStorage<string>,
	revokedTokenChecker?: IRevokedTokenChecker,
	denyList?: IDenyList,
	ephemeralDocumentTTLSec?: number,
): Router {
	const router: Router = Router();

	const tenantThrottleOptions: Partial<IThrottleMiddlewareOptions> = {
		throttleIdPrefix: (req) => getParam(req.params, "tenantId"),
		throttleIdSuffix: Constants.historianRestThrottleIdSuffix,
	};
	const restTenantGeneralThrottler = restTenantThrottlers.get(
		Constants.generalRestCallThrottleIdPrefix,
	);

	async function getHeader(
		tenantId: string,
		authorization: string,
		sha: string,
		useCache: boolean,
	): Promise<IHeader> {
		const service = await utils.createGitService({
			config,
			tenantId,
			authorization,
			tenantService,
			storageNameRetriever,
			documentManager,
			cache,
			asyncLocalStorage,
			denyList,
			ephemeralDocumentTTLSec,
		});
		return service.getHeader(sha, useCache);
	}

	async function getTree(
		tenantId: string,
		authorization: string,
		sha: string,
		useCache: boolean,
	): Promise<any> {
		const service = await utils.createGitService({
			config,
			tenantId,
			authorization,
			tenantService,
			storageNameRetriever,
			documentManager,
			cache,
			asyncLocalStorage,
			denyList,
			ephemeralDocumentTTLSec,
		});
		return service.getFullTree(sha, useCache);
	}

	router.get(
		"/repos/:ignored?/:tenantId/headers/:sha",
		validateRequestParams("tenantId", "sha"),
		throttle(restTenantGeneralThrottler, winston, tenantThrottleOptions),
		utils.verifyToken(revokedTokenChecker),
		(request, response, next) => {
			const useCache = !("disableCache" in request.query);
			const headerP = getHeader(
				request.params.tenantId,
				request.get("Authorization"),
				request.params.sha,
				useCache,
			);
			utils.handleResponse(headerP, response, useCache);
		},
	);

	router.get(
		"/repos/:ignored?/:tenantId/tree/:sha",
		validateRequestParams("tenantId", "sha"),
		throttle(restTenantGeneralThrottler, winston, tenantThrottleOptions),
		utils.verifyToken(revokedTokenChecker),
		(request, response, next) => {
			const useCache = !("disableCache" in request.query);
			const headerP = getTree(
				request.params.tenantId,
				request.get("Authorization"),
				request.params.sha,
				useCache,
			);
			utils.handleResponse(headerP, response, useCache);
		},
	);

	return router;
}

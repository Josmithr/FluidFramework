/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import type { Server } from "node:http";

import cors from "cors";
import express from "express";

import { initializeCustomerService } from "../mock-customer-service/index.js";
import { customerServicePort } from "../mock-customer-service-interface/index.js";
import {
	type MockWebhook,
	initializeExternalDataService,
} from "../mock-external-data-service/index.js";
import { externalDataServicePort } from "../mock-external-data-service-interface/index.js";
import type { ITaskData } from "../model-interface/index.js";

import { closeServer, delay, waitForCondition } from "./utilities.js";

const localServicePort = 5002;
const externalTaskListId = "task-list-1";

const getCustomerServiceWebhookUrl = (taskListId: string): string =>
	`http://localhost:${customerServicePort}/external-data-webhook?externalTaskListId=${taskListId}`;

const assertWebhookChangeNotification = (notification: unknown): void => {
	const actual = notification as {
		signalContent?: { contents?: { content?: { externalTaskListId?: unknown } } };
	};
	assert.equal(
		actual.signalContent?.contents?.content?.externalTaskListId,
		externalTaskListId,
	);
};

/**
 * Helper function for registering with the external service for notifications.
 */
const registerExternalServiceWebhook = async (taskListId: string): Promise<Response> => {
	const webhookRegistrationResponse = await fetch(
		`http://localhost:${externalDataServicePort}/register-for-webhook`,
		{
			method: "POST",
			headers: {
				"Access-Control-Allow-Origin": "*",
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				url: getCustomerServiceWebhookUrl(taskListId),
				externalTaskListId: taskListId,
			}),
		},
	);
	return webhookRegistrationResponse;
};

/**
 * Helper function for updating data within the external data service.
 * It also tests the response for a given code as well and will fail if it doesn't match.
 */
const updateExternalData = async (data: ITaskData, taskListId: string): Promise<Response> => {
	const dataUpdateResponse = await fetch(
		`http://localhost:${externalDataServicePort}/set-tasks/${taskListId}`,
		{
			method: "POST",
			headers: {
				"Access-Control-Allow-Origin": "*",
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				taskList: {
					...data,
				},
				externalTaskListId: taskListId,
			}),
		},
	);

	return dataUpdateResponse;
};

/**
 * Helper function for registering a Fluid session with the customer service.
 */
const registerSessionWithCustomerService = async (
	taskListId: string,
	tenantId: string,
	documentId: string,
): Promise<Response> => {
	const registerSessionUrl = await fetch(
		`http://localhost:${customerServicePort}/register-session-url`,
		{
			method: "POST",
			headers: {
				"Access-Control-Allow-Origin": "*",
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				externalTaskListId: taskListId,
				tenantId,
				documentId,
			}),
		},
	);
	return registerSessionUrl;
};

/**
 * Helper function to configure a local express server meant to simulate the Fluid service.
 */
const initializeMockFluidService = (localServiceApp: express.Express): express.Express => {
	localServiceApp.use(express.json());
	localServiceApp.use(cors());
	return localServiceApp;
};

/**
 * @remarks
 *
 * These tests spin up their own Express server instances so we can directly test against it
 * (using supertest), rather than leaning on network calls.
 */
describe("mock-customer-service", function () {
	// These tests require a bit more time to run, so we increase the timeout for this suite.
	this.timeout(10000);

	/**
	 * Express server instance backing our mock external data service.
	 */
	let externalDataService: Server | undefined;

	/**
	 * Express server instance backing our mock customer service.
	 */
	let customerService: Server | undefined;

	/**
	 * Datastore mapping of external resource id to its subscribers.
	 *
	 * @defaultValue A new new map will be initialized.
	 */
	let webhookCollection: Map<string, MockWebhook<ITaskData>>;

	beforeEach(async () => {
		webhookCollection = new Map<string, MockWebhook<ITaskData>>();
		externalDataService = await initializeExternalDataService({
			port: externalDataServicePort,
			webhookCollection,
		});
		customerService = await initializeCustomerService({
			port: customerServicePort,
			externalDataServiceWebhookRegistrationUrl: `http://localhost:${externalDataServicePort}/register-for-webhook`,
			externalDataServiceWebhookUnregistrationUrl: `http://localhost:${externalDataServicePort}/unregister-webhook`,
			fluidServiceUrl: `http://localhost:${localServicePort}`,
		});
	});

	/* eslint-disable @typescript-eslint/no-non-null-assertion */

	afterEach(async () => {
		const _externalDataService = externalDataService!;
		const _customerService = customerService!;

		externalDataService = undefined;
		customerService = undefined;

		await closeServer(_externalDataService);
		await closeServer(_customerService);

		// Something about shutting down the servers after each test and then starting new ones on the same ports before
		// running the next test is causing issues where the second test to run gets an "other side closed" message when
		// it tries to issue its first request to the services. This does not happen on Node18 but does on Node20.
		// I couldn't figure out why, but letting the JS turn end here before the test runs seems to fix it.
		await new Promise<void>((resolve) => {
			setTimeout(resolve, 0);
		});
	});

	// We have omitted `@types/supertest` due to cross-package build issue.
	// So for these tests we have to live with `any`.
	it("register-for-webhook: Complete data flow", async () => {
		// Set up mock local service, which will be registered as webhook listener
		const localServiceApp = initializeMockFluidService(express());
		const tenantId = "tinylicious";
		const documentId = "container1";

		// Bind listener
		let webhookChangeNotification;
		let wasFluidNotifiedForChange = false;
		localServiceApp.post(`/${tenantId}/${documentId}/broadcast-signal`, (request, result) => {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
			webhookChangeNotification = request.body;
			wasFluidNotifiedForChange = true;
			result.send();
		});

		const localService: Server = localServiceApp.listen(localServicePort);

		try {
			// 1. Register Fluid container URL for notifications with the customer service
			const registerSessionUrl = await registerSessionWithCustomerService(
				externalTaskListId,
				tenantId,
				documentId,
			);
			assert.equal(registerSessionUrl.status, 200);

			// 2. Register with the external service for notifications
			const webhookRegistrationResponse =
				await registerExternalServiceWebhook(externalTaskListId);
			assert.equal(webhookRegistrationResponse.status, 200);

			// 3. Update external data
			const taskDataUpdate = {
				42: {
					name: "Determine the meaning of life",
					priority: 37,
				},
			};
			const dataUpdateResponse = await updateExternalData(taskDataUpdate, externalTaskListId);
			assert.equal(dataUpdateResponse.status, 200);

			await waitForCondition(
				() => wasFluidNotifiedForChange,
				"the Fluid service notification",
			);

			// 4. Verify our listener was notified of data change.
			assert.equal(wasFluidNotifiedForChange, true);
			assertWebhookChangeNotification(webhookChangeNotification);
		} finally {
			await closeServer(localService);
		}
	});
	/* eslint-enable @typescript-eslint/no-non-null-assertion */

	it("register-session-url: Complete data flow", async () => {
		// Set up mock local Fluid service, which will be registered as webhook listener
		const localServiceApp = initializeMockFluidService(express());
		const tenantId = "tinylicious";
		const documentId = "container1";

		// Bind listener
		let webhookChangeNotification;
		localServiceApp.post(`/${tenantId}/${documentId}/broadcast-signal`, (request, result) => {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
			webhookChangeNotification = request.body;
			result.send();
		});

		const localService: Server = localServiceApp.listen(localServicePort);

		try {
			// 1. Register Fluid container URL for notifications with the customer service
			const registerSessionUrl = await registerSessionWithCustomerService(
				externalTaskListId,
				tenantId,
				documentId,
			);
			assert.equal(registerSessionUrl.status, 200);

			// 2. Update external data within the external data service,
			// which should relay the changes to the customer notification service.
			const taskDataUpdate = {
				42: {
					name: "Determine the meaning of life",
					priority: 37,
				},
			};
			const dataUpdateResponse = await updateExternalData(taskDataUpdate, externalTaskListId);
			if (dataUpdateResponse.status !== 200) {
				console.log(`Data update failed. Code: ${dataUpdateResponse.status}`);
			}

			await waitForCondition(
				() => webhookChangeNotification !== undefined,
				"the customer service notification",
			);

			// Verify our listener was notified of data change.
			assertWebhookChangeNotification(webhookChangeNotification);
		} finally {
			await closeServer(localService);
		}
	});

	it("events-listener: Complete data flow for session-end event", async () => {
		// Set up mock local Fluid service, which will be registered as webhook listener
		const localServiceApp = initializeMockFluidService(express());
		const tenantId = "tinylicious";
		const documentId = "container1";

		// Bind listener
		let webhookChangeNotification;
		let notificationCount = 0;
		localServiceApp.post(`/${tenantId}/${documentId}/broadcast-signal`, (request, result) => {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
			webhookChangeNotification = request.body;
			notificationCount++;
			result.send();
		});

		const localService: Server = localServiceApp.listen(localServicePort);

		try {
			// 1. Register Fluid container URL for notifications with the customer service
			const registerSessionUrl = await registerSessionWithCustomerService(
				externalTaskListId,
				tenantId,
				documentId,
			);
			assert.equal(registerSessionUrl.status, 200);
			await waitForCondition(
				() =>
					webhookCollection
						.get(externalTaskListId)
						?.subscribers.includes(getCustomerServiceWebhookUrl(externalTaskListId)) === true,
				"customer service webhook registration",
			);

			// 2. Update external data within the external data service,
			// which should relay the changes to the customer notification service.
			const taskDataUpdate = {
				42: {
					name: "Determine the meaning of life",
					priority: 37,
				},
			};
			const dataUpdateResponse = await updateExternalData(taskDataUpdate, externalTaskListId);
			assert.equal(dataUpdateResponse.status, 200);

			await waitForCondition(
				() => notificationCount === 1,
				"the first external data notification",
			);

			// Verify our listener was notified of data change.
			assertWebhookChangeNotification(webhookChangeNotification);

			// 3. Tell the customer service that the session has ended, which should
			// unregister the outstanding webhook for the given container URL and task list id
			const sessionEndEventResponse = await fetch(
				`http://localhost:${customerServicePort}/events-listener`,
				{
					method: "POST",
					headers: {
						"Access-Control-Allow-Origin": "*",
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						type: "session-end",
						documentId,
						tenantId,
					}),
				},
			);
			assert.equal(sessionEndEventResponse.status, 200);

			// 4. Update external data within the external data service,
			// which should relay the changes to the customer notification service.
			const taskDataUpdate2 = {
				42: {
					name: "Some other task name",
					priority: 52,
				},
			};
			const dataUpdateResponse2 = await updateExternalData(
				taskDataUpdate2,
				externalTaskListId,
			);
			assert.equal(dataUpdateResponse2.status, 200);

			// Allow enough time for an unexpected second notification to arrive.
			await delay(1000);
			assert.equal(notificationCount, 1);
		} finally {
			await closeServer(localService);
		}
	});
});

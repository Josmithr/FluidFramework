/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { gitHashFile, hashFile } from "../../indexNode.js";

import type { BrowserHashApi } from "./browserHash.js";

const assetsDirectory = path.resolve(__dirname, "../../../src/test/playwright/assets");
const browserHashBundlePath = path.join(__dirname, "browserHash.bundle.js");

let xmlFile: Buffer;
let svgFile: Buffer;
let pdfFile: Buffer;
let gifFile: Buffer;
let server: http.Server;
let serverUrl: string;

test.beforeAll(async () => {
	server = http.createServer((_request, response) => {
		response.statusCode = 200;
		response.setHeader("Content-Type", "text/plain");
		response.end("basic test server");
	});

	await new Promise<void>((resolve, reject) => {
		server.on("listening", resolve);
		server.on("error", reject);
		server.listen(0, "localhost");
	});

	const port = (server.address() as AddressInfo).port;
	serverUrl = `http://localhost:${port}`;

	xmlFile = await fs.readFile(path.join(assetsDirectory, "book.xml"));
	svgFile = await fs.readFile(path.join(assetsDirectory, "bindy.svg"));
	pdfFile = await fs.readFile(path.join(assetsDirectory, "aka.pdf"));
	gifFile = await fs.readFile(path.join(assetsDirectory, "grid.gif"));
});

test.afterAll(async () => {
	await new Promise<void>((resolve, reject) => {
		server.close((error) => (error === undefined ? resolve() : reject(error)));
	});
});

test.beforeEach(async ({ page }) => {
	await page.goto(serverUrl, { waitUntil: "load" });
	await page.addScriptTag({ path: browserHashBundlePath });
});

async function browserHash(
	page: Page,
	file: Buffer,
	algorithm: "SHA-1" | "SHA-256",
	encoding: "hex" | "base64",
): Promise<string> {
	return page.evaluate(
		async ({ fileBase64, hashAlgorithm, hashEncoding }) =>
			(
				globalThis as typeof globalThis & { browserHashApi: BrowserHashApi }
			).browserHashApi.hashFile(fileBase64, hashAlgorithm, hashEncoding),
		{
			fileBase64: file.toString("base64"),
			hashAlgorithm: algorithm,
			hashEncoding: encoding,
		},
	);
}

async function browserGitHash(page: Page, file: Buffer): Promise<string> {
	return page.evaluate(
		async (fileBase64) =>
			(
				globalThis as typeof globalThis & { browserHashApi: BrowserHashApi }
			).browserHashApi.gitHashFile(fileBase64),
		file.toString("base64"),
	);
}

test.describe("Common-Utils", () => {
	test.describe("gitHashFile", () => {
		test("XML should Hash", async ({ page }) => {
			const expectedHash = "64056b04956fb446b4014cb8d159d2e2494ed0fc";
			expect(await gitHashFile(xmlFile)).toEqual(expectedHash);
			expect(await browserGitHash(page, xmlFile)).toEqual(expectedHash);
		});

		test("SVG should Hash", async ({ page }) => {
			const expectedHash = "c741e46ae4a5f1ca19debf0ac609aabc5fe94add";
			expect(await gitHashFile(svgFile)).toEqual(expectedHash);
			expect(await browserGitHash(page, svgFile)).toEqual(expectedHash);
		});

		test("AKA PDF should Hash", async ({ page }) => {
			const expectedHash = "f3423703f542852aa7f3d1a13e73f0de0d8c9c0f";
			expect(await gitHashFile(pdfFile)).toEqual(expectedHash);
			expect(await browserGitHash(page, pdfFile)).toEqual(expectedHash);
		});

		test("Grid GIF should Hash", async ({ page }) => {
			const expectedHash = "a7d63376bbcb05d0a6fa749594048c8ce6be23fb";
			expect(await gitHashFile(gifFile)).toEqual(expectedHash);
			expect(await browserGitHash(page, gifFile)).toEqual(expectedHash);
		});

		test("Hash is consistent", async ({ page }) => {
			expect(await gitHashFile(svgFile)).toEqual(await gitHashFile(svgFile));
			expect(await browserGitHash(page, svgFile)).toEqual(
				await browserGitHash(page, svgFile),
			);
		});
	});

	test.describe("hashFile", () => {
		test("SHA256 hashes match", async ({ page }) => {
			const expectedHash = "9b8abd0b90324ffce0b6a9630e5c4301972c364ed9aeb7e7329e424a4ae8a630";
			expect(await hashFile(svgFile, "SHA-256")).toEqual(expectedHash);
			expect(await browserHash(page, svgFile, "SHA-256", "hex")).toEqual(expectedHash);
		});

		test("base64 encoded hashes match", async ({ page }) => {
			const expectedSha1 = "4/nXhjtBQhhvXTNNSNq/cJgb4sQ=";
			expect(await hashFile(xmlFile, "SHA-1", "base64")).toEqual(expectedSha1);
			expect(await browserHash(page, xmlFile, "SHA-1", "base64")).toEqual(expectedSha1);

			const expectedSha256 = "QPQh34aj1TNmyo34aPDA0vMIU7r5QC/6KNgIzlLYiFY=";
			expect(await hashFile(pdfFile, "SHA-256", "base64")).toEqual(expectedSha256);
			expect(await browserHash(page, pdfFile, "SHA-256", "base64")).toEqual(expectedSha256);
		});
	});
});

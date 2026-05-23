import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vite-plus/test";

import {
	decodeApng,
	decodeApngFrames,
	fixtureSkeletonPath,
	importPackageApi,
	readPixel,
} from "../helpers.ts";

test("built package API renders the fixture to APNG", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-api-e2e-"));

	try {
		const outputPath = path.join(tempDirectory, "api.apng");
		const packageApi = await importPackageApi();
		const result = await packageApi.renderSpineToApng({
			outputPath,
			skeletonPath: fixtureSkeletonPath,
		});
		const decoded = decodeApng(await readFile(outputPath));

		expect(result).toMatchObject({
			animationName: "pulse",
			durationMs: 990,
			fps: 30,
			format: "apng",
			frameCount: 30,
			height: 64,
			width: 97,
		});
		expect(decoded).toEqual({
			frameCount: 30,
			height: 64,
			width: 97,
		});
	} finally {
		await rm(tempDirectory, { force: true, recursive: true });
	}
});

test("built package API applies explicit fps to sampling and metadata", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-api-fps-"));

	try {
		const outputPath = path.join(tempDirectory, "api-fps.apng");
		const packageApi = await importPackageApi();
		const result = await packageApi.renderSpineToApng({
			fps: 12,
			outputPath,
			skeletonPath: fixtureSkeletonPath,
		});
		const decoded = decodeApng(await readFile(outputPath));

		expect(result).toMatchObject({
			durationMs: 996,
			fps: 12,
			frameCount: 12,
		});
		expect(decoded.frameCount).toBe(result.frameCount);
	} finally {
		await rm(tempDirectory, { force: true, recursive: true });
	}
});

test("built package API can override viewport size while keeping transparency by default", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-api-viewport-"));

	try {
		const outputPath = path.join(tempDirectory, "api-viewport.apng");
		const packageApi = await importPackageApi();
		const result = await packageApi.renderSpineToApng({
			height: 80,
			outputPath,
			skeletonPath: fixtureSkeletonPath,
			width: 120,
		});
		const decoded = decodeApngFrames(await readFile(outputPath));

		expect(result).toMatchObject({
			height: 80,
			width: 120,
		});
		expect(decoded.height).toBe(result.height);
		expect(decoded.width).toBe(result.width);
		expect(readPixel(decoded.frames[0], decoded.width, 32, 32)[3]).toBeGreaterThan(0);
		expect(
			readPixel(decoded.frames[0], decoded.width, decoded.width - 1, decoded.height - 1),
		).toEqual([0, 0, 0, 0]);
	} finally {
		await rm(tempDirectory, { force: true, recursive: true });
	}
});

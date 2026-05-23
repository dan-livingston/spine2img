import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vite-plus/test";

import {
	decodeApng,
	decodeApngFrames,
	decodeWebpFrames,
	fixtureSkeletonPath,
	importPackageApi,
	readInstalledPackageJson,
	readPixel,
} from "../helpers.ts";

test("packed package exposes the stable public contract", async () => {
	const packageApi = await importPackageApi();
	const packageJson = await readInstalledPackageJson();

	expect(Object.keys(packageApi).sort()).toEqual([
		"OutputCollisionError",
		"SpineInputResolutionError",
		"SpineSelectionError",
		"isOutputCollisionError",
		"isRenderSpineError",
		"isSpineInputResolutionError",
		"isSpineSelectionError",
		"renderSpine",
		"renderSpineToApng",
	]);
	expect(packageJson.bin).toEqual({
		spine2img: "./dist/bin.mjs",
	});
	expect(packageJson.exports).toEqual({
		".": {
			import: "./dist/index.mjs",
			types: "./dist/index.d.mts",
		},
		"./package.json": "./package.json",
	});
	expect(packageJson.files).toEqual(["dist"]);
	expect(packageJson.types).toBe("./dist/index.d.mts");
});

test("packed package API renders the fixture to APNG", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-api-e2e-"));

	try {
		const outputPath = path.join(tempDirectory, "api.apng");
		const packageApi = await importPackageApi();
		const result = await packageApi.renderSpine({
			format: "apng",
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
		expect(packageApi.renderSpineToApng).toBeTypeOf("function");
	} finally {
		await rm(tempDirectory, { force: true, recursive: true });
	}
});

test("packed package API renders the fixture to lossless animated WebP", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-api-webp-"));

	try {
		const outputPath = path.join(tempDirectory, "api.webp");
		const packageApi = await importPackageApi();
		const result = await packageApi.renderSpine({
			format: "webp",
			outputPath,
			skeletonPath: fixtureSkeletonPath,
		});
		const decoded = await decodeWebpFrames(await readFile(outputPath));

		expect(result).toMatchObject({
			animationName: "pulse",
			durationMs: 990,
			fps: 30,
			format: "webp",
			frameCount: 30,
			height: 64,
			width: 97,
		});
		expect(decoded.format).toBe("webp");
		expect(decoded.delay).toEqual(Array.from({ length: result.frameCount }, () => 33));
		expect(decoded.frames).toHaveLength(result.frameCount);
		expect(decoded.height).toBe(result.height);
		expect(decoded.loop).toBe(0);
		expect(decoded.width).toBe(result.width);
		expect(
			readPixel(decoded.frames[0], decoded.width, decoded.width - 1, decoded.height - 1),
		).toEqual([0, 0, 0, 0]);
	} finally {
		await rm(tempDirectory, { force: true, recursive: true });
	}
});

test("packed package API applies explicit fps to sampling and metadata", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-api-fps-"));

	try {
		const outputPath = path.join(tempDirectory, "api-fps.apng");
		const packageApi = await importPackageApi();
		const result = await packageApi.renderSpine({
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

test("packed package API keeps the APNG alias working for compatibility", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-api-alias-"));

	try {
		const outputPath = path.join(tempDirectory, "api-alias.apng");
		const packageApi = await importPackageApi();
		const result = await packageApi.renderSpineToApng({
			outputPath,
			skeletonPath: fixtureSkeletonPath,
		});

		expect(result.format).toBe("apng");
		expect(result.outputPath).toBe(outputPath);
	} finally {
		await rm(tempDirectory, { force: true, recursive: true });
	}
});

test("packed package API can override viewport size while keeping transparency by default", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-api-viewport-"));

	try {
		const outputPath = path.join(tempDirectory, "api-viewport.apng");
		const packageApi = await importPackageApi();
		const result = await packageApi.renderSpine({
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

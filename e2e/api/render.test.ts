import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vite-plus/test";

import {
	createNoisyFixture,
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
		"RenderOptionValidationError",
		"SpineInputResolutionError",
		"SpineSelectionError",
		"isOutputCollisionError",
		"isRenderOptionValidationError",
		"isRenderSpineError",
		"isSpineInputResolutionError",
		"isSpineSelectionError",
		"renderSpine",
		"renderSpineToApng",
		"renderSpineToWebp",
		"renderSpineVariations",
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
			lossless: true,
			width: 97,
		});
		expect(result).not.toHaveProperty("quality");
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
			lossless: true,
			width: 97,
		});
		expect(result).not.toHaveProperty("quality");
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

test("packed package API renders smaller lossy WebP output when requested", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-api-lossy-webp-"));

	try {
		const packageApi = await importPackageApi();
		const fixtureCopyDirectory = await createNoisyFixture(tempDirectory);
		const losslessOutputPath = path.join(tempDirectory, "lossless.webp");
		const lossyOutputPath = path.join(tempDirectory, "lossy.webp");
		await packageApi.renderSpine({
			format: "webp",
			outputPath: losslessOutputPath,
			skeletonPath: path.join(fixtureCopyDirectory, "box.json"),
		});
		const result = await packageApi.renderSpine({
			format: "webp",
			lossless: false,
			outputPath: lossyOutputPath,
			skeletonPath: path.join(fixtureCopyDirectory, "box.json"),
		});
		const losslessBytes = await readFile(losslessOutputPath);
		const lossyBytes = await readFile(lossyOutputPath);
		const decoded = await decodeWebpFrames(lossyBytes);

		expect(lossyBytes.byteLength).toBeLessThan(losslessBytes.byteLength);
		expect(result).toMatchObject({
			format: "webp",
			lossless: false,
			quality: 80,
		});
		expect(decoded.format).toBe("webp");
		expect(decoded.frames).toHaveLength(30);
	} finally {
		await rm(tempDirectory, { force: true, recursive: true });
	}
});

test("packed package API uses quality to tune lossy WebP size", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-api-webp-quality-"));

	try {
		const packageApi = await importPackageApi();
		const fixtureCopyDirectory = await createNoisyFixture(tempDirectory);
		const lowQualityOutputPath = path.join(tempDirectory, "quality-20.webp");
		const highQualityOutputPath = path.join(tempDirectory, "quality-90.webp");
		const lowQualityResult = await packageApi.renderSpine({
			format: "webp",
			lossless: false,
			outputPath: lowQualityOutputPath,
			quality: 20,
			skeletonPath: path.join(fixtureCopyDirectory, "box.json"),
		});
		const highQualityResult = await packageApi.renderSpine({
			format: "webp",
			lossless: false,
			outputPath: highQualityOutputPath,
			quality: 90,
			skeletonPath: path.join(fixtureCopyDirectory, "box.json"),
		});

		expect(lowQualityResult).toMatchObject({
			format: "webp",
			lossless: false,
			quality: 20,
		});
		expect(highQualityResult).toMatchObject({
			format: "webp",
			lossless: false,
			quality: 90,
		});
		expect((await readFile(lowQualityOutputPath)).byteLength).toBeLessThan(
			(await readFile(highQualityOutputPath)).byteLength,
		);
	} finally {
		await rm(tempDirectory, { force: true, recursive: true });
	}
});

test("packed package API infers WebP from a .webp output path", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-api-infer-webp-"));

	try {
		const outputPath = path.join(tempDirectory, "api-inferred.webp");
		const packageApi = await importPackageApi();
		const result = await packageApi.renderSpine({
			outputPath,
			skeletonPath: fixtureSkeletonPath,
		});
		const decoded = await decodeWebpFrames(await readFile(outputPath));

		expect(result.format).toBe("webp");
		expect(decoded.format).toBe("webp");
		expect(decoded.frames).toHaveLength(result.frameCount);
	} finally {
		await rm(tempDirectory, { force: true, recursive: true });
	}
});

test("packed package API infers APNG from .png and .apng output paths", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-api-infer-apng-"));

	try {
		const packageApi = await importPackageApi();
		const pngOutputPath = path.join(tempDirectory, "api-inferred.png");
		const apngOutputPath = path.join(tempDirectory, "api-inferred.apng");
		const pngResult = await packageApi.renderSpine({
			outputPath: pngOutputPath,
			skeletonPath: fixtureSkeletonPath,
		});
		const apngResult = await packageApi.renderSpine({
			outputPath: apngOutputPath,
			skeletonPath: fixtureSkeletonPath,
		});
		const pngDecoded = decodeApng(await readFile(pngOutputPath));
		const apngDecoded = decodeApng(await readFile(apngOutputPath));

		expect(pngResult.format).toBe("apng");
		expect(apngResult.format).toBe("apng");
		expect(pngDecoded.frameCount).toBe(pngResult.frameCount);
		expect(apngDecoded.frameCount).toBe(apngResult.frameCount);
	} finally {
		await rm(tempDirectory, { force: true, recursive: true });
	}
});

test("packed package API lets an explicit format override a contradictory extension", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-api-format-override-"));

	try {
		const outputPath = path.join(tempDirectory, "api-override.apng");
		const packageApi = await importPackageApi();
		const result = await packageApi.renderSpine({
			format: "webp",
			outputPath,
			skeletonPath: fixtureSkeletonPath,
		});
		const decoded = await decodeWebpFrames(await readFile(outputPath));

		expect(result.format).toBe("webp");
		expect(decoded.format).toBe("webp");
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

test("packed package API exposes the WebP alias with WebP result metadata", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-api-webp-alias-"));

	try {
		const outputPath = path.join(tempDirectory, "api-alias.webp");
		const packageApi = await importPackageApi();
		const result = await packageApi.renderSpineToWebp({
			lossless: false,
			outputPath,
			quality: 27,
			skeletonPath: fixtureSkeletonPath,
		});

		expect(result).toMatchObject({
			format: "webp",
			lossless: false,
			outputPath,
			quality: 27,
		});
	} finally {
		await rm(tempDirectory, { force: true, recursive: true });
	}
});

test("packed package API defaults the WebP alias to lossless output", async () => {
	const tempDirectory = await mkdtemp(
		path.join(os.tmpdir(), "spine2img-api-webp-alias-lossless-"),
	);

	try {
		const outputPath = path.join(tempDirectory, "api-alias-lossless.webp");
		const packageApi = await importPackageApi();
		const result = await packageApi.renderSpineToWebp({
			outputPath,
			skeletonPath: fixtureSkeletonPath,
		});
		const decoded = await decodeWebpFrames(await readFile(outputPath));

		expect(result).toMatchObject({
			format: "webp",
			lossless: true,
			outputPath,
		});
		expect(result).not.toHaveProperty("quality");
		expect(decoded.format).toBe("webp");
		expect(decoded.frames).toHaveLength(result.frameCount);
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

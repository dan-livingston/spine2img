import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vite-plus/test";

import {
	animatedFormatCases,
	createNoisyFixture,
	decodeAnimation,
	decodeApng,
	decodeApngFrames,
	decodeLoop,
	decodeWebpFrames,
	fixtureSkeletonPath,
	readPixel,
	runCli,
} from "../helpers.ts";

test("packed package CLI renders the fixture to APNG", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-cli-e2e-"));

	try {
		const outputPath = path.join(tempDirectory, "cli.apng");
		const { stdout } = await runCli(["render", fixtureSkeletonPath, outputPath]);
		const decoded = decodeApng(await readFile(outputPath));

		expect(stdout).toContain("Rendered pulse");
		expect(decoded).toEqual({
			frameCount: 30,
			height: 64,
			width: 97,
		});
	} finally {
		await rm(tempDirectory, { force: true, recursive: true });
	}
});

test("packed package CLI renders the fixture to lossless animated WebP", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-cli-webp-render-"));

	try {
		const outputPath = path.join(tempDirectory, "cli.webp");
		const { stdout } = await runCli(["render", fixtureSkeletonPath, outputPath]);
		const decoded = await decodeWebpFrames(await readFile(outputPath));

		expect(stdout).toContain("Rendered pulse");
		expect(decoded.format).toBe("webp");
		expect(decoded.delay).toEqual(Array.from({ length: 30 }, () => 33));
		expect(decoded.frames).toHaveLength(30);
		expect(decoded.height).toBe(64);
		expect(decoded.loop).toBe(0);
		expect(decoded.width).toBe(97);
		expect(
			readPixel(decoded.frames[0], decoded.width, decoded.width - 1, decoded.height - 1),
		).toEqual([0, 0, 0, 0]);
	} finally {
		await rm(tempDirectory, { force: true, recursive: true });
	}
});

describe.each(animatedFormatCases)(
	"packed package CLI can print structured JSON metadata for $format output",
	({ extension, format }) => {
		test("json output reports the rendered artifact", async () => {
			const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-cli-json-"));

			try {
				const outputPath = path.join(tempDirectory, `cli-json.${extension}`);
				const { stdout } = await runCli([
					"render",
					fixtureSkeletonPath,
					outputPath,
					"--fps",
					"12",
					"--json",
				]);
				const result = JSON.parse(stdout) as {
					animationName: string;
					durationMs: number;
					fps: number;
					frameCount: number;
					format: string;
					height: number;
					lossless: boolean;
					outputPath: string;
					quality?: number;
					width: number;
				};
				const decoded = await decodeAnimation(await readFile(outputPath), format);

				expect(result).toMatchObject({
					animationName: "pulse",
					durationMs: 996,
					fps: 12,
					format,
					frameCount: 12,
					height: 64,
					lossless: true,
					outputPath,
					width: 97,
				});
				expect(result).not.toHaveProperty("quality");
				expect(decoded.frameCount).toBe(result.frameCount);
				expect(decoded.height).toBe(result.height);
				expect(decoded.width).toBe(result.width);
			} finally {
				await rm(tempDirectory, { force: true, recursive: true });
			}
		});
	},
);

describe.each(animatedFormatCases)(
	"packed package CLI embeds --loop for $format output",
	({ extension, format }) => {
		test("--loop 1 produces a play-once file while omitting it stays infinite", async () => {
			const tempDirectory = await mkdtemp(
				path.join(os.tmpdir(), `spine2img-cli-loop-${format}-`),
			);

			try {
				const playOncePath = path.join(tempDirectory, `play-once.${extension}`);
				const infinitePath = path.join(tempDirectory, `infinite.${extension}`);
				const { stdout } = await runCli([
					"render",
					fixtureSkeletonPath,
					playOncePath,
					"--loop",
					"1",
					"--json",
				]);
				await runCli(["render", fixtureSkeletonPath, infinitePath]);
				const result = JSON.parse(stdout) as { loop: number };

				expect(result.loop).toBe(1);
				expect(await decodeLoop(await readFile(playOncePath), format)).toBe(1);
				expect(await decodeLoop(await readFile(infinitePath), format)).toBe(0);
			} finally {
				await rm(tempDirectory, { force: true, recursive: true });
			}
		});
	},
);

test("packed package CLI maps lossy WebP flags through to the encoder", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-cli-lossy-webp-"));

	try {
		const fixtureCopyDirectory = await createNoisyFixture(tempDirectory);
		const skeletonPath = path.join(fixtureCopyDirectory, "box.json");
		const losslessOutputPath = path.join(tempDirectory, "lossless.webp");
		const lowQualityOutputPath = path.join(tempDirectory, "quality-20.webp");
		const highQualityOutputPath = path.join(tempDirectory, "quality-90.webp");
		await runCli(["render", skeletonPath, losslessOutputPath]);
		await runCli([
			"render",
			skeletonPath,
			lowQualityOutputPath,
			"--no-lossless",
			"--quality",
			"20",
		]);
		await runCli([
			"render",
			skeletonPath,
			highQualityOutputPath,
			"--no-lossless",
			"--quality",
			"90",
		]);
		const losslessBytes = await readFile(losslessOutputPath);
		const lowQualityBytes = await readFile(lowQualityOutputPath);
		const highQualityBytes = await readFile(highQualityOutputPath);
		const decoded = await decodeWebpFrames(lowQualityBytes);

		expect(lowQualityBytes.byteLength).toBeLessThan(losslessBytes.byteLength);
		expect(lowQualityBytes.byteLength).toBeLessThan(highQualityBytes.byteLength);
		expect(decoded.format).toBe("webp");
		expect(decoded.frames).toHaveLength(30);
	} finally {
		await rm(tempDirectory, { force: true, recursive: true });
	}
});

test("packed package CLI includes effective lossy WebP metadata in JSON output", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-cli-webp-json-"));

	try {
		const outputPath = path.join(tempDirectory, "cli-lossy.webp");
		const { stdout } = await runCli([
			"render",
			fixtureSkeletonPath,
			outputPath,
			"--no-lossless",
			"--quality",
			"27",
			"--json",
		]);
		const result = JSON.parse(stdout) as {
			format: string;
			lossless: boolean;
			outputPath: string;
			quality?: number;
		};

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

test("packed package CLI lets --format override extension inference", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-cli-format-override-"));

	try {
		const outputPath = path.join(tempDirectory, "cli-override.webp");
		const { stdout } = await runCli([
			"render",
			fixtureSkeletonPath,
			outputPath,
			"--format",
			"apng",
			"--json",
		]);
		const result = JSON.parse(stdout) as { format: string; frameCount: number };
		const decoded = decodeApng(await readFile(outputPath));

		expect(result.format).toBe("apng");
		expect(decoded.frameCount).toBe(result.frameCount);
	} finally {
		await rm(tempDirectory, { force: true, recursive: true });
	}
});

test("packed package CLI can apply explicit size and background color", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-cli-background-"));

	try {
		const outputPath = path.join(tempDirectory, "cli-background.apng");
		const { stdout } = await runCli([
			"render",
			fixtureSkeletonPath,
			outputPath,
			"--width",
			"120",
			"--height",
			"80",
			"--background",
			"#336699",
			"--json",
		]);
		const result = JSON.parse(stdout) as {
			height: number;
			width: number;
		};
		const decoded = decodeApngFrames(await readFile(outputPath));

		expect(result).toMatchObject({
			height: 80,
			width: 120,
		});
		expect(readPixel(decoded.frames[0], decoded.width, 32, 32)[3]).toBeGreaterThan(0);
		expect(
			readPixel(decoded.frames[0], decoded.width, decoded.width - 1, decoded.height - 1),
		).toEqual([51, 102, 153, 255]);
	} finally {
		await rm(tempDirectory, { force: true, recursive: true });
	}
});

import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vite-plus/test";

import {
	decodeApng,
	decodeApngFrames,
	fixtureSkeletonPath,
	readPixel,
	runCli,
} from "../helpers.ts";

test("packed package CLI renders the same fixture", async () => {
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

test("packed package CLI can print structured result metadata as JSON", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-cli-json-"));

	try {
		const outputPath = path.join(tempDirectory, "cli-json.apng");
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
			outputPath: string;
			width: number;
		};
		const decoded = decodeApng(await readFile(outputPath));

		expect(result).toMatchObject({
			animationName: "pulse",
			durationMs: 996,
			fps: 12,
			format: "apng",
			frameCount: 12,
			height: 64,
			outputPath,
			width: 97,
		});
		expect(decoded.frameCount).toBe(result.frameCount);
		expect(decoded.height).toBe(result.height);
		expect(decoded.width).toBe(result.width);
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

import { toArrayBuffer } from "#/lib/to-array-buffer.ts";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import UPNG from "upng-js";
import { beforeAll, expect, test } from "vite-plus/test";

const execFileAsync = promisify(execFile);
const rootDirectory = path.resolve(new URL("..", import.meta.url).pathname);
const fixtureDirectory = path.join(rootDirectory, "fixtures", "tracer-bullet");
const fixtureSkeletonPath = path.join(fixtureDirectory, "box.json");
const fixtureAtlasPath = path.join(fixtureDirectory, "box.atlas");

beforeAll(async () => {
	await execFileAsync("pnpm", ["build"], {
		cwd: rootDirectory,
	});
});

test("built package API renders the fixture to APNG", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-api-e2e-"));

	try {
		const outputPath = path.join(tempDirectory, "api.apng");
		const packageApi = await import(
			pathToFileURL(path.join(rootDirectory, "dist", "index.mjs")).href
		);
		const result = await packageApi.renderSpineToApng({
			atlasPath: fixtureAtlasPath,
			outputPath,
			skeletonPath: fixtureSkeletonPath,
		});
		const decoded = decodeApng(await readFile(outputPath));

		expect(result).toMatchObject({
			animationName: "pulse",
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

test("built package CLI renders the same fixture", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-cli-e2e-"));

	try {
		const outputPath = path.join(tempDirectory, "cli.apng");
		const { stdout } = await execFileAsync(
			"node",
			[
				path.join(rootDirectory, "dist", "bin.mjs"),
				"render",
				fixtureSkeletonPath,
				fixtureAtlasPath,
				outputPath,
			],
			{
				cwd: rootDirectory,
			},
		);
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

function decodeApng(file: Uint8Array) {
	const decoded = UPNG.decode(toArrayBuffer(file));

	return {
		frameCount: UPNG.toRGBA8(decoded).length,
		height: decoded.height,
		width: decoded.width,
	};
}

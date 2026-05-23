import { toArrayBuffer } from "#/lib/to-array-buffer.ts";
import { execFile } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

test("built package API throws typed errors for missing default atlas input", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-api-missing-atlas-"));

	try {
		const fixtureCopyDirectory = path.join(tempDirectory, "fixture");
		await cp(fixtureDirectory, fixtureCopyDirectory, { recursive: true });
		await rm(path.join(fixtureCopyDirectory, "box.atlas"));

		const packageApi = await import(
			pathToFileURL(path.join(rootDirectory, "dist", "index.mjs")).href
		);

		let error: unknown;

		try {
			await packageApi.renderSpineToApng({
				outputPath: path.join(tempDirectory, "missing.apng"),
				skeletonPath: path.join(fixtureCopyDirectory, "box.json"),
			});
		} catch (caught) {
			error = caught;
		}

		expect(error).toBeInstanceOf(packageApi.SpineInputResolutionError);
		expect(error).toMatchObject({
			assetType: "atlas",
			code: "missing-asset",
		});
	} finally {
		await rm(tempDirectory, { force: true, recursive: true });
	}
});

test("built package API throws typed errors for inconsistent skeleton and atlas inputs", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-api-inconsistent-"));

	try {
		const fixtureCopyDirectory = path.join(tempDirectory, "fixture");
		const skeletonPath = path.join(fixtureCopyDirectory, "box.json");
		await cp(fixtureDirectory, fixtureCopyDirectory, { recursive: true });
		await writeFile(
			skeletonPath,
			(await readFile(skeletonPath, "utf8")).replace('"path": "box"', '"path": "missing"'),
		);

		const packageApi = await import(
			pathToFileURL(path.join(rootDirectory, "dist", "index.mjs")).href
		);

		let error: unknown;

		try {
			await packageApi.renderSpineToApng({
				outputPath: path.join(tempDirectory, "inconsistent.apng"),
				skeletonPath,
			});
		} catch (caught) {
			error = caught;
		}

		expect(error).toBeInstanceOf(packageApi.SpineInputResolutionError);
		expect(error).toMatchObject({
			assetType: "bundle",
			code: "inconsistent-assets",
		});
	} finally {
		await rm(tempDirectory, { force: true, recursive: true });
	}
});

test("built package API throws typed errors for a missing texture referenced by the atlas", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-api-missing-texture-"));

	try {
		const fixtureCopyDirectory = path.join(tempDirectory, "fixture");
		await cp(fixtureDirectory, fixtureCopyDirectory, { recursive: true });
		await rm(path.join(fixtureCopyDirectory, "box.png"));

		const packageApi = await import(
			pathToFileURL(path.join(rootDirectory, "dist", "index.mjs")).href
		);

		let error: unknown;

		try {
			await packageApi.renderSpineToApng({
				outputPath: path.join(tempDirectory, "missing-texture.apng"),
				skeletonPath: path.join(fixtureCopyDirectory, "box.json"),
			});
		} catch (caught) {
			error = caught;
		}

		expect(error).toBeInstanceOf(packageApi.SpineInputResolutionError);
		expect(error).toMatchObject({
			assetType: "texture",
			code: "missing-asset",
		});
	} finally {
		await rm(tempDirectory, { force: true, recursive: true });
	}
});

test("built package API throws typed errors for malformed skeleton JSON", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-api-invalid-skeleton-"));

	try {
		const fixtureCopyDirectory = path.join(tempDirectory, "fixture");
		const skeletonPath = path.join(fixtureCopyDirectory, "box.json");
		await cp(fixtureDirectory, fixtureCopyDirectory, { recursive: true });
		await writeFile(skeletonPath, "{ not valid json");

		const packageApi = await import(
			pathToFileURL(path.join(rootDirectory, "dist", "index.mjs")).href
		);

		let error: unknown;

		try {
			await packageApi.renderSpineToApng({
				outputPath: path.join(tempDirectory, "invalid-skeleton.apng"),
				skeletonPath,
			});
		} catch (caught) {
			error = caught;
		}

		expect(error).toBeInstanceOf(packageApi.SpineInputResolutionError);
		expect(error).toMatchObject({
			assetType: "skeleton",
			code: "invalid-asset",
		});
	} finally {
		await rm(tempDirectory, { force: true, recursive: true });
	}
});

test("built package CLI prints friendly typed input errors", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-cli-error-"));

	try {
		const fixtureCopyDirectory = path.join(tempDirectory, "fixture");
		await cp(fixtureDirectory, fixtureCopyDirectory, { recursive: true });
		await rm(path.join(fixtureCopyDirectory, "box.atlas"));

		let error: unknown;

		try {
			await execFileAsync(
				"node",
				[
					path.join(rootDirectory, "dist", "bin.mjs"),
					"render",
					path.join(fixtureCopyDirectory, "box.json"),
					path.join(tempDirectory, "cli-error.apng"),
				],
				{
					cwd: rootDirectory,
				},
			);
		} catch (caught) {
			error = caught;
		}

		expect(error).toBeInstanceOf(Error);
		expect((error as { stderr?: string }).stderr).toContain("Missing atlas input:");
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

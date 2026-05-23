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
		const packageApi = await import(
			pathToFileURL(path.join(rootDirectory, "dist", "index.mjs")).href
		);
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
		const packageApi = await import(
			pathToFileURL(path.join(rootDirectory, "dist", "index.mjs")).href
		);
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

test("built package API validates viewport options before loading the scene", async () => {
	const packageApi = await import(
		pathToFileURL(path.join(rootDirectory, "dist", "index.mjs")).href
	);
	const unreadableSkeletonPath = path.join(os.tmpdir(), "spine2img-missing", "box.json");
	const unusedOutputPath = path.join(os.tmpdir(), "spine2img-never-written.apng");

	await expect(
		packageApi.renderSpineToApng({
			outputPath: unusedOutputPath,
			skeletonPath: unreadableSkeletonPath,
			width: -5,
		}),
	).rejects.toThrow("width must be a positive integer. Received -5.");

	await expect(
		packageApi.renderSpineToApng({
			height: 80.5,
			outputPath: unusedOutputPath,
			skeletonPath: unreadableSkeletonPath,
		}),
	).rejects.toThrow("height must be a positive integer. Received 80.5.");

	await expect(
		packageApi.renderSpineToApng({
			backgroundColor: "red",
			outputPath: unusedOutputPath,
			skeletonPath: unreadableSkeletonPath,
		}),
	).rejects.toThrow(
		"backgroundColor must be a hex color like #rgb, #rgba, #rrggbb, or #rrggbbaa. Received red.",
	);
});

test("built package API renders a selected animation and skin", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-api-selection-"));

	try {
		const fixtureCopyDirectory = await createSelectableFixture(tempDirectory);
		const skeletonPath = path.join(fixtureCopyDirectory, "box.json");
		const altOutputPath = path.join(tempDirectory, "selected-alt.apng");
		const defaultOutputPath = path.join(tempDirectory, "selected-default.apng");
		const packageApi = await import(
			pathToFileURL(path.join(rootDirectory, "dist", "index.mjs")).href
		);
		const altResult = await packageApi.renderSpineToApng({
			animationName: "pulse-short",
			outputPath: altOutputPath,
			skeletonPath,
			skinName: "alt",
		});
		const defaultResult = await packageApi.renderSpineToApng({
			animationName: "pulse-short",
			outputPath: defaultOutputPath,
			skeletonPath,
		});
		const decodedAlt = decodeApng(await readFile(altOutputPath));

		expect(altResult).toMatchObject({
			animationName: "pulse-short",
			format: "apng",
			frameCount: 15,
			skinName: "alt",
		});
		expect(defaultResult.skinName).toBeUndefined();
		// The alt skin swaps in a smaller box, so selecting it must shrink the
		// rendered bounds relative to the default skin.
		expect(altResult.width).toBeLessThan(defaultResult.width);
		expect(altResult.height).toBeLessThan(defaultResult.height);
		expect(decodedAlt).toEqual({
			frameCount: altResult.frameCount,
			height: altResult.height,
			width: altResult.width,
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

test("built package CLI can print structured result metadata as JSON", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-cli-json-"));

	try {
		const outputPath = path.join(tempDirectory, "cli-json.apng");
		const { stdout } = await execFileAsync(
			"node",
			[
				path.join(rootDirectory, "dist", "bin.mjs"),
				"render",
				fixtureSkeletonPath,
				outputPath,
				"--fps",
				"12",
				"--json",
			],
			{
				cwd: rootDirectory,
			},
		);
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

test("built package CLI can apply explicit size and background color", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-cli-background-"));

	try {
		const outputPath = path.join(tempDirectory, "cli-background.apng");
		const { stdout } = await execFileAsync(
			"node",
			[
				path.join(rootDirectory, "dist", "bin.mjs"),
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
			],
			{
				cwd: rootDirectory,
			},
		);
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

test("built package API throws typed errors for missing animation selections", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-api-animation-error-"));

	try {
		const fixtureCopyDirectory = await createSelectableFixture(tempDirectory);
		const packageApi = await import(
			pathToFileURL(path.join(rootDirectory, "dist", "index.mjs")).href
		);

		let error: unknown;

		try {
			await packageApi.renderSpineToApng({
				animationName: "missing",
				outputPath: path.join(tempDirectory, "missing-animation.apng"),
				skeletonPath: path.join(fixtureCopyDirectory, "box.json"),
			});
		} catch (caught) {
			error = caught;
		}

		expect(error).toBeInstanceOf(packageApi.SpineSelectionError);
		expect(error).toMatchObject({
			availableNames: ["pulse", "pulse-short"],
			code: "missing-selection",
			requestedName: "missing",
			selectionType: "animation",
		});
	} finally {
		await rm(tempDirectory, { force: true, recursive: true });
	}
});

test("built package API throws typed errors for missing skin selections", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-api-skin-error-"));

	try {
		const fixtureCopyDirectory = await createSelectableFixture(tempDirectory);
		const packageApi = await import(
			pathToFileURL(path.join(rootDirectory, "dist", "index.mjs")).href
		);

		let error: unknown;

		try {
			await packageApi.renderSpineToApng({
				outputPath: path.join(tempDirectory, "missing-skin.apng"),
				skeletonPath: path.join(fixtureCopyDirectory, "box.json"),
				skinName: "missing",
			});
		} catch (caught) {
			error = caught;
		}

		expect(error).toBeInstanceOf(packageApi.SpineSelectionError);
		expect(error).toMatchObject({
			availableNames: ["default", "alt"],
			code: "missing-selection",
			requestedName: "missing",
			selectionType: "skin",
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

test("built package CLI prints friendly animation lookup errors", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-cli-animation-error-"));

	try {
		const fixtureCopyDirectory = await createSelectableFixture(tempDirectory);

		let error: unknown;

		try {
			await execFileAsync(
				"node",
				[
					path.join(rootDirectory, "dist", "bin.mjs"),
					"render",
					path.join(fixtureCopyDirectory, "box.json"),
					path.join(tempDirectory, "cli-animation-error.apng"),
					"--animation",
					"missing",
				],
				{
					cwd: rootDirectory,
				},
			);
		} catch (caught) {
			error = caught;
		}

		expect(error).toBeInstanceOf(Error);
		expect((error as { stderr?: string }).stderr).toContain('Unknown animation "missing"');
		expect((error as { stderr?: string }).stderr).toContain(
			"Available animations: pulse, pulse-short.",
		);
	} finally {
		await rm(tempDirectory, { force: true, recursive: true });
	}
});

test("built package CLI prints friendly skin lookup errors", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-cli-skin-error-"));

	try {
		const fixtureCopyDirectory = await createSelectableFixture(tempDirectory);

		let error: unknown;

		try {
			await execFileAsync(
				"node",
				[
					path.join(rootDirectory, "dist", "bin.mjs"),
					"render",
					path.join(fixtureCopyDirectory, "box.json"),
					path.join(tempDirectory, "cli-skin-error.apng"),
					"--skin",
					"missing",
				],
				{
					cwd: rootDirectory,
				},
			);
		} catch (caught) {
			error = caught;
		}

		expect(error).toBeInstanceOf(Error);
		expect((error as { stderr?: string }).stderr).toContain('Unknown skin "missing"');
		expect((error as { stderr?: string }).stderr).toContain("Available skins: default, alt.");
	} finally {
		await rm(tempDirectory, { force: true, recursive: true });
	}
});

test("built package CLI reports (none) when the skeleton defines no skins", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-cli-no-skins-"));

	try {
		const fixtureCopyDirectory = path.join(tempDirectory, "fixture");
		const skeletonPath = path.join(fixtureCopyDirectory, "box.json");
		await cp(fixtureDirectory, fixtureCopyDirectory, { recursive: true });
		const skeleton = JSON.parse(await readFile(skeletonPath, "utf8")) as { skins: unknown[] };
		skeleton.skins = [];
		await writeFile(skeletonPath, `${JSON.stringify(skeleton, null, "\t")}\n`);

		let error: unknown;

		try {
			await execFileAsync(
				"node",
				[
					path.join(rootDirectory, "dist", "bin.mjs"),
					"render",
					skeletonPath,
					path.join(tempDirectory, "cli-no-skins.apng"),
					"--skin",
					"missing",
				],
				{
					cwd: rootDirectory,
				},
			);
		} catch (caught) {
			error = caught;
		}

		expect(error).toBeInstanceOf(Error);
		expect((error as { stderr?: string }).stderr).toContain("Available skins: (none).");
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

function decodeApngFrames(file: Uint8Array) {
	const decoded = UPNG.decode(toArrayBuffer(file));

	return {
		frames: UPNG.toRGBA8(decoded).map((frame) => new Uint8Array(frame)),
		height: decoded.height,
		width: decoded.width,
	};
}

function readPixel(
	frame: Uint8Array,
	width: number,
	x: number,
	y: number,
): [number, number, number, number] {
	const offset = (y * width + x) * 4;

	return [
		frame[offset] ?? 0,
		frame[offset + 1] ?? 0,
		frame[offset + 2] ?? 0,
		frame[offset + 3] ?? 0,
	];
}

async function createSelectableFixture(tempDirectory: string): Promise<string> {
	const fixtureCopyDirectory = path.join(tempDirectory, "fixture");
	const skeletonPath = path.join(fixtureCopyDirectory, "box.json");
	await cp(fixtureDirectory, fixtureCopyDirectory, { recursive: true });

	const skeleton = JSON.parse(await readFile(skeletonPath, "utf8")) as {
		animations: Record<string, unknown>;
		skins: Array<{
			attachments: Record<string, unknown>;
			name: string;
		}>;
	};

	skeleton.animations["pulse-short"] = {
		bones: {
			bone: {
				translate: [
					{
						time: 0,
						x: -16,
						y: 0,
					},
					{
						time: 0.25,
						x: 16,
						y: 0,
					},
					{
						time: 0.5,
						x: -16,
						y: 0,
					},
				],
			},
		},
	};
	// Give "alt" a deliberately smaller box so selecting it changes the rendered
	// bounds — otherwise a test cannot tell "applied alt" from "ignored the skin".
	skeleton.skins.push({
		attachments: {
			box: {
				box: {
					type: "region",
					path: "box",
					width: 32,
					height: 32,
				},
			},
		},
		name: "alt",
	});

	await writeFile(skeletonPath, `${JSON.stringify(skeleton, null, "\t")}\n`);

	return fixtureCopyDirectory;
}

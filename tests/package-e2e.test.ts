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

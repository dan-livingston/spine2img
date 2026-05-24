import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vite-plus/test";

import {
	createRenderAllFixture,
	decodeApng,
	importPackageApi,
	MINIMAL_ANIMATION,
	renderAllFixtureSkeletonPath,
} from "../helpers.ts";

async function listingOrUndefined(directory: string): Promise<string[] | undefined> {
	try {
		return await readdir(directory);
	} catch {
		return undefined;
	}
}

test("packed package API fails fast on a skeleton with zero animations", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-api-no-animations-"));

	try {
		const outputDir = path.join(tempDirectory, "out");
		const skeletonPath = await createRenderAllFixture(tempDirectory, (skeleton) => {
			skeleton.animations = {};
		});
		const packageApi = await importPackageApi();

		let error: unknown;

		try {
			await packageApi.renderSpineVariations({ outputDir, skeletonPath });
		} catch (caught) {
			error = caught;
		}

		expect(error).toBeInstanceOf(packageApi.SpineInputResolutionError);
		expect(error).toMatchObject({ assetType: "skeleton", code: "no-animations" });
		// Fail-fast: nothing was rendered, so the output directory was never created.
		expect(await listingOrUndefined(outputDir)).toBeUndefined();
	} finally {
		await rm(tempDirectory, { force: true, recursive: true });
	}
});

test("packed package API fails fast listing every collision when overwrite is off", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-api-collision-"));

	try {
		const outputDir = path.join(tempDirectory, "out");
		const packageApi = await importPackageApi();
		await packageApi.renderSpineVariations({
			outputDir,
			skeletonPath: renderAllFixtureSkeletonPath,
			skinNames: ["alt"],
		});

		const idlePath = path.join(outputDir, "alt", "idle.apng");
		const originalIdle = await readFile(idlePath);

		let error: unknown;

		try {
			await packageApi.renderSpineVariations({
				outputDir,
				skeletonPath: renderAllFixtureSkeletonPath,
				skinNames: ["alt"],
			});
		} catch (caught) {
			error = caught;
		}

		expect(error).toBeInstanceOf(packageApi.OutputCollisionError);
		expect(error).toMatchObject({ code: "existing-output" });
		// Every one of the skin's three targets is reported, not just the first.
		const collisions = (error as { outputPaths?: string[] }).outputPaths ?? [];
		expect(collisions).toHaveLength(3);
		expect(collisions).toContain(idlePath);
		// The gate ran before any write, so the existing file is byte-for-byte intact.
		expect(await readFile(idlePath)).toEqual(originalIdle);
	} finally {
		await rm(tempDirectory, { force: true, recursive: true });
	}
});

test("packed package API overwrite replaces targets and leaves unrelated files alone", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-api-overwrite-batch-"));

	try {
		const outputDir = path.join(tempDirectory, "out");
		const packageApi = await importPackageApi();
		await packageApi.renderSpineVariations({
			outputDir,
			skeletonPath: renderAllFixtureSkeletonPath,
			skinNames: ["alt"],
		});

		// A stale target overwritten with junk, plus two files the run never generates:
		// one in <outDir>, one inside the skin directory.
		const idlePath = path.join(outputDir, "alt", "idle.apng");
		const unrelatedRoot = path.join(outputDir, "unrelated.txt");
		const unrelatedSkin = path.join(outputDir, "alt", "extra.txt");
		await writeFile(idlePath, Buffer.from("stale"));
		await writeFile(unrelatedRoot, Buffer.from("keep-root"));
		await writeFile(unrelatedSkin, Buffer.from("keep-skin"));

		const result = await packageApi.renderSpineVariations({
			outputDir,
			overwrite: true,
			skeletonPath: renderAllFixtureSkeletonPath,
			skinNames: ["alt"],
		});

		expect(result.succeeded).toHaveLength(3);
		expect(result.failed).toEqual([]);
		// The stale target was replaced with a real APNG.
		expect(decodeApng(await readFile(idlePath)).frameCount).toBe(30);
		// Files the run did not generate are untouched — never deleted, never clobbered.
		expect(await readFile(unrelatedRoot)).toEqual(Buffer.from("keep-root"));
		expect(await readFile(unrelatedSkin)).toEqual(Buffer.from("keep-skin"));
	} finally {
		await rm(tempDirectory, { force: true, recursive: true });
	}
});

test("packed package API collects one variation's failure and still renders the rest", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-api-partial-"));

	try {
		const outputDir = path.join(tempDirectory, "out");
		// A directory squatting on a target path makes that single write fail (EISDIR)
		// while its siblings render — a deterministic per-variation fault through the
		// real pipeline. Overwrite skips the upfront gate so the write is attempted.
		const idlePath = path.join(outputDir, "alt", "idle.apng");
		await mkdir(idlePath, { recursive: true });

		const packageApi = await importPackageApi();
		const result = await packageApi.renderSpineVariations({
			outputDir,
			overwrite: true,
			skeletonPath: renderAllFixtureSkeletonPath,
			skinNames: ["alt"],
		});

		expect(result.succeeded.map((entry) => entry.animationName).sort()).toEqual([
			"hover",
			"press",
		]);
		expect(result.failed).toHaveLength(1);
		expect(result.failed[0]).toMatchObject({
			animationName: "idle",
			outputPath: idlePath,
			skinName: "alt",
		});
		expect(result.failed[0]?.error).toBeInstanceOf(Error);

		// The healthy siblings landed on disk with the frame counts they reported.
		const hover = result.succeeded.find((entry) => entry.animationName === "hover");
		expect(
			decodeApng(await readFile(path.join(outputDir, "alt", "hover.apng"))).frameCount,
		).toBe(hover?.frameCount);
	} finally {
		await rm(tempDirectory, { force: true, recursive: true });
	}
});

test("packed package API turns a slash in an animation name into nested directories", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-api-nested-"));

	try {
		const outputDir = path.join(tempDirectory, "out");
		const skeletonPath = await createRenderAllFixture(tempDirectory, (skeleton) => {
			skeleton.animations["states/idle"] = MINIMAL_ANIMATION;
		});
		const packageApi = await importPackageApi();
		const result = await packageApi.renderSpineVariations({
			outputDir,
			skeletonPath,
			skinNames: ["alt"],
		});

		const nestedPath = path.join(outputDir, "alt", "states", "idle.apng");
		const nested = result.succeeded.find((entry) => entry.animationName === "states/idle");
		expect(nested?.outputPath).toBe(nestedPath);
		// The slash became a real directory on disk.
		expect(await readdir(path.join(outputDir, "alt", "states"))).toEqual(["idle.apng"]);
		expect(decodeApng(await readFile(nestedPath)).frameCount).toBeGreaterThan(0);
	} finally {
		await rm(tempDirectory, { force: true, recursive: true });
	}
});

test("packed package API rejects a traversal in an animation name before writing", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-api-escape-"));

	try {
		const outputDir = path.join(tempDirectory, "out");
		const skeletonPath = await createRenderAllFixture(tempDirectory, (skeleton) => {
			skeleton.animations["../../pwned"] = MINIMAL_ANIMATION;
		});
		const packageApi = await importPackageApi();

		let error: unknown;

		try {
			await packageApi.renderSpineVariations({
				outputDir,
				skeletonPath,
				skinNames: ["alt"],
			});
		} catch (caught) {
			error = caught;
		}

		expect(error).toBeInstanceOf(packageApi.OutputPathError);
		expect(error).toMatchObject({ code: "unsafe-output-path", unsafeName: "../../pwned" });
		// Rejected during planning: <outDir> was never created, and the file the name
		// would have escaped to (outside <outDir>) does not exist.
		expect(await listingOrUndefined(outputDir)).toBeUndefined();
		expect(await readdir(tempDirectory)).not.toContain("pwned.apng");
	} finally {
		await rm(tempDirectory, { force: true, recursive: true });
	}
});
